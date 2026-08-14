"use strict";

process.env.DB_PATH = ":memory:";
process.env.RATE_LIMIT_API = "100000";
process.env.RATE_LIMIT_UPLOADS = "100000";

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const supertest = require("supertest");
const app = require("../app");

const req = supertest(app);

async function createApp(overrides = {}) {
    const res = await req
        .post("/api/applications")
        .field("company_name", overrides.company_name ?? "Acme Corp")
        .field("role_title", overrides.role_title ?? "Engineer")
        .field("status", overrides.status ?? "interested");
    assert.equal(res.status, 201);
    return res.body;
}

async function setStatus(id, status) {
    const res = await req.patch(`/api/applications/${id}/status`).send({ status });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    return res.body;
}

async function patch(id, body) {
    return req.put(`/api/applications/${id}`).send(body);
}

async function get(id) {
    const res = await req.get(`/api/applications/${id}`);
    assert.equal(res.status, 200);
    return res.body;
}

describe("U4 legacy status writes derive the new triple", () => {
    test("a new record carries the derived triple", async () => {
        const created = await createApp({ status: "applied" });
        assert.equal(created.stage, "applied");
        assert.equal(created.state, "open");
        assert.equal(created.close_reason, null);
        assert.equal(created.record_type, "application");
    });

    test("setting status to interview yields stage interview and state open", async () => {
        // Covers AE7.
        const created = await createApp();
        const updated = await setStatus(created.id, "interview");
        assert.equal(updated.stage, "interview");
        assert.equal(updated.state, "open");
        assert.equal(updated.close_reason, null);
    });

    test("setting status to rejected closes the record with the rejected reason", async () => {
        const created = await createApp({ status: "applied" });
        const updated = await setStatus(created.id, "rejected");
        assert.equal(updated.state, "closed");
        assert.equal(updated.close_reason, "rejected");
    });

    test("setting status to accepted closes the record with the accepted reason", async () => {
        const created = await createApp({ status: "offer" });
        const updated = await setStatus(created.id, "accepted");
        assert.equal(updated.state, "closed");
        assert.equal(updated.close_reason, "accepted");
    });

    test("closing a record at interview leaves its stage at interview", async () => {
        // Covers AE1.
        const created = await createApp();
        await setStatus(created.id, "interview");
        const closed = await setStatus(created.id, "rejected");
        assert.equal(closed.stage, "interview");
        assert.equal(closed.state, "closed");
    });

    test("closing does not stamp a stage date the record never reached", async () => {
        const created = await createApp({ status: "applied" });
        const closed = await setStatus(created.id, "rejected");
        assert.equal(closed.interview_at, null);
        assert.equal(closed.offer_at, null);
        assert.ok(closed.closed_at, "closed_at should be stamped");
    });
});

describe("U4 new-shape writes derive the legacy status", () => {
    test("closing with withdrawn maps status to rejected", async () => {
        // Covers AE6. The legacy status is lossy by design: it has one
        // failure state, which is why the split exists.
        const created = await createApp({ status: "applied" });
        const res = await patch(created.id, {
            state: "closed",
            close_reason: "withdrawn",
        });
        assert.equal(res.status, 200, JSON.stringify(res.body));
        assert.equal(res.body.status, "rejected");
        assert.equal(res.body.close_reason, "withdrawn");
        assert.equal(res.body.stage, "applied");
    });

    test("closing with accepted maps status to accepted", async () => {
        const created = await createApp({ status: "offer" });
        const res = await patch(created.id, {
            state: "closed",
            close_reason: "accepted",
        });
        assert.equal(res.status, 200);
        assert.equal(res.body.status, "accepted");
    });

    test("setting stage on an open record maps status to that stage", async () => {
        const created = await createApp();
        const res = await patch(created.id, { stage: "offer" });
        assert.equal(res.status, 200);
        assert.equal(res.body.status, "offer");
        assert.equal(res.body.state, "open");
    });

    test("reopening a closed record clears its close reason", async () => {
        const created = await createApp({ status: "applied" });
        await patch(created.id, { state: "closed", close_reason: "lapsed" });
        const res = await patch(created.id, { state: "open" });
        assert.equal(res.status, 200);
        assert.equal(res.body.state, "open");
        assert.equal(res.body.close_reason, null);
        assert.equal(res.body.status, "applied");
    });

    test("record_type can be switched to lead", async () => {
        const created = await createApp();
        const res = await patch(created.id, { record_type: "lead" });
        assert.equal(res.status, 200);
        assert.equal(res.body.record_type, "lead");
    });

    test("a legacy write then a new-shape read round-trips", async () => {
        const created = await createApp();
        await setStatus(created.id, "offer");
        const read = await get(created.id);
        assert.equal(read.stage, "offer");
        assert.equal(read.state, "open");
    });

    test("a new-shape write then a legacy read round-trips", async () => {
        const created = await createApp({ status: "interview" });
        await patch(created.id, { state: "closed", close_reason: "role_closed" });
        const read = await get(created.id);
        assert.equal(read.status, "rejected");
        assert.equal(read.stage, "interview");
    });
});

describe("U4 validation", () => {
    test("rejects a close reason on an open record", async () => {
        const created = await createApp();
        const res = await patch(created.id, { close_reason: "withdrawn" });
        assert.equal(res.status, 400);
    });

    test("rejects an unknown close reason", async () => {
        const created = await createApp();
        const res = await patch(created.id, {
            state: "closed",
            close_reason: "ghosted_me",
        });
        assert.equal(res.status, 400);
    });

    test("rejects an unknown state", async () => {
        const created = await createApp();
        const res = await patch(created.id, { state: "paused" });
        assert.equal(res.status, 400);
    });

    test("rejects an unknown record_type", async () => {
        const created = await createApp();
        const res = await patch(created.id, { record_type: "relationship" });
        assert.equal(res.status, 400);
    });

    test("rejects an unknown stage", async () => {
        const created = await createApp();
        const res = await patch(created.id, { stage: "negotiating" });
        assert.equal(res.status, 400);
    });

    test("requires a close reason when closing", async () => {
        const created = await createApp({ status: "applied" });
        const res = await patch(created.id, { state: "closed" });
        assert.equal(res.status, 400);
    });
});
