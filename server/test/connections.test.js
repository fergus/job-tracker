"use strict";

process.env.DB_PATH = ":memory:";
process.env.RATE_LIMIT_API = "100000";
process.env.RATE_LIMIT_UPLOADS = "100000";
process.env.INSTANCE_TIMEZONE = "Australia/Sydney";

const { test, describe, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const supertest = require("supertest");
const app = require("../app");
const db = require("../db");
const {
    normaliseCompany,
    parseCsv,
    parseConnectedOn,
} = require("../services/connections");
const { todayInInstanceZone } = require("../lib/followup");

const req = supertest(app);
const USER = "conn@example.com";
const OTHER = "conn-other@example.com";

function as(r, email = USER) {
    return r.set("X-Forwarded-Email", email).set("X-Forwarded-User", email);
}

// LinkedIn puts a few lines of notes above the header.
const PREAMBLE = [
    'Notes:',
    '"When exporting your connection data, you may notice that some email addresses are missing."',
    "",
].join("\n");
const HEADER = "First Name,Last Name,URL,Email Address,Company,Position,Connected On";

function csv(...rows) {
    return [PREAMBLE, HEADER, ...rows].join("\n") + "\n";
}

function importCsv(text, email = USER) {
    return as(req.post("/api/connections/import"), email)
        .set("Content-Type", "text/csv")
        .send(text);
}

async function mkApp(company, email = USER, extra = {}) {
    const res = await as(req.post("/api/applications"), email).send({
        company_name: company,
        role_title: "Engineer",
        stage: "applied",
        ...extra,
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    return res.body;
}

const ALICE = "Alice,Nguyen,https://www.linkedin.com/in/alice,,Acme Pty Ltd,Staff Engineer,23 Oct 2026";
const BOB = "Bob,Okafor,https://www.linkedin.com/in/bob,bob@example.com,ACME,Recruiter,01 Jan 2025";
const CARA = "Cara,Lindqvist,https://www.linkedin.com/in/cara,,Globex Corporation,Designer,15 Mar 2024";

beforeEach(() => {
    db.exec("DELETE FROM contact_links");
    db.exec("DELETE FROM contacts");
    db.exec("DELETE FROM connections");
    db.exec("DELETE FROM applications");
});

describe("normaliseCompany", () => {
    test("folds case, punctuation and legal-form words", () => {
        assert.equal(normaliseCompany("Acme Pty Ltd"), "acme");
        assert.equal(normaliseCompany("ACME"), "acme");
        assert.equal(normaliseCompany("Acme, Inc."), "acme");
        assert.equal(normaliseCompany("The Acme Company"), "acme");
        assert.equal(normaliseCompany("Johnson & Johnson"), "johnson and johnson");
        assert.equal(normaliseCompany("Café Corp"), "cafe");
    });

    test("keeps distinct companies distinct", () => {
        assert.notEqual(
            normaliseCompany("Macquarie Telecom"),
            normaliseCompany("Macquarie Technology Group"),
        );
    });

    test("returns null when nothing meaningful is left", () => {
        assert.equal(normaliseCompany(""), null);
        assert.equal(normaliseCompany(null), null);
        assert.equal(normaliseCompany("Pty Ltd"), null);
    });
});

describe("parseCsv", () => {
    test("handles quoted commas, doubled quotes and embedded newlines", () => {
        assert.deepEqual(parseCsv('a,"b,c","d ""e""","f\ng"\n1,2,3\n'), [
            ["a", "b,c", 'd "e"', "f\ng"],
            ["1", "2", "3"],
        ]);
    });

    test("accepts CRLF line endings and a missing final newline", () => {
        assert.deepEqual(parseCsv("a,b\r\n1,2"), [
            ["a", "b"],
            ["1", "2"],
        ]);
    });
});

describe("parseConnectedOn", () => {
    test("reads LinkedIn's day-month-year form", () => {
        assert.equal(parseConnectedOn("23 Oct 2026"), "2026-10-23");
        assert.equal(parseConnectedOn("1 Jan 2025"), "2025-01-01");
    });

    test("drops what it cannot read rather than guessing", () => {
        assert.equal(parseConnectedOn("yesterday"), null);
        assert.equal(parseConnectedOn(""), null);
    });
});

describe("POST /api/connections/import", () => {
    test("skips the preamble and imports the rows", async () => {
        const res = await importCsv(csv(ALICE, BOB, CARA));
        assert.equal(res.status, 200, JSON.stringify(res.body));
        assert.deepEqual(res.body, { total: 3, imported: 3, updated: 0, skipped: 0 });

        const list = await as(req.get("/api/connections"));
        assert.equal(list.body.total, 3);
        // Newest connection first.
        assert.equal(list.body.connections[0].name, "Alice Nguyen");
        assert.equal(list.body.connections[0].connected_on, "2026-10-23");
        assert.equal(list.body.connections[0].user_email, undefined);
    });

    test("skips rows with no profile URL or no name", async () => {
        const res = await importCsv(
            csv(ALICE, ",,https://www.linkedin.com/in/hidden,,Acme,Secret,01 Jan 2025", "Dan,Lee,,,Acme,Dev,01 Jan 2025"),
        );
        assert.deepEqual(res.body, { total: 3, imported: 1, updated: 0, skipped: 2 });
    });

    test("a re-import updates in place instead of duplicating", async () => {
        await importCsv(csv(ALICE));
        const moved = "Alice,Nguyen,https://www.linkedin.com/in/alice,,Globex,Principal Engineer,23 Oct 2026";
        const res = await importCsv(csv(moved, BOB));
        assert.deepEqual(res.body, { total: 2, imported: 1, updated: 1, skipped: 0 });

        const list = await as(req.get("/api/connections"));
        assert.equal(list.body.total, 2);
        const alice = list.body.connections.find((c) => c.first_name === "Alice");
        assert.equal(alice.company, "Globex");
        assert.equal(alice.position, "Principal Engineer");
    });

    test("tolerates a UTF-8 byte order mark and quoted fields", async () => {
        const text = "﻿" + csv('"Eve","O\'Brien, Jr",https://www.linkedin.com/in/eve,,"Acme, Inc.","VP, Sales",01 Jan 2025');
        const res = await importCsv(text);
        assert.equal(res.body.imported, 1);
        const list = await as(req.get("/api/connections").query({ company: "Acme" }));
        assert.equal(list.body.connections[0].name, "Eve O'Brien, Jr");
    });

    test("rejects a file that is not a connections export", async () => {
        const res = await importCsv("a,b,c\n1,2,3\n");
        assert.equal(res.status, 400);
        assert.match(res.body.error, /Connections\.csv/);
    });

    test("rejects an export missing required columns", async () => {
        const res = await importCsv("First Name,Last Name,URL\nA,B,https://x\n");
        assert.equal(res.status, 400);
        assert.match(res.body.error, /Company/);
    });

    test("rejects an empty body", async () => {
        const res = await importCsv(" ");
        assert.equal(res.status, 400);
    });

    test("imports are private to the user", async () => {
        await importCsv(csv(ALICE), USER);
        const mine = await as(req.get("/api/connections"), USER);
        const theirs = await as(req.get("/api/connections"), OTHER);
        assert.equal(mine.body.total, 1);
        assert.equal(theirs.body.total, 0);

        // The same profile URL imported by another user is their own row.
        const res = await importCsv(csv(ALICE), OTHER);
        assert.equal(res.body.imported, 1);
    });
});

describe("GET /api/connections", () => {
    beforeEach(async () => {
        await importCsv(csv(ALICE, BOB, CARA));
    });

    test("company matches the normalised employer", async () => {
        const res = await as(req.get("/api/connections").query({ company: "Acme Inc" }));
        assert.equal(res.body.total, 2);
        assert.deepEqual(
            res.body.connections.map((c) => c.first_name).sort(),
            ["Alice", "Bob"],
        );
    });

    test("query searches name, employer and position", async () => {
        const byName = await as(req.get("/api/connections").query({ query: "lindq" }));
        assert.equal(byName.body.total, 1);
        const byPosition = await as(req.get("/api/connections").query({ query: "recruiter" }));
        assert.equal(byPosition.body.connections[0].first_name, "Bob");
    });

    test("a % in the query is literal, not a wildcard", async () => {
        const res = await as(req.get("/api/connections").query({ query: "%" }));
        assert.equal(res.body.total, 0);
    });

    test("pages with limit and offset", async () => {
        const res = await as(req.get("/api/connections").query({ limit: 1, offset: 1 }));
        assert.equal(res.body.total, 3);
        assert.equal(res.body.connections.length, 1);
    });
});

describe("GET /api/connections/for-application/:id", () => {
    test("returns the people at the record's company", async () => {
        await importCsv(csv(ALICE, BOB, CARA));
        const a = await mkApp("Acme");
        const res = await as(req.get(`/api/connections/for-application/${a.id}`));
        assert.equal(res.status, 200);
        assert.equal(res.body.total, 2);
    });

    test("is empty for a company nobody works at", async () => {
        await importCsv(csv(ALICE));
        const a = await mkApp("Initech");
        const res = await as(req.get(`/api/connections/for-application/${a.id}`));
        assert.equal(res.body.total, 0);
    });

    test("404s for another user's record", async () => {
        const a = await mkApp("Acme", OTHER);
        const res = await as(req.get(`/api/connections/for-application/${a.id}`));
        assert.equal(res.status, 404);
    });
});

describe("POST /api/connections/:id/promote", () => {
    async function firstConnection(first) {
        const list = await as(req.get("/api/connections"));
        return list.body.connections.find((c) => c.first_name === first);
    }

    test("creates a contact from the connection and links it", async () => {
        await importCsv(csv(ALICE));
        const a = await mkApp("Acme");
        const alice = await firstConnection("Alice");

        const res = await as(req.post(`/api/connections/${alice.id}/promote`)).send({
            application_id: a.id,
            relation: "referrer",
        });
        assert.equal(res.status, 201, JSON.stringify(res.body));
        assert.equal(res.body.name, "Alice Nguyen");
        assert.equal(res.body.employer, "Acme Pty Ltd");
        assert.equal(res.body.contact_role, "Staff Engineer");
        assert.match(res.body.notes, /linkedin\.com\/in\/alice/);
        assert.equal(res.body.links.length, 1);
        assert.equal(res.body.links[0].relation, "referrer");

        const after = await firstConnection("Alice");
        assert.equal(after.contact_id, res.body.id);
    });

    test("promoting twice reuses the contact", async () => {
        await importCsv(csv(ALICE));
        const alice = await firstConnection("Alice");
        const first = await as(req.post(`/api/connections/${alice.id}/promote`)).send({});
        const second = await as(req.post(`/api/connections/${alice.id}/promote`)).send({});
        assert.equal(first.body.id, second.body.id);
        const contacts = await as(req.get("/api/contacts"));
        assert.equal(contacts.body.length, 1);
    });

    test("linking an already-linked connection is not an error", async () => {
        await importCsv(csv(ALICE));
        const a = await mkApp("Acme");
        const alice = await firstConnection("Alice");
        const body = { application_id: a.id };
        await as(req.post(`/api/connections/${alice.id}/promote`)).send(body);
        const again = await as(req.post(`/api/connections/${alice.id}/promote`)).send(body);
        assert.equal(again.status, 201);
        assert.equal(again.body.links.length, 1);
    });

    test("404s for another user's connection", async () => {
        await importCsv(csv(ALICE), OTHER);
        const theirs = (await as(req.get("/api/connections"), OTHER)).body.connections[0];
        const res = await as(req.post(`/api/connections/${theirs.id}/promote`)).send({});
        assert.equal(res.status, 404);
    });

    test("404s when the record to link is not the user's", async () => {
        await importCsv(csv(ALICE));
        const alice = await firstConnection("Alice");
        const foreign = await mkApp("Acme", OTHER);
        const res = await as(req.post(`/api/connections/${alice.id}/promote`)).send({
            application_id: foreign.id,
        });
        assert.equal(res.status, 404);
    });
});

describe("DELETE /api/connections", () => {
    test("clears the user's connections and keeps promoted contacts", async () => {
        await importCsv(csv(ALICE, BOB));
        await importCsv(csv(CARA), OTHER);
        const alice = (await as(req.get("/api/connections"))).body.connections.find(
            (c) => c.first_name === "Alice",
        );
        await as(req.post(`/api/connections/${alice.id}/promote`)).send({});

        const res = await as(req.delete("/api/connections"));
        assert.deepEqual(res.body, { deleted: 2 });

        assert.equal((await as(req.get("/api/connections"))).body.total, 0);
        assert.equal((await as(req.get("/api/connections"), OTHER)).body.total, 1);
        assert.equal((await as(req.get("/api/contacts"))).body.length, 1);
    });
});

describe("GET /api/today connection_count", () => {
    function inDays(n) {
        const d = new Date(`${todayInInstanceZone()}T00:00:00Z`);
        d.setUTCDate(d.getUTCDate() + n);
        return d.toISOString().slice(0, 10);
    }

    test("counts connections at a record's company and never on a contact", async () => {
        await importCsv(csv(ALICE, BOB, CARA));
        await mkApp("Acme", USER, { next_action_at: inDays(1) });
        await mkApp("Initech", USER, { next_action_at: inDays(2) });
        await as(req.post("/api/contacts")).send({
            name: "Pat",
            next_action_at: inDays(1),
        });

        const res = await as(req.get("/api/today"));
        const byTitle = Object.fromEntries(res.body.map((i) => [i.title, i]));
        assert.equal(byTitle.Acme.connection_count, 2);
        assert.equal(byTitle.Initech.connection_count, 0);
        assert.equal(byTitle.Pat.connection_count, undefined);
    });

    test("does not count another user's network", async () => {
        await importCsv(csv(ALICE, BOB), OTHER);
        await mkApp("Acme", USER, { next_action_at: inDays(1) });
        const res = await as(req.get("/api/today"));
        assert.equal(res.body[0].connection_count, 0);
    });
});
