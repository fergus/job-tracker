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

describe("record_type is evidence-based, never a side effect of closing", () => {
    test("closing a lead through the legacy status path leaves it a lead", async () => {
        const created = await createApp({ status: "interested" });
        await patch(created.id, { record_type: "lead" });

        const closed = await setStatus(created.id, "rejected");
        assert.equal(
            closed.record_type,
            "lead",
            "a lead you close is still a lead",
        );
    });

    test("closing a lead through the new shape leaves it a lead", async () => {
        const created = await createApp({ status: "interested" });
        await patch(created.id, { record_type: "lead" });

        const res = await patch(created.id, {
            state: "closed",
            close_reason: "not_pursued",
        });
        assert.equal(res.status, 200);
        assert.equal(res.body.record_type, "lead");
    });

    test("advancing the stage through the new shape promotes a lead to an application", async () => {
        const created = await createApp({ status: "interested" });
        await patch(created.id, { record_type: "lead" });

        const res = await patch(created.id, { stage: "applied" });
        assert.equal(res.status, 200);
        assert.equal(
            res.body.record_type,
            "application",
            "reaching applied is evidence of an application",
        );
    });

    test("an explicit record_type in the same write wins over the derived one", async () => {
        const created = await createApp({ status: "interested" });
        const res = await patch(created.id, {
            stage: "applied",
            record_type: "lead",
        });
        assert.equal(res.status, 200);
        assert.equal(res.body.record_type, "lead");
    });

    test("accepting a record makes it an application", async () => {
        const created = await createApp({ status: "interested" });
        await patch(created.id, { record_type: "lead" });
        const accepted = await setStatus(created.id, "accepted");
        assert.equal(accepted.record_type, "application");
    });
});

describe("closed_at tracks the closure that actually applies", () => {
    test("reopening clears closed_at so a re-close records the second date", async () => {
        const created = await createApp({ status: "applied" });

        const first = await patch(created.id, {
            state: "closed",
            close_reason: "lapsed",
        });
        assert.ok(first.body.closed_at);

        const reopened = await patch(created.id, { state: "open" });
        assert.equal(reopened.body.closed_at, null);

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

describe("filters see records the backfill has not reached", () => {
    // The deployed default is report mode, which writes nothing -- so every
    // row has NULL state/record_type until the operator opts in. Filtering on
    // the bare column would return an empty list on a live instance.
    const RAW_USER = "unbackfilled@example.com";
    const db = require("../db");

    function asRawUser(r) {
        return r.set("X-Forwarded-Email", RAW_USER).set("X-Forwarded-User", RAW_USER);
    }

    function seedLegacyRow(company, status) {
        db.prepare(
            `INSERT INTO applications
             (company_name, role_title, status, created_at, updated_at, applied_at, user_email)
             VALUES (?, 'Engineer', ?, datetime('now'), datetime('now'), datetime('now'), ?)`,
        ).run(company, status, RAW_USER);
    }

    test("an open-state filter finds a legacy row with no state written", async () => {
        seedLegacyRow("Legacy Open", "applied");
        const res = await asRawUser(req.get("/api/applications?state=open"));
        assert.equal(res.status, 200);
        assert.ok(res.body.some((a) => a.company_name === "Legacy Open"));
    });

    test("a closed-state filter finds a legacy rejected row with no state written", async () => {
        seedLegacyRow("Legacy Closed", "rejected");
        const res = await asRawUser(req.get("/api/applications?state=closed"));
        assert.equal(res.status, 200);
        assert.ok(res.body.some((a) => a.company_name === "Legacy Closed"));
    });

    test("a record_type filter treats an un-backfilled row as an application", async () => {
        seedLegacyRow("Legacy Typeless", "applied");
        const res = await asRawUser(
            req.get("/api/applications?record_type=application"),
        );
        assert.equal(res.status, 200);
        assert.ok(res.body.some((a) => a.company_name === "Legacy Typeless"));
    });

    test("an unknown legacy status value is rejected rather than ignored", async () => {
        const res = await asRawUser(req.get("/api/applications?status=withdrawn"));
        assert.equal(res.status, 400);
    });
});

describe("U7 filtering by the split fields", () => {
    // A dedicated user so these counts are not disturbed by other suites.
    const FILTER_USER = "filters@example.com";

    function asFilterUser(r) {
        return r
            .set("X-Forwarded-Email", FILTER_USER)
            .set("X-Forwarded-User", FILTER_USER);
    }

    async function seed() {
        const mk = async (company, status) => {
            const res = await asFilterUser(req.post("/api/applications"))
                .field("company_name", company)
                .field("role_title", "Engineer")
                .field("status", status);
            assert.equal(res.status, 201);
            return res.body;
        };

        const open = await mk("Open Co", "applied");
        const rejected = await mk("Rejected Co", "applied");
        await asFilterUser(req.patch(`/api/applications/${rejected.id}/status`)).send({
            status: "rejected",
        });
        const lapsed = await mk("Lapsed Co", "applied");
        await asFilterUser(req.put(`/api/applications/${lapsed.id}`)).send({
            state: "closed",
            close_reason: "lapsed",
        });
        const lead = await mk("Lead Co", "interested");
        await asFilterUser(req.put(`/api/applications/${lead.id}`)).send({
            record_type: "lead",
        });
        return { open, rejected, lapsed, lead };
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

describe("legacy rows keep their facts when the split fields are written", () => {
    // Until SCHEMA_BACKFILL=apply runs, every existing row has NULL split
    // columns and carries its facts only in the legacy status. Writing the
    // split fields from those NULLs would destroy them.
    const LEGACY_USER = "legacy@example.com";
    const db = require("../db");

    function asLegacyUser(r) {
        return r
            .set("X-Forwarded-Email", LEGACY_USER)
            .set("X-Forwarded-User", LEGACY_USER);
    }

    function seedLegacyRow(company, status, extra = {}) {
        const info = db
            .prepare(
                `INSERT INTO applications
                 (company_name, role_title, status, created_at, updated_at,
                  interested_at, applied_at, interview_at, offer_at, closed_at, user_email)
                 VALUES (?, 'Engineer', ?, datetime('now'), datetime('now'), ?, ?, ?, ?, ?, ?)`,
            )
            .run(
                company,
                status,
                extra.interested_at ?? "2026-01-01",
                extra.applied_at ?? null,
                extra.interview_at ?? null,
                extra.offer_at ?? null,
                extra.closed_at ?? null,
                LEGACY_USER,
            );
        return info.lastInsertRowid;
    }

    test("closing a legacy offer row keeps the stage it reached", async () => {
        const id = seedLegacyRow("Legacy Offer", "offer", {
            applied_at: "2026-01-02",
            offer_at: "2026-01-20",
        });

        const res = await asLegacyUser(req.put(`/api/applications/${id}`)).send({
            state: "closed",
            close_reason: "withdrawn",
        });
        assert.equal(res.status, 200, JSON.stringify(res.body));
        assert.equal(
            res.body.stage,
            "offer",
            "the record reached offer; closing must not erase that",
        );
        assert.equal(res.body.state, "closed");
        assert.equal(res.body.close_reason, "withdrawn");
    });

    test("closing a legacy row fills record_type rather than leaving it half-written", async () => {
        const id = seedLegacyRow("Legacy Typed", "interview", {
            applied_at: "2026-01-02",
            interview_at: "2026-01-10",
        });

        const res = await asLegacyUser(req.put(`/api/applications/${id}`)).send({
            state: "closed",
            close_reason: "role_closed",
        });
        assert.equal(res.status, 200);
        assert.equal(
            res.body.record_type,
            "application",
            "a half-written row would be skipped by the backfill selector forever",
        );
    });

    test("closing a legacy never-applied row stays a lead", async () => {
        const id = seedLegacyRow("Legacy Lead", "interested");

        const res = await asLegacyUser(req.put(`/api/applications/${id}`)).send({
            state: "closed",
            close_reason: "not_pursued",
        });
        assert.equal(res.status, 200);
        assert.equal(res.body.record_type, "lead");
        assert.equal(res.body.stage, "interested");
    });

    test("reopening through the legacy status path clears closed_at", async () => {
        const id = seedLegacyRow("Legacy Reopen", "rejected", {
            applied_at: "2026-01-02",
            closed_at: "2026-01-20T00:00:00.000Z",
        });

        const reopened = await asLegacyUser(
            req.patch(`/api/applications/${id}/status`),
        ).send({ status: "interview" });
        assert.equal(reopened.status, 200);
        assert.equal(
            reopened.body.closed_at,
            null,
            "a stale closure date makes a later re-close report the wrong day",
        );

        const reclosed = await asLegacyUser(req.put(`/api/applications/${id}`)).send({
            state: "closed",
            close_reason: "lapsed",
        });
        assert.ok(reclosed.body.closed_at);
        assert.notEqual(reclosed.body.closed_at, "2026-01-20T00:00:00.000Z");
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

describe("the legacy PATCH /status path preserves legacy rows too", () => {
    // The panel's status pills and the kanban's status-change events both use
    // PATCH /status, so this is the common route -- and it was the one left
    // reading the raw nullable columns after the PUT path was fixed.
    const PILL_USER = "pills@example.com";
    const db = require("../db");

    function asPillUser(r) {
        return r.set("X-Forwarded-Email", PILL_USER).set("X-Forwarded-User", PILL_USER);
    }

    function seedLegacyRow(company, status, extra = {}) {
        return db
            .prepare(
                `INSERT INTO applications
                 (company_name, role_title, status, created_at, updated_at,
                  interested_at, applied_at, interview_at, offer_at, closed_at, user_email)
                 VALUES (?, 'Engineer', ?, datetime('now'), datetime('now'), ?, ?, ?, ?, ?, ?)`,
            )
            .run(
                company,
                status,
                extra.interested_at ?? "2026-01-01",
                extra.applied_at ?? null,
                extra.interview_at ?? null,
                extra.offer_at ?? null,
                extra.closed_at ?? null,
                PILL_USER,
            ).lastInsertRowid;
    }

    function splitOf(id) {
        return db
            .prepare(
                "SELECT stage, state, close_reason, record_type, status FROM applications WHERE id = ?",
            )
            .get(id);
    }

    test("closing a legacy offer row through the pills keeps the stage", async () => {
        const id = seedLegacyRow("Pill Offer", "offer", {
            applied_at: "2026-01-02",
            offer_at: "2026-01-20",
        });

        const res = await asPillUser(req.patch(`/api/applications/${id}/status`)).send({
            status: "rejected",
        });
        assert.equal(res.status, 200);

        const row = splitOf(id);
        assert.equal(row.stage, "offer", "the offer stage must not collapse to interested");
        assert.equal(row.state, "closed");
        assert.equal(row.close_reason, "rejected");
        assert.equal(row.record_type, "application");
    });

    test("closing a legacy row through the pills does not strand it from the backfill", async () => {
        const id = seedLegacyRow("Pill Stranded", "interview", {
            applied_at: "2026-01-02",
            interview_at: "2026-01-10",
        });

        await asPillUser(req.patch(`/api/applications/${id}/status`)).send({
            status: "rejected",
        });

        const row = splitOf(id);
        const halfWritten =
            row.stage !== null &&
            (row.state === null || row.close_reason === null || row.record_type === null);
        assert.equal(
            halfWritten,
            false,
            "a half-written row is skipped by the apply selector forever",
        );
    });

    test("closing a legacy never-applied row through the pills stays a lead", async () => {
        const id = seedLegacyRow("Pill Lead", "interested");

        await asPillUser(req.patch(`/api/applications/${id}/status`)).send({
            status: "rejected",
        });

        const row = splitOf(id);
        assert.equal(row.record_type, "lead");
        assert.equal(row.stage, "interested");
    });

    test("the record_type filter derives from the legacy status before the backfill runs", async () => {
        // Assuming 'application' for a null column would return the leads too --
        // exactly the inflated count this change exists to fix.
        seedLegacyRow("Filter Applied", "applied", { applied_at: "2026-01-02" });
        seedLegacyRow("Filter Lead", "interested");

        const apps = await asPillUser(
            req.get("/api/applications?record_type=application"),
        );
        assert.equal(apps.status, 200);
        assert.ok(apps.body.some((a) => a.company_name === "Filter Applied"));
        assert.ok(
            !apps.body.some((a) => a.company_name === "Filter Lead"),
            "a never-applied legacy row must not count as an application",
        );

        const leads = await asPillUser(req.get("/api/applications?record_type=lead"));
        assert.equal(leads.status, 200);
        assert.ok(
            leads.body.some((a) => a.company_name === "Filter Lead"),
            "filtering for leads must find un-backfilled leads, not nothing",
        );
    });
});
