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
    let r = req
        .post("/api/applications")
        .field("company_name", overrides.company_name ?? "Acme Corp")
        .field("role_title", overrides.role_title ?? "Engineer");
    if (overrides.stage) r = r.field("stage", overrides.stage);
    if (overrides.record_type) r = r.field("record_type", overrides.record_type);
    const res = await r;
    assert.equal(res.status, 201, JSON.stringify(res.body));
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

describe("create takes stage and record_type", () => {
    test("defaults to an open lead at interested", async () => {
        const created = await createApp();
        assert.equal(created.stage, "interested");
        assert.equal(created.state, "open");
        assert.equal(created.close_reason, null);
        assert.equal(created.record_type, "lead");
        assert.ok(created.interested_at);
    });

    test("a stage of applied or beyond makes the record an application", async () => {
        const created = await createApp({ stage: "applied" });
        assert.equal(created.stage, "applied");
        assert.equal(created.record_type, "application");
        assert.ok(created.applied_at);
    });

    test("stage wins over a conflicting record_type (AE4)", async () => {
        const created = await createApp({ stage: "interview", record_type: "lead" });
        assert.equal(created.stage, "interview");
        assert.equal(created.record_type, "application");
        assert.ok(created.interview_at);
    });

    test("below applied the given record_type holds (AE4)", async () => {
        const created = await createApp({
            stage: "interested",
            record_type: "application",
        });
        assert.equal(created.stage, "interested");
        assert.equal(created.record_type, "application");
    });

    test("never creates a closed record", async () => {
        const created = await createApp({ stage: "offer" });
        assert.equal(created.state, "open");
        assert.equal(created.closed_at, null);
    });

    test("rejects an unknown stage or record_type", async () => {
        for (const field of [
            ["stage", "negotiating"],
            ["stage", "accepted"],
            ["record_type", "relationship"],
        ]) {
            const res = await req
                .post("/api/applications")
                .field("company_name", "Bad Co")
                .field("role_title", "Engineer")
                .field(field[0], field[1]);
            assert.equal(res.status, 400, `expected 400 for ${field.join("=")}`);
        }
    });
});

describe("stage, state and close reason writes", () => {
    test("closing with a reason keeps that reason and the stage reached (AE1)", async () => {
        const created = await createApp({ stage: "interview" });
        const res = await patch(created.id, {
            state: "closed",
            close_reason: "withdrawn",
        });
        assert.equal(res.status, 200, JSON.stringify(res.body));
        assert.equal(res.body.state, "closed");
        assert.equal(res.body.close_reason, "withdrawn");
        assert.equal(res.body.stage, "interview");
        assert.ok(res.body.closed_at);
        assert.equal(res.body.offer_at, null);
    });

    test("every close reason is stored as given and never read back as rejected (AE7)", async () => {
        for (const reason of [
            "accepted",
            "rejected",
            "withdrawn",
            "role_closed",
            "lapsed",
            "not_pursued",
            "unresolved",
        ]) {
            const created = await createApp({ stage: "applied" });
            const res = await patch(created.id, {
                state: "closed",
                close_reason: reason,
            });
            assert.equal(res.status, 200);
            assert.equal(res.body.close_reason, reason);
            const read = await get(created.id);
            assert.equal(read.close_reason, reason);
        }
    });

    test("setting stage on an open record moves it and keeps it open", async () => {
        const created = await createApp();
        const res = await patch(created.id, { stage: "offer" });
        assert.equal(res.status, 200);
        assert.equal(res.body.stage, "offer");
        assert.equal(res.body.state, "open");
    });

    test("responses never carry the legacy status", async () => {
        const created = await createApp({ stage: "applied" });
        assert.equal("status" in created, false);
        const updated = await patch(created.id, { stage: "interview" });
        assert.equal("status" in updated.body, false);
        assert.equal("status" in (await get(created.id)), false);
        const list = await req.get("/api/applications");
        assert.ok(list.body.length > 0);
        assert.ok(list.body.every((a) => !("status" in a)));
        const ctx = await req.get(`/api/applications/${created.id}/context`);
        assert.equal(ctx.status, 200);
        assert.equal("status" in ctx.body.application, false);
    });
});

describe("stage writes stamp the stage date", () => {
    test("reaching a stage stamps its date and leaves earlier dates alone (AE8)", async () => {
        const created = await createApp({ stage: "applied" });
        const appliedAt = created.applied_at;
        assert.ok(appliedAt);
        assert.equal(created.interview_at, null);

        const res = await patch(created.id, { stage: "interview" });
        assert.equal(res.status, 200);
        assert.ok(res.body.interview_at);
        assert.equal(res.body.applied_at, appliedAt);
    });

    test("re-saving the stage a record is at does not overwrite its date", async () => {
        const created = await createApp({ stage: "applied" });
        const first = await patch(created.id, { stage: "interview" });
        const second = await patch(created.id, { stage: "interview" });
        assert.equal(second.body.interview_at, first.body.interview_at);
    });

    test("closing stamps closed_at and no stage date", async () => {
        const created = await createApp({ stage: "applied" });
        const closed = await patch(created.id, {
            state: "closed",
            close_reason: "rejected",
        });
        assert.ok(closed.body.closed_at);
        assert.equal(closed.body.interview_at, null);
        assert.equal(closed.body.offer_at, null);
    });

    test("reopening stamps the date of the stage it reopens at (AE6)", async () => {
        const created = await createApp({ stage: "applied" });
        await patch(created.id, { state: "closed", close_reason: "lapsed" });
        const res = await patch(created.id, { state: "open", stage: "responded" });
        assert.equal(res.status, 200);
        assert.equal(res.body.state, "open");
        assert.equal(res.body.stage, "responded");
        assert.equal(res.body.close_reason, null);
        assert.equal(res.body.closed_at, null);
        assert.ok(res.body.responded_at);
    });

    test("reopening at the stage it closed from stamps that stage again", async () => {
        const created = await createApp({ stage: "responded" });
        await patch(created.id, { state: "closed", close_reason: "lapsed" });
        await new Promise((r) => setTimeout(r, 5));
        const reopened = await patch(created.id, { state: "open" });
        assert.notEqual(reopened.body.responded_at, created.responded_at);
        assert.ok(reopened.body.responded_at);
    });
});

describe("record_type is evidence-based, never a side effect of closing", () => {
    test("closing a lead leaves it a lead", async () => {
        const created = await createApp();
        const res = await patch(created.id, {
            state: "closed",
            close_reason: "not_pursued",
        });
        assert.equal(res.status, 200);
        assert.equal(res.body.record_type, "lead");
    });

    test("advancing the stage past applied promotes a lead to an application", async () => {
        const created = await createApp();
        const res = await patch(created.id, { stage: "applied" });
        assert.equal(res.status, 200);
        assert.equal(res.body.record_type, "application");
    });

    test("an explicit record_type in the same write wins over the derived one", async () => {
        const created = await createApp();
        const res = await patch(created.id, {
            stage: "applied",
            record_type: "lead",
        });
        assert.equal(res.status, 200);
        assert.equal(res.body.record_type, "lead");
    });

    test("reopening does not overturn an explicit lead", async () => {
        // Regression: reopening a record parked past `applied` once flipped an
        // operator-set `lead` back to `application`, breaking the documented way
        // of keeping non-role records out of pipeline counts.
        const created = await createApp({ stage: "responded" });
        await patch(created.id, {
            state: "closed",
            close_reason: "not_pursued",
            record_type: "lead",
        });
        const reopened = await patch(created.id, { state: "open" });
        assert.equal(reopened.status, 200);
        assert.equal(reopened.body.record_type, "lead");
    });
});

describe("closed_at tracks the closure that actually applies", () => {
    test("reopening clears closed_at so a re-close records the second date", async () => {
        const created = await createApp({ stage: "applied" });

        const first = await patch(created.id, {
            state: "closed",
            close_reason: "lapsed",
        });
        assert.ok(first.body.closed_at);

        const reopened = await patch(created.id, { state: "open" });
        assert.equal(reopened.body.closed_at, null);

        await new Promise((r) => setTimeout(r, 5));
        const second = await patch(created.id, {
            state: "closed",
            close_reason: "withdrawn",
        });
        assert.ok(second.body.closed_at);
        assert.notEqual(
            second.body.closed_at,
            first.body.closed_at,
            "the second closure must not report the first closure's date",
        );
    });
});

describe("filtering by the split fields", () => {
    // A dedicated user so these counts are not disturbed by other suites.
    const FILTER_USER = "filters@example.com";

    function asFilterUser(r) {
        return r
            .set("X-Forwarded-Email", FILTER_USER)
            .set("X-Forwarded-User", FILTER_USER);
    }

    async function seed() {
        const mk = async (company, stage) => {
            const res = await asFilterUser(req.post("/api/applications"))
                .field("company_name", company)
                .field("role_title", "Engineer")
                .field("stage", stage);
            assert.equal(res.status, 201);
            return res.body;
        };

        await mk("Open Co", "applied");
        const rejected = await mk("Rejected Co", "applied");
        await asFilterUser(req.put(`/api/applications/${rejected.id}`)).send({
            state: "closed",
            close_reason: "rejected",
        });
        const lapsed = await mk("Lapsed Co", "applied");
        await asFilterUser(req.put(`/api/applications/${lapsed.id}`)).send({
            state: "closed",
            close_reason: "lapsed",
        });
        await mk("Lead Co", "interested");
    }

    test("filtering by open state excludes every closed record", async () => {
        await seed();
        const res = await asFilterUser(req.get("/api/applications?state=open"));
        assert.equal(res.status, 200);
        assert.ok(res.body.length > 0);
        assert.ok(res.body.every((a) => a.state === "open"));
        assert.ok(!res.body.some((a) => a.company_name === "Rejected Co"));
    });

    test("filtering by close reason returns only records carrying it", async () => {
        const res = await asFilterUser(
            req.get("/api/applications?close_reason=lapsed"),
        );
        assert.equal(res.status, 200);
        assert.ok(res.body.length > 0);
        assert.ok(res.body.every((a) => a.close_reason === "lapsed"));
    });

    test("filtering by record type excludes leads", async () => {
        const res = await asFilterUser(
            req.get("/api/applications?record_type=application"),
        );
        assert.equal(res.status, 200);
        assert.ok(res.body.every((a) => a.record_type === "application"));
        assert.ok(!res.body.some((a) => a.company_name === "Lead Co"));
    });

    test("combines a state filter with a company-name filter", async () => {
        const res = await asFilterUser(
            req.get("/api/applications?state=closed&company_name=Lapsed"),
        );
        assert.equal(res.status, 200);
        assert.equal(res.body.length, 1);
        assert.equal(res.body[0].company_name, "Lapsed Co");
    });

    test("rejects an unknown filter value rather than returning everything", async () => {
        for (const query of [
            "state=paused",
            "close_reason=ghosted",
            "record_type=relationship",
        ]) {
            const res = await asFilterUser(req.get(`/api/applications?${query}`));
            assert.equal(res.status, 400, `expected 400 for ${query}`);
        }
    });
});

describe("validation", () => {
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
        const created = await createApp({ stage: "applied" });
        const res = await patch(created.id, { state: "closed" });
        assert.equal(res.status, 400);
    });
});

describe("MCP surfaces contact errors as tool errors", () => {
    const { toolError } = require("../mcp");
    const contactsSvc = require("../services/contacts");
    const appsSvc = require("../services/applications");

    test("a contacts ServiceError becomes an isError result, not a thrown error", () => {
        const result = toolError(new contactsSvc.ServiceError(404, "Not found"));
        assert.equal(result.isError, true);
        assert.match(result.content[0].text, /404/);
    });

    test("an applications ServiceError still becomes an isError result", () => {
        const result = toolError(new appsSvc.ServiceError(400, "Invalid state"));
        assert.equal(result.isError, true);
    });

    test("an unexpected error still propagates", () => {
        assert.throws(() => toolError(new Error("boom")), /boom/);
    });
});
