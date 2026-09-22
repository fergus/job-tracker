"use strict";

// Contacts: the people the search actually runs through -- recruiters,
// referrers, hiring managers. Before this existed they were filed as job
// applications, which inflated the pipeline and left the referral network
// with nowhere to live.

const db = require("../db");
const {
    followUpState,
    daysUntil,
    daysSince,
    toCalendarDate,
    todayInInstanceZone,
} = require("../lib/followup");
const { visibleStageNotes } = require("./stage-notes");

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
    next_action: 500,
    content: 10000,
};

const EDITABLE_FIELDS = [
    "name",
    "contact_role",
    "employer",
    "email",
    "phone",
    "notes",
    "last_contacted_at",
    "next_action_at",
    "next_action",
];

// Day granularity, matching every other date in the schema.
const DATE_FIELDS = ["last_contacted_at", "next_action_at"];

function validateDateFields(data) {
    for (const field of DATE_FIELDS) {
        const value = data[field];
        if (value === undefined || value === null || value === "") continue;
        if (!toCalendarDate(value)) {
            return `${field} must be a calendar date (YYYY-MM-DD)`;
        }
    }
    return null;
}

// A withdrawn interaction is hidden, never destroyed, so every read of the log
// -- and every write that has to resolve one -- goes through this clause.
const VISIBLE_NOTE = "hidden_at IS NULL";

// The interactions logged against a contact, most recent first.
function notesForContact(contactId) {
    return db
        .prepare(
            `SELECT id, content, occurred_at, created_at, updated_at
             FROM contact_notes WHERE contact_id = ? AND ${VISIBLE_NOTE}
             ORDER BY occurred_at DESC, id DESC`,
        )
        .all(contactId);
}

// Decorate a contact with its derived follow-up state so the API, MCP and any
// UI all read the same classification rather than each recomputing it.
function withFollowUp(contact) {
    return {
        ...contact,
        follow_up_state: followUpState(contact.next_action_at),
        follow_up_days: daysUntil(contact.next_action_at),
        days_since_contact: daysSince(contact.last_contacted_at),
    };
}

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

// The people attached to a record. Carries the follow-up state so the record's
// own panel can show who is owed a touch without a second round trip per person.
function contactsForApplication(applicationId) {
    return db
        .prepare(
            `SELECT c.id, c.name, c.contact_role, c.employer, c.email, c.phone,
                    c.last_contacted_at, c.next_action_at, c.next_action,
                    cl.id AS link_id, cl.relation
             FROM contact_links cl
             JOIN contacts c ON c.id = cl.contact_id
             WHERE cl.application_id = ?
             ORDER BY c.name ASC`,
        )
        .all(applicationId)
        .map(withFollowUp);
}

function listContacts(
    userEmail,
    { all, isAdmin = false, next_action_before, has_next_action, query } = {},
) {
    const showAll = isAdmin && all === "true";
    const conditions = [];
    const params = [];

    if (!showAll) {
        conditions.push("user_email = ?");
        params.push(userEmail);
    }

    if (next_action_before !== undefined && next_action_before !== null && next_action_before !== "") {
        const bound = toCalendarDate(next_action_before);
        if (!bound) {
            throw new ServiceError(
                400,
                "next_action_before must be a calendar date (YYYY-MM-DD)",
            );
        }
        // Inclusive: "who do I owe a touch by Friday" should include Friday.
        conditions.push("next_action_at IS NOT NULL AND date(next_action_at) <= ?");
        params.push(bound);
    }

    if (has_next_action === true) {
        conditions.push("next_action_at IS NOT NULL");
    } else if (has_next_action === false) {
        conditions.push("next_action_at IS NULL");
    }

    if (query) {
        conditions.push("(name LIKE ? OR employer LIKE ? OR contact_role LIKE ?)");
        const like = `%${query}%`;
        params.push(like, like, like);
    }

    const where = conditions.length ? " WHERE " + conditions.join(" AND ") : "";
    // Ordered by what is owed first, then -- for everyone carrying no
    // commitment -- by how long they have been quiet, longest first, with the
    // never-contacted at the very bottom. The main question a job-search
    // contacts table answers is "who do I owe a touch"; the second is "who is
    // going cold". Alphabetical order answers neither, so it is only the
    // tiebreak. Contacts who were never contacted sort last rather than first
    // because the top of the list is about re-warming existing relationships.
    const rows = db
        .prepare(
            `SELECT * FROM contacts${where}
             ORDER BY (next_action_at IS NULL), date(next_action_at) ASC,
                      (last_contacted_at IS NULL), date(last_contacted_at) ASC,
                      name ASC`,
        )
        .all(...params);

    return rows.map((c) => withFollowUp({ ...c, links: linksForContact(c.id) }));
}

function getContact(userEmail, id, { isAdmin = false } = {}) {
    const contact = isAdmin
        ? db.prepare("SELECT * FROM contacts WHERE id = ?").get(id)
        : getOwnContact(id, userEmail);
    if (!contact) throw new ServiceError(404, "Not found");
    return withFollowUp({
        ...contact,
        links: linksForContact(contact.id),
        interactions: notesForContact(contact.id),
    });
}

function createContact(userEmail, data) {
    const name = data.name && String(data.name).trim();
    if (!name) throw new ServiceError(400, "name is required");

    const lengthError = validateInputLengths(data, EDITABLE_FIELDS);
    if (lengthError) throw new ServiceError(400, lengthError);

    const dateError = validateDateFields(data);
    if (dateError) throw new ServiceError(400, dateError);

    const result = db
        .prepare(
            `INSERT INTO contacts
             (name, contact_role, employer, email, phone, notes,
              last_contacted_at, next_action_at, next_action, user_email)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
            name,
            data.contact_role || null,
            data.employer || null,
            data.email || null,
            data.phone || null,
            data.notes || null,
            toCalendarDate(data.last_contacted_at),
            toCalendarDate(data.next_action_at),
            data.next_action || null,
            userEmail,
        );

    return getContact(userEmail, result.lastInsertRowid);
}

function updateContact(userEmail, id, data) {
    const existing = getOwnContact(id, userEmail);
    if (!existing) throw new ServiceError(404, "Not found");

    const lengthError = validateInputLengths(data, EDITABLE_FIELDS);
    if (lengthError) throw new ServiceError(400, lengthError);

    const dateError = validateDateFields(data);
    if (dateError) throw new ServiceError(400, dateError);

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

    // Two reads of the same table, deliberately. The backup exists to make the
    // conversion reversible, so it captures every row as it stood -- hidden
    // ones included, and carrying hidden_at with them, because restoring by
    // hand is the only recovery this product has and a restore that silently
    // un-hides a withdrawn note would undo the user's decision to withdraw it.
    // The prose carried into the contact is an ordinary read, so a withdrawn
    // note stays withdrawn.
    const backedUpNotes = db
        .prepare(
            `SELECT id, stage, content, created_at, updated_at, hidden_at
             FROM stage_notes WHERE application_id = ? ORDER BY created_at ASC`,
        )
        .all(applicationId);
    const notes = visibleStageNotes(applicationId);

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
                stage_notes: backedUpNotes,
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

// Log an interaction. `occurred_at` defaults to today in the instance
// timezone, because the common case is logging something that just happened --
// but a call written up three days later belongs on the day of the call, so it
// is settable.
function addContactNote(
    userEmail,
    contactId,
    { content, occurred_at, next_action_at, next_action } = {},
) {
    const contact = getOwnContact(contactId, userEmail);
    if (!contact) throw new ServiceError(404, "Not found");

    const body = content && String(content).trim();
    if (!body) throw new ServiceError(400, "content is required");
    if (body.length > LIMITS.content) {
        throw new ServiceError(
            400,
            `content exceeds maximum length of ${LIMITS.content} characters`,
        );
    }

    let when = todayInInstanceZone();
    if (occurred_at !== undefined && occurred_at !== null && occurred_at !== "") {
        const parsed = toCalendarDate(occurred_at);
        if (!parsed) {
            throw new ServiceError(
                400,
                "occurred_at must be a calendar date (YYYY-MM-DD)",
            );
        }
        when = parsed;
    }

    // The next touch is an explicit commitment, so it only changes when named:
    // omit the field and the existing value stands, pass null to clear it. Each
    // of the pair is independent, so re-wording a commitment does not drop its
    // date and vice versa.
    const nextUpdates = [];
    const nextValues = [];
    if (next_action_at !== undefined) {
        let nextAt = null;
        if (next_action_at !== null && next_action_at !== "") {
            nextAt = toCalendarDate(next_action_at);
            if (!nextAt) {
                throw new ServiceError(
                    400,
                    "next_action_at must be a calendar date (YYYY-MM-DD)",
                );
            }
        }
        nextUpdates.push("next_action_at = ?");
        nextValues.push(nextAt);
    }
    if (next_action !== undefined) {
        const nextWhat =
            next_action === null || next_action === ""
                ? null
                : String(next_action);
        if (nextWhat && nextWhat.length > LIMITS.next_action) {
            throw new ServiceError(
                400,
                `next_action exceeds maximum length of ${LIMITS.next_action} characters`,
            );
        }
        nextUpdates.push("next_action = ?");
        nextValues.push(nextWhat);
    }

    db.transaction(() => {
        db.prepare(
            "INSERT INTO contact_notes (contact_id, content, occurred_at) VALUES (?, ?, ?)",
        ).run(contactId, body, when);

        // Logging an interaction IS contact, so last_contacted_at is derived
        // from it rather than being a second field to remember to update. Only
        // advances -- back-dating an old note must not rewind the record.
        const current = toCalendarDate(contact.last_contacted_at);
        if (!current || when > current) {
            db.prepare(
                "UPDATE contacts SET last_contacted_at = ?, updated_at = ? WHERE id = ?",
            ).run(when, new Date().toISOString(), contactId);
        }

        if (nextUpdates.length > 0) {
            db.prepare(
                `UPDATE contacts SET ${nextUpdates.join(", ")}, updated_at = ? WHERE id = ?`,
            ).run(...nextValues, new Date().toISOString(), contactId);
        }
    })();

    return getContact(userEmail, contactId);
}

// Resolve the interaction a write names. A hidden note is not found for writes
// either: withdrawing a note makes it inert, so operating on one fails exactly
// the way operating on someone else's does. Ownership is checked through the
// contact, and the miss is a 404 rather than a 403 -- a 403 would confirm the
// note exists to someone with no business knowing.
function getOwnNote(noteId, contactId, userEmail) {
    return db
        .prepare(
            `SELECT n.* FROM contact_notes n
             JOIN contacts c ON c.id = n.contact_id
             WHERE n.id = ? AND n.contact_id = ? AND c.user_email = ?
               AND n.${VISIBLE_NOTE}`,
        )
        .get(noteId, contactId, userEmail);
}

// Correct an interaction: what it said, when it happened, or both. Patch
// semantics, matching updateContact -- an omitted field stands. The next-action
// pair is deliberately not touched here: it is a commitment, and only a write
// that names it may move it.
function updateContactNote(userEmail, contactId, noteId, { content, occurred_at } = {}) {
    const note = getOwnNote(noteId, contactId, userEmail);
    if (!note) throw new ServiceError(404, "Not found");

    const updates = [];
    const values = [];

    if (content !== undefined) {
        const body = content && String(content).trim();
        if (!body) throw new ServiceError(400, "content is required");
        if (body.length > LIMITS.content) {
            throw new ServiceError(
                400,
                `content exceeds maximum length of ${LIMITS.content} characters`,
            );
        }
        updates.push("content = ?");
        values.push(body);
    }

    let when = null;
    if (occurred_at !== undefined && occurred_at !== null && occurred_at !== "") {
        when = toCalendarDate(occurred_at);
        if (!when) {
            throw new ServiceError(
                400,
                "occurred_at must be a calendar date (YYYY-MM-DD)",
            );
        }
        updates.push("occurred_at = ?");
        values.push(when);
    }

    if (updates.length === 0) throw new ServiceError(400, "No fields to update");

    db.transaction(() => {
        const now = new Date().toISOString();
        db.prepare(
            `UPDATE contact_notes SET ${updates.join(", ")}, updated_at = ? WHERE id = ?`,
        ).run(...values, now, noteId);

        // Correcting the log is a change to the contact. A contact has no
        // change-event stream, so its updated_at is the only signal a polling
        // client gets that what it holds is stale.
        db.prepare("UPDATE contacts SET updated_at = ? WHERE id = ?").run(
            now,
            contactId,
        );

        // A comparison, NOT a recomputation. Deriving last_contacted_at from
        // MAX(occurred_at) over the surviving log would be the more honest
        // reading of the field, and it is rejected on purpose: no write may
        // make a relationship look staler than it already looked. Re-dating a
        // note backwards therefore leaves a contact whose last-contacted date
        // no visible note accounts for. That is the intended trade, not a bug.
        if (when) {
            const current = toCalendarDate(
                getOwnContact(contactId, userEmail).last_contacted_at,
            );
            if (!current || when > current) {
                db.prepare(
                    "UPDATE contacts SET last_contacted_at = ?, updated_at = ? WHERE id = ?",
                ).run(when, now, contactId);
            }
        }
    })();

    return getContact(userEmail, contactId);
}

// Withdraw an interaction. The row survives with hidden_at stamped, and
// last_contacted_at is left exactly where it is: freshness only advances, so
// removing the evidence of contact cannot rewind the date it produced. The
// contact is still marked as changed, because the log a client holds is now
// out of date even though the derived fields are not.
function deleteContactNote(userEmail, contactId, noteId) {
    const note = getOwnNote(noteId, contactId, userEmail);
    if (!note) throw new ServiceError(404, "Not found");

    db.transaction(() => {
        const now = new Date().toISOString();
        db.prepare("UPDATE contact_notes SET hidden_at = ? WHERE id = ?").run(
            now,
            noteId,
        );
        db.prepare("UPDATE contacts SET updated_at = ? WHERE id = ?").run(
            now,
            contactId,
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
    notesForContact,
    addContactNote,
    updateContactNote,
    deleteContactNote,
};
