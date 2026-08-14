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
