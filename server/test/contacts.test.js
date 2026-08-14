"use strict";

process.env.DB_PATH = ":memory:";
process.env.RATE_LIMIT_API = "100000";
process.env.RATE_LIMIT_UPLOADS = "100000";
process.env.ADMIN_EMAILS = "admin@example.com";

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const supertest = require("supertest");
const app = require("../app");

const req = supertest(app);

const OWNER = "owner@example.com";
const OTHER = "other@example.com";
const ADMIN = "admin@example.com";

async function createApp(email = OWNER, overrides = {}) {
    const res = await req
        .post("/api/applications")
        .set("X-Forwarded-Email", email)
        .set("X-Forwarded-User", email)
        .field("company_name", overrides.company_name ?? "Mutual Bank")
        .field("role_title", overrides.role_title ?? "Head of IT");
    assert.equal(res.status, 201, JSON.stringify(res.body));
    return res.body;
}

async function createContact(email = OWNER, body = {}) {
    const res = await req
        .post("/api/contacts")
        .set("X-Forwarded-Email", email)
        .set("X-Forwarded-User", email)
        .send({ name: "Mike Carter", ...body });
    return res;
}

function as(email) {
    return (r) =>
        r.set("X-Forwarded-Email", email).set("X-Forwarded-User", email);
}

describe("U5 contacts CRUD", () => {
    test("a contact created with no links is returned by the list", async () => {
        // Covers AE9. A person met before any specific role still belongs here.
        const created = await createContact(OWNER, { name: "Solo Contact" });
        assert.equal(created.status, 201);
        assert.deepEqual(created.body.links, []);

        const list = await as(OWNER)(req.get("/api/contacts"));
        assert.equal(list.status, 200);
        assert.ok(list.body.some((c) => c.name === "Solo Contact"));
    });

    test("rejects a contact with no name", async () => {
        const res = await createContact(OWNER, { name: "   " });
        assert.equal(res.status, 400);
    });

    test("rejects notes beyond the field cap", async () => {
        const res = await createContact(OWNER, {
            name: "Verbose",
            notes: "x".repeat(10001),
        });
        assert.equal(res.status, 400);
    });

    test("updates a contact's fields", async () => {
        const created = await createContact(OWNER, { name: "Before" });
        const res = await as(OWNER)(
            req.put(`/api/contacts/${created.body.id}`),
        ).send({ name: "After", employer: "Preacta" });
        assert.equal(res.status, 200);
        assert.equal(res.body.name, "After");
        assert.equal(res.body.employer, "Preacta");
    });

    test("deletes a contact", async () => {
        const created = await createContact(OWNER, { name: "Doomed" });
        const del = await as(OWNER)(req.delete(`/api/contacts/${created.body.id}`));
        assert.equal(del.status, 200);

        const get = await as(OWNER)(req.get(`/api/contacts/${created.body.id}`));
        assert.equal(get.status, 404);
    });
});

describe("U5 linking", () => {
    test("a linked contact appears when the record is retrieved", async () => {
        const application = await createApp(OWNER);
        const contact = await createContact(OWNER, { name: "Linked Person" });

        const link = await as(OWNER)(
            req.post(`/api/contacts/${contact.body.id}/links`),
        ).send({ application_id: application.id, relation: "recruiter" });
        assert.equal(link.status, 201);

        const read = await as(OWNER)(req.get(`/api/applications/${application.id}`));
        assert.equal(read.status, 200);
        assert.equal(read.body.contacts.length, 1);
        assert.equal(read.body.contacts[0].name, "Linked Person");
        assert.equal(read.body.contacts[0].relation, "recruiter");
    });

    test("a contact linked to several records lists all of them", async () => {
        const a = await createApp(OWNER, { company_name: "Bank A" });
        const b = await createApp(OWNER, { company_name: "Bank B" });
        const contact = await createContact(OWNER, { name: "Busy Recruiter" });

        for (const app of [a, b]) {
            const res = await as(OWNER)(
                req.post(`/api/contacts/${contact.body.id}/links`),
            ).send({ application_id: app.id });
            assert.equal(res.status, 201);
        }

        const read = await as(OWNER)(req.get(`/api/contacts/${contact.body.id}`));
        assert.equal(read.body.links.length, 2);
    });

    test("rejects linking the same pair twice", async () => {
        const application = await createApp(OWNER);
        const contact = await createContact(OWNER, { name: "Duplicate Link" });
        const body = { application_id: application.id };

        const first = await as(OWNER)(
            req.post(`/api/contacts/${contact.body.id}/links`),
        ).send(body);
        assert.equal(first.status, 201);

        const second = await as(OWNER)(
            req.post(`/api/contacts/${contact.body.id}/links`),
        ).send(body);
        assert.equal(second.status, 409);
    });

    test("unlinking leaves both the contact and the record intact", async () => {
        const application = await createApp(OWNER);
        const contact = await createContact(OWNER, { name: "Temporary Link" });
        await as(OWNER)(req.post(`/api/contacts/${contact.body.id}/links`)).send({
            application_id: application.id,
        });

        const res = await as(OWNER)(
            req.delete(`/api/contacts/${contact.body.id}/links/${application.id}`),
        );
        assert.equal(res.status, 200);
        assert.deepEqual(res.body.links, []);

        const stillThere = await as(OWNER)(
            req.get(`/api/applications/${application.id}`),
        );
        assert.equal(stillThere.status, 200);
        assert.equal(stillThere.body.contacts.length, 0);
    });
});

describe("U6 converting a pipeline row into a contact", () => {
    const db = require("../db");

    async function seedPersonRow(email = OWNER) {
        // Record #148 in the real data: Mike Carter, a recruiter, filed as a
        // job application with his mobile number in prep_work.
        const res = await req
            .post("/api/applications")
            .set("X-Forwarded-Email", email)
            .set("X-Forwarded-User", email)
            .field("company_name", "Mike Carter")
            .field("role_title", "Recruiter")
            .field("prep_work", "Mobile 0412 345 678");
        assert.equal(res.status, 201);
        return res.body;
    }

    test("creates the contact and backs the original row up", async () => {
        // Covers AE8.
        const row = await seedPersonRow();
        const res = await as(OWNER)(req.post(`/api/contacts/convert/${row.id}`)).send({
            name: "Mike Carter",
            contact_role: "Recruiter",
            employer: "Change Recruitment",
        });

        assert.equal(res.status, 201, JSON.stringify(res.body));
        assert.equal(res.body.name, "Mike Carter");
        assert.equal(res.body.employer, "Change Recruitment");

        const backup = db
            .prepare(
                "SELECT * FROM _row_backups WHERE operation = ? ORDER BY id DESC LIMIT 1",
            )
            .get("convert_application_to_contact");
        assert.ok(backup, "expected a backup row");
        const parsed = JSON.parse(backup.row_json);
        assert.equal(parsed.application.id, row.id);
        assert.equal(parsed.application.company_name, "Mike Carter");
    });

    test("the backup round-trips into an object carrying every original column", async () => {
        const row = await seedPersonRow();
        await as(OWNER)(req.post(`/api/contacts/convert/${row.id}`)).send({
            name: "Recoverable",
        });

        const backup = db
            .prepare(
                "SELECT * FROM _row_backups WHERE operation = ? ORDER BY id DESC LIMIT 1",
            )
            .get("convert_application_to_contact");
        const restored = JSON.parse(backup.row_json).application;

        for (const col of [
            "id",
            "company_name",
            "role_title",
            "status",
            "stage",
            "state",
            "record_type",
            "created_at",
            "updated_at",
            "user_email",
        ]) {
            assert.ok(col in restored, `backup is missing ${col}`);
        }
    });

    test("carries the row's note content onto the contact", async () => {
        const row = await seedPersonRow();
        await as(OWNER)(req.post(`/api/applications/${row.id}/notes`)).send({
            stage: "interested",
            content: "Spoke about the mutual bank roles",
        });

        const res = await as(OWNER)(req.post(`/api/contacts/convert/${row.id}`)).send({
            name: "Mike Carter",
        });
        assert.equal(res.status, 201);
        assert.match(res.body.notes, /mutual bank roles/);
        assert.match(res.body.notes, /0412 345 678/);
    });

    test("removes the row from the pipeline", async () => {
        const row = await seedPersonRow();
        await as(OWNER)(req.post(`/api/contacts/convert/${row.id}`)).send({
            name: "Gone From Pipeline",
        });

        const read = await as(OWNER)(req.get(`/api/applications/${row.id}`));
        assert.equal(read.status, 404);
    });

    test("backs up the row before the cascade removes its attachments", async () => {
        const row = await seedPersonRow();
        await as(OWNER)(req.post(`/api/applications/${row.id}/notes`)).send({
            stage: "interested",
            content: "Note that must survive in the backup",
        });

        await as(OWNER)(req.post(`/api/contacts/convert/${row.id}`)).send({
            name: "Cascade Test",
        });

        const backup = db
            .prepare(
                "SELECT * FROM _row_backups WHERE operation = ? ORDER BY id DESC LIMIT 1",
            )
            .get("convert_application_to_contact");
        const parsed = JSON.parse(backup.row_json);
        assert.equal(parsed.stage_notes.length, 1);
        assert.match(parsed.stage_notes[0].content, /must survive/);
    });

    test("rejects converting another user's record", async () => {
        const foreign = await seedPersonRow(OTHER);
        const res = await as(OWNER)(
            req.post(`/api/contacts/convert/${foreign.id}`),
        ).send({ name: "Not Mine" });
        assert.equal(res.status, 404);

        const stillThere = await as(OTHER)(
            req.get(`/api/applications/${foreign.id}`),
        );
        assert.equal(stillThere.status, 200, "the row must not have been deleted");
    });

    test("leaves the row in place when contact creation fails", async () => {
        const row = await seedPersonRow();
        const res = await as(OWNER)(req.post(`/api/contacts/convert/${row.id}`)).send({
            name: "Too Long",
            notes: "x".repeat(10001),
        });
        assert.equal(res.status, 400);

        const stillThere = await as(OWNER)(req.get(`/api/applications/${row.id}`));
        assert.equal(stillThere.status, 200, "a failed conversion must not delete");
    });
});

describe("U5 ownership", () => {
    test("rejects linking a contact to another user's record", async () => {
        const foreign = await createApp(OTHER);
        const contact = await createContact(OWNER, { name: "Boundary Test" });

        const res = await as(OWNER)(
            req.post(`/api/contacts/${contact.body.id}/links`),
        ).send({ application_id: foreign.id });
        assert.equal(res.status, 404);
    });

    test("rejects retrieving another user's contact", async () => {
        const contact = await createContact(OTHER, { name: "Private Person" });
        const res = await as(OWNER)(req.get(`/api/contacts/${contact.body.id}`));
        assert.equal(res.status, 404);
    });

    test("an admin can read another user's contacts but not create them", async () => {
        await createContact(OWNER, { name: "Visible To Admin" });

        const read = await as(ADMIN)(req.get("/api/contacts?all=true"));
        assert.equal(read.status, 200);
        assert.ok(read.body.some((c) => c.name === "Visible To Admin"));

        const write = await as(ADMIN)(req.post("/api/contacts?all=true")).send({
            name: "Should Not Exist",
        });
        assert.equal(write.status, 403);
    });
});
