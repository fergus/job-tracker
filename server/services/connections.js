"use strict";

// LinkedIn connections: an imported copy of the user's network, matched to
// records by company so the panel and Today can say "you know someone there".
// Connections live apart from contacts; one becomes a contact only when it is
// promoted. See the connections table in db.js for why.

const db = require("../db");
const contactsSvc = require("./contacts");

const { ServiceError } = contactsSvc;

const MAX_CSV_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 50000;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

// Legal-form words that differ between how LinkedIn spells an employer and how
// a record spells it. Only these are dropped: "Macquarie Telecom" and
// "Macquarie Technology Group" are different companies and must stay so.
const COMPANY_NOISE = new Set([
    "pty",
    "ltd",
    "limited",
    "inc",
    "incorporated",
    "llc",
    "plc",
    "corp",
    "corporation",
    "co",
    "company",
    "the",
]);

/**
 * The comparison form of a company name: lower-case, punctuation folded to
 * spaces, legal-form words removed. Returns null when nothing is left, so a
 * blank or all-noise name never matches another one.
 */
function normaliseCompany(name) {
    if (!name) return null;
    const tokens = String(name)
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/&/g, " and ")
        .replace(/[^a-z0-9]+/g, " ")
        .split(" ")
        .filter((t) => t && !COMPANY_NOISE.has(t));
    return tokens.length ? tokens.join(" ") : null;
}

/**
 * Minimal RFC 4180 reader: quoted fields, doubled quotes, and newlines inside
 * quotes. Returns an array of rows, each an array of strings.
 */
function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (quoted) {
            if (ch === '"') {
                if (text[i + 1] === '"') {
                    field += '"';
                    i++;
                } else {
                    quoted = false;
                }
            } else {
                field += ch;
            }
        } else if (ch === '"') {
            quoted = true;
        } else if (ch === ",") {
            row.push(field);
            field = "";
        } else if (ch === "\n" || ch === "\r") {
            if (ch === "\r" && text[i + 1] === "\n") i++;
            row.push(field);
            field = "";
            rows.push(row);
            row = [];
        } else {
            field += ch;
        }
    }
    if (field !== "" || row.length) {
        row.push(field);
        rows.push(row);
    }
    return rows;
}

const MONTHS = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

// "23 Oct 2026" -> "2026-10-23". Anything else is dropped rather than guessed.
function parseConnectedOn(value) {
    const m = /^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})$/.exec(
        String(value || "").trim(),
    );
    if (!m) return null;
    const month = MONTHS[m[2].toLowerCase()];
    if (!month) return null;
    return `${m[3]}-${month}-${m[1].padStart(2, "0")}`;
}

const REQUIRED_COLUMNS = ["First Name", "Last Name", "URL", "Company", "Position"];

/**
 * Import a LinkedIn Connections.csv. LinkedIn puts a few lines of notes above
 * the header, so the header is found rather than assumed to be first. Rows
 * with no profile URL or no name are skipped: they are connections who hide
 * their identity and cannot be told apart on a re-import.
 *
 * Re-importing is safe: a row already present (same profile URL) is updated in
 * place, so a fresh export refreshes employers and titles without duplicating.
 */
function importConnections(userEmail, csvText) {
    if (typeof csvText !== "string" || !csvText.trim()) {
        throw new ServiceError(400, "CSV body is required");
    }
    if (Buffer.byteLength(csvText, "utf8") > MAX_CSV_BYTES) {
        throw new ServiceError(413, "CSV exceeds the 5 MB limit");
    }

    const rows = parseCsv(csvText.replace(/^﻿/, ""));
    const headerAt = rows.findIndex((r) => r[0] && r[0].trim() === "First Name");
    if (headerAt === -1) {
        throw new ServiceError(
            400,
            "This does not look like a LinkedIn Connections.csv: no 'First Name' header row",
        );
    }

    const header = rows[headerAt].map((h) => h.trim());
    const missing = REQUIRED_COLUMNS.filter((c) => !header.includes(c));
    if (missing.length) {
        throw new ServiceError(400, `Missing column(s): ${missing.join(", ")}`);
    }
    const at = Object.fromEntries(header.map((h, i) => [h, i]));
    const cell = (r, name) =>
        at[name] === undefined ? "" : (r[at[name]] || "").trim();

    const data = rows.slice(headerAt + 1).filter((r) => r.some((c) => c.trim()));
    if (data.length > MAX_ROWS) {
        throw new ServiceError(400, `CSV has more than ${MAX_ROWS} rows`);
    }

    const existing = db.prepare(
        "SELECT 1 FROM connections WHERE user_email = ? AND url = ?",
    );
    const upsert = db.prepare(
        `INSERT INTO connections
           (user_email, first_name, last_name, url, email, company, company_key,
            position, connected_on)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (user_email, url) DO UPDATE SET
           first_name = excluded.first_name,
           last_name = excluded.last_name,
           email = excluded.email,
           company = excluded.company,
           company_key = excluded.company_key,
           position = excluded.position,
           connected_on = excluded.connected_on,
           updated_at = datetime('now')`,
    );

    const result = { total: data.length, imported: 0, updated: 0, skipped: 0 };

    db.transaction(() => {
        for (const r of data) {
            const first = cell(r, "First Name");
            const last = cell(r, "Last Name");
            const url = cell(r, "URL");
            if (!url || !(first || last)) {
                result.skipped++;
                continue;
            }
            const company = cell(r, "Company") || null;
            const known = existing.get(userEmail, url);
            upsert.run(
                userEmail,
                first || null,
                last || null,
                url,
                cell(r, "Email Address") || null,
                company,
                normaliseCompany(company),
                cell(r, "Position") || null,
                parseConnectedOn(cell(r, "Connected On")),
            );
            if (known) result.updated++;
            else result.imported++;
        }
    })();

    return result;
}

function decorate(row) {
    const contact = db
        .prepare(
            "SELECT id FROM contacts WHERE user_email = ? AND source_connection_id = ?",
        )
        .get(row.user_email, row.id);
    const { user_email, company_key, ...rest } = row;
    return {
        ...rest,
        name: [row.first_name, row.last_name].filter(Boolean).join(" "),
        contact_id: contact ? contact.id : null,
    };
}

function clampLimit(value) {
    const n = parseInt(value, 10);
    if (!Number.isFinite(n) || n < 1) return DEFAULT_LIMIT;
    return Math.min(n, MAX_LIMIT);
}

/**
 * The user's connections, newest connection first. `company` matches the
 * normalised employer exactly; `query` is a substring match over name,
 * company and position.
 */
function listConnections(userEmail, { company, query, limit, offset } = {}) {
    const where = ["user_email = ?"];
    const params = [userEmail];

    if (company) {
        const key = normaliseCompany(company);
        if (!key) return { total: 0, connections: [] };
        where.push("company_key = ?");
        params.push(key);
    }
    if (query) {
        const like = `%${String(query).toLowerCase().replace(/[%_\\]/g, "\\$&")}%`;
        where.push(
            `(lower(coalesce(first_name,'') || ' ' || coalesce(last_name,'')) LIKE ? ESCAPE '\\'
              OR lower(coalesce(company,'')) LIKE ? ESCAPE '\\'
              OR lower(coalesce(position,'')) LIKE ? ESCAPE '\\')`,
        );
        params.push(like, like, like);
    }

    const clause = where.join(" AND ");
    const { total } = db
        .prepare(`SELECT COUNT(*) AS total FROM connections WHERE ${clause}`)
        .get(...params);
    const rows = db
        .prepare(
            `SELECT * FROM connections WHERE ${clause}
             ORDER BY connected_on DESC, id DESC LIMIT ? OFFSET ?`,
        )
        .all(...params, clampLimit(limit), Math.max(parseInt(offset, 10) || 0, 0));

    return { total, connections: rows.map(decorate) };
}

/** The connections who work at the company a record is filed under. */
function connectionsForApplication(userEmail, applicationId) {
    const app = db
        .prepare(
            "SELECT company_name FROM applications WHERE id = ? AND user_email = ?",
        )
        .get(applicationId, userEmail);
    if (!app) throw new ServiceError(404, "Application not found");
    return listConnections(userEmail, {
        company: app.company_name,
        limit: MAX_LIMIT,
    });
}

/**
 * How many connections the user has at each company, keyed by the normalised
 * name and then the user, for callers that decorate many records at once.
 * `Map<"user_email|company_key", count>`.
 */
function connectionCounts(userEmail = null) {
    const rows = userEmail
        ? db
              .prepare(
                  `SELECT user_email, company_key, COUNT(*) AS n FROM connections
                   WHERE user_email = ? AND company_key IS NOT NULL
                   GROUP BY user_email, company_key`,
              )
              .all(userEmail)
        : db
              .prepare(
                  `SELECT user_email, company_key, COUNT(*) AS n FROM connections
                   WHERE company_key IS NOT NULL GROUP BY user_email, company_key`,
              )
              .all();
    return new Map(rows.map((r) => [`${r.user_email}|${r.company_key}`, r.n]));
}

/**
 * Turn a connection into a contact, optionally linking it to a record. Promoting
 * the same connection again reuses its contact rather than creating a second.
 */
function promoteConnection(
    userEmail,
    connectionId,
    { application_id = null, relation = null } = {},
) {
    const connection = db
        .prepare("SELECT * FROM connections WHERE id = ? AND user_email = ?")
        .get(connectionId, userEmail);
    if (!connection) throw new ServiceError(404, "Connection not found");

    let contact = db
        .prepare(
            "SELECT id FROM contacts WHERE user_email = ? AND source_connection_id = ?",
        )
        .get(userEmail, connection.id);

    if (!contact) {
        const created = contactsSvc.createContact(userEmail, {
            name: [connection.first_name, connection.last_name]
                .filter(Boolean)
                .join(" "),
            contact_role: connection.position,
            employer: connection.company,
            email: connection.email,
            notes: `LinkedIn: ${connection.url}`,
        });
        db.prepare("UPDATE contacts SET source_connection_id = ? WHERE id = ?").run(
            connection.id,
            created.id,
        );
        contact = { id: created.id };
    }

    if (application_id !== null && application_id !== undefined) {
        try {
            contactsSvc.linkContact(userEmail, contact.id, application_id, relation);
        } catch (e) {
            // Already linked is the state the caller asked for.
            if (!(e instanceof ServiceError && e.status === 409)) throw e;
        }
    }

    return contactsSvc.getContact(userEmail, contact.id);
}

/** Remove every imported connection. Contacts promoted from them are kept. */
function clearConnections(userEmail) {
    const { changes } = db
        .prepare("DELETE FROM connections WHERE user_email = ?")
        .run(userEmail);
    db.prepare(
        "UPDATE contacts SET source_connection_id = NULL WHERE user_email = ?",
    ).run(userEmail);
    return { deleted: changes };
}

module.exports = {
    ServiceError,
    normaliseCompany,
    parseCsv,
    parseConnectedOn,
    importConnections,
    listConnections,
    connectionsForApplication,
    connectionCounts,
    promoteConnection,
    clearConnections,
};
