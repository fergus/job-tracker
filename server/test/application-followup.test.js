"use strict";

process.env.DB_PATH = ":memory:";
process.env.RATE_LIMIT_API = "100000";
process.env.RATE_LIMIT_UPLOADS = "100000";
process.env.INSTANCE_TIMEZONE = "Australia/Sydney";
process.env.ADMIN_EMAILS = "admin-followup@example.com";

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const supertest = require("supertest");
const app = require("../app");
const db = require("../db");
const svc = require("../services/applications");
const { bus } = require("../lib/events");
const { todayInInstanceZone } = require("../lib/followup");

const req = supertest(app);
const USER = "app-followup@example.com";
const ADMIN = "admin-followup@example.com";

function as(r, email = USER) {
    return r.set("X-Forwarded-Email", email).set("X-Forwarded-User", email);
}

async function mkApp(body = {}) {
    const res = await as(req.post("/api/applications")).send({
        company_name: "Followup Co",
        role_title: "Engineer",
        status: "applied",
        ...body,
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    return res.body;
}

function rawRow(id) {
    return db.prepare("SELECT * FROM applications WHERE id = ?").get(id);
}

function shiftDays(n) {
    const d = new Date(`${todayInInstanceZone()}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
}

// updated_at is millisecond ISO, so a bump written in the same millisecond as
// the create would read as unchanged and pass the "untouched" tests vacuously.
function tick() {
    return new Promise((resolve) => setTimeout(resolve, 5));
}

describe("the application follow-up decorator", () => {
    test("classifies in the instance timezone (AE1)", () => {
        // 00:30 on 13 Aug in Sydney is still 12 Aug in UTC.
        const now = new Date("2026-08-12T14:30:00Z");
        const decorated = svc.withFollowUp({ id: 1, next_action_at: "2026-08-12" }, now);
        assert.equal(decorated.follow_up_state, "overdue");
        assert.equal(decorated.follow_up_days, -1);
        assert.equal(decorated.id, 1, "the row itself is carried through");
    });

    test("no date yields null fields that are present, not omitted", () => {
        const decorated = svc.withFollowUp({ id: 2, next_action_at: null });
        assert.ok("follow_up_state" in decorated);
        assert.ok("follow_up_days" in decorated);
        assert.equal(decorated.follow_up_state, null);
        assert.equal(decorated.follow_up_days, null);
    });
});

describe("writing the follow-up date", () => {
    test("create stores a date and returns the derived state", async () => {
        const a = await mkApp({ next_action_at: shiftDays(3) });
        assert.equal(a.next_action_at, shiftDays(3));
        assert.equal(a.follow_up_state, "upcoming");
        assert.equal(a.follow_up_days, 3);
    });

    test("create without a date returns null state", async () => {
        const a = await mkApp();
        assert.equal(a.next_action_at, null);
        assert.ok("follow_up_state" in a);
        assert.equal(a.follow_up_state, null);
        assert.equal(a.follow_up_days, null);
    });

    test("a multipart create with an empty date field stores null", async () => {
        const res = await as(req.post("/api/applications"))
            .field("company_name", "Multipart Co")
            .field("role_title", "Engineer")
            .field("next_action_at", "");
        assert.equal(res.status, 201, JSON.stringify(res.body));
        assert.equal(res.body.next_action_at, null);
        assert.equal(res.body.follow_up_state, null);
    });

    test("a full ISO timestamp is normalised to its calendar date", async () => {
        const a = await mkApp({ next_action_at: "2026-08-20T09:15:00.000Z" });
        assert.equal(a.next_action_at, "2026-08-20");

        const res = await as(req.put(`/api/applications/${a.id}`)).send({
            next_action_at: "2026-08-21T23:59:00Z",
        });
        assert.equal(res.status, 200, JSON.stringify(res.body));
        assert.equal(res.body.next_action_at, "2026-08-21");
    });

    for (const bad of ["2026-13-40", "2026-02-30", "next week", 20260820]) {
        test(`rejects ${JSON.stringify(bad)} and writes nothing`, async () => {
            const before = await mkApp({ next_action_at: "2026-08-20" });

            const put = await as(req.put(`/api/applications/${before.id}`)).send({
                next_action_at: bad,
                job_location: "Should not land",
            });
            assert.equal(put.status, 400);
            assert.equal(
                put.body.error,
                "next_action_at must be a calendar date (YYYY-MM-DD)",
            );
            const row = rawRow(before.id);
            assert.equal(row.next_action_at, "2026-08-20");
            assert.equal(row.job_location, null);
            assert.equal(row.updated_at, before.updated_at);

            const countBefore = db
                .prepare("SELECT COUNT(*) c FROM applications")
                .get().c;
            const post = await as(req.post("/api/applications")).send({
                company_name: "Bad Date Co",
                role_title: "Engineer",
                next_action_at: bad,
            });
            assert.equal(post.status, 400);
            const countAfter = db
                .prepare("SELECT COUNT(*) c FROM applications")
                .get().c;
            assert.equal(countAfter, countBefore, "a rejected create inserts nothing");
        });
    }

    test("a closed rejected record accepts a date six months out (AE3)", async () => {
        const a = await mkApp({ status: "rejected" });
        const sixMonths = shiftDays(183);
        const res = await as(req.put(`/api/applications/${a.id}`)).send({
            next_action_at: sixMonths,
        });
        assert.equal(res.status, 200, JSON.stringify(res.body));
        assert.equal(res.body.state, "closed");
        assert.equal(res.body.next_action_at, sixMonths);
        assert.equal(res.body.follow_up_state, "upcoming");
    });

    test("an empty string on update clears rather than storing ''", async () => {
        const a = await mkApp({ next_action_at: "2026-08-20" });
        const res = await as(req.put(`/api/applications/${a.id}`)).send({
            next_action_at: "",
        });
        assert.equal(res.status, 200, JSON.stringify(res.body));
        assert.equal(rawRow(a.id).next_action_at, null);
    });
});

describe("updated_at and change events", () => {
    test("setting then clearing the date leaves updated_at untouched", async () => {
        const a = await mkApp();
        await tick();

        const set = await as(req.put(`/api/applications/${a.id}`)).send({
            next_action_at: "2026-08-20",
        });
        assert.equal(set.status, 200, JSON.stringify(set.body));
        assert.equal(set.body.next_action_at, "2026-08-20");
        assert.equal(set.body.updated_at, a.updated_at);
        await tick();

        const clear = await as(req.put(`/api/applications/${a.id}`)).send({
            next_action_at: null,
        });
        assert.equal(clear.status, 200, JSON.stringify(clear.body));
        assert.equal(clear.body.next_action_at, null);
        assert.equal(clear.body.follow_up_state, null);
        assert.equal(clear.body.updated_at, a.updated_at);
    });

    test("the date written with another field bumps updated_at", async () => {
        const a = await mkApp();
        await tick();
        const res = await as(req.put(`/api/applications/${a.id}`)).send({
            next_action_at: "2026-08-20",
            job_location: "Sydney",
        });
        assert.equal(res.status, 200, JSON.stringify(res.body));
        assert.equal(res.body.next_action_at, "2026-08-20");
        assert.equal(res.body.job_location, "Sydney");
        assert.notEqual(res.body.updated_at, a.updated_at);
    });

    test("a date-only write still emits a change event", async () => {
        const a = await mkApp();
        const seen = [];
        const listener = (evt) => seen.push(evt);
        bus.on("change", listener);
        try {
            const res = await as(req.put(`/api/applications/${a.id}`)).send({
                next_action_at: "2026-08-20",
            });
            assert.equal(res.status, 200);
        } finally {
            bus.off("change", listener);
        }
        assert.ok(
            seen.some((e) => e.id === a.id && e.type === "updated" && e.userEmail === USER),
            JSON.stringify(seen),
        );
    });
});

describe("the date survives other writes (AE2)", () => {
    test("stage change, status change and a note leave it alone", async () => {
        const a = await mkApp({ next_action_at: "2026-08-20" });

        const staged = await as(req.put(`/api/applications/${a.id}`)).send({
            stage: "interview",
        });
        assert.equal(staged.status, 200, JSON.stringify(staged.body));
        assert.equal(staged.body.stage, "interview");
        assert.equal(staged.body.next_action_at, "2026-08-20");

        const status = await as(req.patch(`/api/applications/${a.id}/status`)).send({
            status: "offer",
        });
        assert.equal(status.status, 200, JSON.stringify(status.body));
        assert.equal(status.body.next_action_at, "2026-08-20");
        assert.ok("follow_up_state" in status.body);

        const note = await as(req.post(`/api/applications/${a.id}/notes`)).send({
            stage: "interview",
            content: "Panel went well",
        });
        assert.equal(note.status, 201, JSON.stringify(note.body));

        const read = await as(req.get(`/api/applications/${a.id}`));
        assert.equal(read.body.next_action_at, "2026-08-20");
    });
});

describe("every read path carries the derived fields", () => {
    test("GET /:id, GET /, the paginated list and PATCH /:id/dates", async () => {
        const a = await mkApp({ next_action_at: shiftDays(-2) });

        const one = await as(req.get(`/api/applications/${a.id}`));
        assert.equal(one.status, 200);
        assert.equal(one.body.follow_up_state, "overdue");
        assert.equal(one.body.follow_up_days, -2);
        assert.ok(Array.isArray(one.body.contacts), "contacts are still attached");
        assert.ok(Array.isArray(one.body.notes));

        const list = await as(req.get("/api/applications"));
        assert.equal(list.status, 200);
        const fromList = list.body.find((r) => r.id === a.id);
        assert.equal(fromList.follow_up_state, "overdue");
        for (const r of list.body) {
            assert.ok("follow_up_state" in r && "follow_up_days" in r);
        }

        const page = svc.listApplications(USER, { limit: 200 });
        const fromPage = page.items.find((r) => r.id === a.id);
        assert.equal(fromPage.follow_up_state, "overdue");
        assert.equal(fromPage.follow_up_days, -2);

        const bare = svc.listApplications(USER, { includeNotes: false });
        assert.equal(bare.find((r) => r.id === a.id).follow_up_state, "overdue");

        const dates = await as(req.patch(`/api/applications/${a.id}/dates`)).send({
            applied_at: "2026-08-01",
        });
        assert.equal(dates.status, 200, JSON.stringify(dates.body));
        assert.equal(dates.body.next_action_at, shiftDays(-2));
        assert.equal(dates.body.follow_up_state, "overdue");
        assert.equal(dates.body.follow_up_days, -2);
    });
});

describe("admin access", () => {
    test("an admin reads the fields on another user's record but cannot write them", async () => {
        const a = await mkApp({ next_action_at: shiftDays(0) });

        const read = await as(req.get(`/api/applications/${a.id}`), ADMIN);
        assert.equal(read.status, 200);
        assert.equal(read.body.next_action_at, shiftDays(0));
        assert.equal(read.body.follow_up_state, "due");
        assert.equal(read.body.follow_up_days, 0);

        const all = await as(req.get("/api/applications?all=true"), ADMIN);
        assert.equal(all.body.find((r) => r.id === a.id).follow_up_state, "due");

        const write = await as(req.put(`/api/applications/${a.id}`), ADMIN).send({
            next_action_at: "2030-01-01",
        });
        assert.equal(write.status, 404);
        assert.equal(rawRow(a.id).next_action_at, shiftDays(0));
    });
});
