"use strict";

// Contacts: the people the search actually runs through -- recruiters,
// referrers, hiring managers. Before this existed they were filed as job
// applications, which inflated the pipeline and left the referral network
// with nowhere to live.

const db = require("../db");

class ServiceError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

const LIMITS = {
    name: 200,
    contact_role: 200,
    employer: 200,
    email: 320,
    phone: 50,
    notes: 10000,
    relation: 100,
};

const EDITABLE_FIELDS = [
    "name",
    "contact_role",
    "employer",
    "email",
    "phone",
    "notes",
];

function validateInputLengths(body, fields) {
    for (const field of fields) {
        if (body[field] && String(body[field]).length > LIMITS[field]) {
            return `${field} exceeds maximum length of ${LIMITS[field]} characters`;
        }
    }
    return null;
}

function getOwnContact(id, userEmail) {
    return db
        .prepare("SELECT * FROM contacts WHERE id = ? AND user_email = ?")
        .get(id, userEmail);
}

function getOwnApp(id, userEmail) {
    return db
        .prepare("SELECT * FROM applications WHERE id = ? AND user_email = ?")
        .get(id, userEmail);
}

// The records a contact is attached to, with the relation each link carries.
function linksForContact(contactId) {
    return db
        .prepare(
            `SELECT cl.id, cl.application_id, cl.relation, cl.created_at,
                    a.company_name, a.role_title, a.stage, a.state
             FROM contact_links cl
             JOIN applications a ON a.id = cl.application_id
             WHERE cl.contact_id = ?
             ORDER BY cl.created_at ASC`,
        )
        .all(contactId);
}

// The people attached to a record.
function contactsForApplication(applicationId) {
    return db
        .prepare(
            `SELECT c.id, c.name, c.contact_role, c.employer, c.email, c.phone,
                    cl.id AS link_id, cl.relation
             FROM contact_links cl
             JOIN contacts c ON c.id = cl.contact_id
             WHERE cl.application_id = ?
             ORDER BY c.name ASC`,
        )
        .all(applicationId);
}

function listContacts(userEmail, { all, isAdmin = false } = {}) {
    const showAll = isAdmin && all === "true";
    const rows = showAll
        ? db.prepare("SELECT * FROM contacts ORDER BY name ASC").all()
        : db
              .prepare(
                  "SELECT * FROM contacts WHERE user_email = ? ORDER BY name ASC",
              )
              .all(userEmail);
    return rows.map((c) => ({ ...c, links: linksForContact(c.id) }));
}

function getContact(userEmail, id, { isAdmin = false } = {}) {
    const contact = isAdmin
        ? db.prepare("SELECT * FROM contacts WHERE id = ?").get(id)
        : getOwnContact(id, userEmail);
    if (!contact) throw new ServiceError(404, "Not found");
    return { ...contact, links: linksForContact(contact.id) };
}

function createContact(userEmail, data) {
    const name = data.name && String(data.name).trim();
    if (!name) throw new ServiceError(400, "name is required");

    const lengthError = validateInputLengths(data, EDITABLE_FIELDS);
    if (lengthError) throw new ServiceError(400, lengthError);

    const result = db
        .prepare(
            `INSERT INTO contacts (name, contact_role, employer, email, phone, notes, user_email)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
            name,
            data.contact_role || null,
            data.employer || null,
            data.email || null,
            data.phone || null,
            data.notes || null,
            userEmail,
        );

    return getContact(userEmail, result.lastInsertRowid);
}

function updateContact(userEmail, id, data) {
    const existing = getOwnContact(id, userEmail);
    if (!existing) throw new ServiceError(404, "Not found");

    const lengthError = validateInputLengths(data, EDITABLE_FIELDS);
    if (lengthError) throw new ServiceError(400, lengthError);

    if (data.name !== undefined && !String(data.name).trim()) {
        throw new ServiceError(400, "name cannot be empty");
    }

    const updates = [];
    const values = [];
    for (const field of EDITABLE_FIELDS) {
        if (data[field] !== undefined) {
            updates.push(`${field} = ?`);
            values.push(data[field]);
        }
    }
    if (updates.length === 0) throw new ServiceError(400, "No fields to update");

    updates.push("updated_at = ?");
    values.push(new Date().toISOString(), id, userEmail);

    db.prepare(
        `UPDATE contacts SET ${updates.join(", ")} WHERE id = ? AND user_email = ?`,
    ).run(...values);

    return getContact(userEmail, id);
}

function deleteContact(userEmail, id) {
    const existing = getOwnContact(id, userEmail);
    if (!existing) throw new ServiceError(404, "Not found");
    db.prepare("DELETE FROM contacts WHERE id = ? AND user_email = ?").run(
        id,
        userEmail,
    );
    return { deleted: true };
}

// Attach a contact to a record. Both must belong to the caller: a link is the
// join between two owned things, so ownership is checked on both sides.
function linkContact(userEmail, contactId, applicationId, relation = null) {
    const contact = getOwnContact(contactId, userEmail);
    if (!contact) throw new ServiceError(404, "Contact not found");

    const application = getOwnApp(applicationId, userEmail);
    if (!application) throw new ServiceError(404, "Application not found");

    if (relation && String(relation).length > LIMITS.relation) {
        throw new ServiceError(
            400,
            `relation exceeds maximum length of ${LIMITS.relation} characters`,
        );
    }

    const already = db
        .prepare(
            "SELECT 1 FROM contact_links WHERE contact_id = ? AND application_id = ?",
        )
        .get(contactId, applicationId);
    if (already) {
        throw new ServiceError(409, "Contact is already linked to this record");
    }

    db.prepare(
        "INSERT INTO contact_links (contact_id, application_id, relation) VALUES (?, ?, ?)",
    ).run(contactId, applicationId, relation || null);

    return getContact(userEmail, contactId);
}

function unlinkContact(userEmail, contactId, applicationId) {
    const contact = getOwnContact(contactId, userEmail);
    if (!contact) throw new ServiceError(404, "Contact not found");

    const result = db
        .prepare(
            "DELETE FROM contact_links WHERE contact_id = ? AND application_id = ?",
        )
        .run(contactId, applicationId);
    if (result.changes === 0) throw new ServiceError(404, "Link not found");

    return getContact(userEmail, contactId);
}

// Convert a pipeline row that is actually a person into a contact.
//
// This is the only destructive path here, and it is deliberately an operator
// action rather than something the migration infers: the heuristics that spot
// a person-row are weak enough that a false positive would silently delete a
// real application. The original row is written to _row_backups first, so the
// conversion can be undone.
const CONVERT_OPERATION = "convert_application_to_contact";

function convertApplicationToContact(userEmail, applicationId, data = {}) {
    const application = getOwnApp(applicationId, userEmail);
    if (!application) throw new ServiceError(404, "Application not found");

    // The source row's field names do not map onto a person, so the operator
    // supplies the contact fields; company_name is only a starting suggestion.
    const name = (data.name && String(data.name).trim()) || application.company_name;
    if (!name) throw new ServiceError(400, "name is required");

    const lengthError = validateInputLengths({ ...data, name }, EDITABLE_FIELDS);
    if (lengthError) throw new ServiceError(400, lengthError);

    const notes = db
        .prepare(
            "SELECT stage, content, created_at FROM stage_notes WHERE application_id = ? ORDER BY created_at ASC",
        )
        .all(applicationId);

    // Everything that cascades off the application row has to go into the
    // backup, or the conversion is not actually reversible. Attachments matter
    // most: their rows cascade away, and the orphaned-file sweep then unlinks
    // the files themselves on the next restart.
    const attachments = db
        .prepare("SELECT * FROM attachments WHERE application_id = ?")
        .all(applicationId);
    const links = db
        .prepare("SELECT * FROM contact_links WHERE application_id = ?")
        .all(applicationId);

    // Carry the row's prose across so nothing is lost with the cascade.
    const carried = [
        data.notes,
        application.prep_work,
        application.interview_notes,
        ...notes.map((n) => n.content),
    ]
        .filter((part) => part && String(part).trim())
        .join("\n\n");

    let contactId;
    db.transaction(() => {
        // Backup first: audit_log cannot serve this purpose because it cascades
        // on applications delete and would vanish with the row it documents.
        db.prepare(
            "INSERT INTO _row_backups (operation, source_table, row_json) VALUES (?, ?, ?)",
        ).run(
            CONVERT_OPERATION,
            "applications",
            JSON.stringify({
                application,
                stage_notes: notes,
                attachments,
                contact_links: links,
            }),
        );

        contactId = db
            .prepare(
                `INSERT INTO contacts (name, contact_role, employer, email, phone, notes, user_email)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
            )
            .run(
                name,
                data.contact_role || application.role_title || null,
                data.employer || null,
                data.email || null,
                data.phone || null,
                carried || null,
                userEmail,
            ).lastInsertRowid;

        // application_id is deliberately NULL. audit_log.application_id is
        // ON DELETE CASCADE, so an entry carrying the id would be destroyed by
        // the very delete it exists to document -- writing it before the delete
        // does not help, because the cascade fires inside this transaction.
        // The original id lives in details instead.
        db.prepare(
            `INSERT INTO audit_log (application_id, user_email, action, source, auth_method, details, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).run(
            null,
            userEmail,
            CONVERT_OPERATION,
            "rest",
            "oauth",
            JSON.stringify({
                application_id: Number(applicationId),
                contact_id: contactId,
                name,
            }),
            new Date().toISOString(),
        );

        db.prepare("DELETE FROM applications WHERE id = ? AND user_email = ?").run(
            applicationId,
            userEmail,
        );
    })();

    return getContact(userEmail, contactId);
}

module.exports = {
    ServiceError,
    LIMITS,
    convertApplicationToContact,
    listContacts,
    getContact,
    createContact,
    updateContact,
    deleteContact,
    linkContact,
    unlinkContact,
    contactsForApplication,
    linksForContact,
};
