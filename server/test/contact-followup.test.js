"use strict";

process.env.DB_PATH = ":memory:";
process.env.RATE_LIMIT_API = "100000";
process.env.RATE_LIMIT_UPLOADS = "100000";
process.env.INSTANCE_TIMEZONE = "Australia/Sydney";

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const supertest = require("supertest");
const app = require("../app");
const {
    followUpState,
    daysUntil,
    todayInInstanceZone,
} = require("../lib/followup");

const req = supertest(app);
const USER = "followup@example.com";

function as(r) {
    return r.set("X-Forwarded-Email", USER).set("X-Forwarded-User", USER);
}

async function mkContact(body) {
    const res = await as(req.post("/api/contacts")).send(body);
    assert.equal(res.status, 201, JSON.stringify(res.body));
    return res.body;
}

describe("the shared follow-up derivation", () => {
    test("classifies against today in the instance timezone", () => {
        // The boundary case the follow-up plan turns on: 00:30 on 13 Aug in
        // Sydney is still 12 Aug in UTC, and the answer must be the 13th.
        const justAfterMidnightSydney = new Date("2026-08-12T14:30:00Z");
        assert.equal(todayInInstanceZone(justAfterMidnightSydney), "2026-08-13");
        assert.equal(
            followUpState("2026-08-12", justAfterMidnightSydney),
            "overdue",
            "a date that is yesterday in Sydney is overdue, even though it is today in UTC",
        );
        assert.equal(followUpState("2026-08-13", justAfterMidnightSydney), "due");
        assert.equal(followUpState("2026-08-14", justAfterMidnightSydney), "upcoming");
    });

    test("reports how late or how soon", () => {
        const now = new Date("2026-08-12T14:30:00Z"); // 13 Aug in Sydney
        assert.equal(daysUntil("2026-08-10", now), -3);
        assert.equal(daysUntil("2026-08-13", now), 0);
        assert.equal(daysUntil("2026-08-20", now), 7);
    });

    test("no date yields no state rather than a guess", () => {
        assert.equal(followUpState(null), null);
        assert.equal(followUpState(""), null);
        assert.equal(daysUntil(null), null);
    });

    test("an unusable timezone falls back rather than crashing", () => {
        const saved = process.env.INSTANCE_TIMEZONE;
        process.env.INSTANCE_TIMEZONE = "Not/AZone";
        try {
            assert.match(todayInInstanceZone(), /^\d{4}-\d{2}-\d{2}$/);
        } finally {
            process.env.INSTANCE_TIMEZONE = saved;
        }
    });
});

describe("the contact interaction log", () => {
    test("records what happened and when, most recent first", async () => {
        const c = await mkContact({ name: "Trevor Churchley" });

        for (const [content, occurred_at] of [
            ["Introduced at the Talentology event", "2026-07-01"],
            ["Sent my CV through", "2026-07-15"],
            ["He replied with two roles", "2026-07-31"],
        ]) {
            const res = await as(req.post(`/api/contacts/${c.id}/notes`)).send({
                content,
                occurred_at,
            });
            assert.equal(res.status, 201, JSON.stringify(res.body));
        }

        const read = await as(req.get(`/api/contacts/${c.id}`));
        assert.equal(read.body.interactions.length, 3);
        assert.equal(read.body.interactions[0].occurred_at, "2026-07-31");
        assert.match(read.body.interactions[0].content, /two roles/);
    });

    test("logging an interaction advances last_contacted_at", async () => {
        const c = await mkContact({ name: "Advancer" });
        assert.equal(c.last_contacted_at, null);

        const res = await as(req.post(`/api/contacts/${c.id}/notes`)).send({
            content: "Called him",
            occurred_at: "2026-08-01",
        });
        assert.equal(res.body.last_contacted_at, "2026-08-01");
    });

    test("back-dating an older interaction does not rewind last_contacted_at", async () => {
        const c = await mkContact({ name: "Backdater" });
        await as(req.post(`/api/contacts/${c.id}/notes`)).send({
            content: "Recent",
            occurred_at: "2026-08-10",
        });
        const res = await as(req.post(`/api/contacts/${c.id}/notes`)).send({
            content: "Something I forgot to write up",
            occurred_at: "2026-06-01",
        });
        assert.equal(
            res.body.last_contacted_at,
            "2026-08-10",
            "writing up an old call must not make the relationship look staler",
        );
        assert.equal(res.body.interactions.length, 2);
    });

    test("defaults occurred_at to today in the instance timezone", async () => {
        const c = await mkContact({ name: "Defaulter" });
        const res = await as(req.post(`/api/contacts/${c.id}/notes`)).send({
            content: "Just spoke to her",
        });
        assert.equal(res.body.interactions[0].occurred_at, todayInInstanceZone());
    });

    test("rejects empty content and a malformed date", async () => {
        const c = await mkContact({ name: "Validator" });
        const blank = await as(req.post(`/api/contacts/${c.id}/notes`)).send({
            content: "   ",
        });
        assert.equal(blank.status, 400);

        const bad = await as(req.post(`/api/contacts/${c.id}/notes`)).send({
            content: "ok",
            occurred_at: "next tuesday",
        });
        assert.equal(bad.status, 400);
    });

    test("notes are removed with the contact, not orphaned", async () => {
        const c = await mkContact({ name: "Doomed" });
        await as(req.post(`/api/contacts/${c.id}/notes`)).send({ content: "x" });

        const db = require("../db");
        await as(req.delete(`/api/contacts/${c.id}`));
        const left = db
            .prepare("SELECT COUNT(*) c FROM contact_notes WHERE contact_id = ?")
            .get(c.id).c;
        assert.equal(left, 0);
    });

    test("cannot log against someone else's contact", async () => {
        const c = await mkContact({ name: "Private" });
        const res = await req
            .post(`/api/contacts/${c.id}/notes`)
            .set("X-Forwarded-Email", "other@example.com")
            .set("X-Forwarded-User", "other@example.com")
            .send({ content: "intruding" });
        assert.equal(res.status, 404);
    });
});

describe("who do I owe a touch", () => {
    test("returns contacts due on or before the bound, and no others", async () => {
        await mkContact({ name: "Owed Soon", next_action_at: "2026-08-20", next_action: "RSVP to the webinar" });
        await mkContact({ name: "Owed Later", next_action_at: "2026-09-30" });
        await mkContact({ name: "Nothing Owed" });

        const res = await as(req.get("/api/contacts?next_action_before=2026-08-23"));
        assert.equal(res.status, 200);
        const names = res.body.map((c) => c.name);
        assert.ok(names.includes("Owed Soon"));
        assert.ok(!names.includes("Owed Later"));
        assert.ok(!names.includes("Nothing Owed"));
    });

    test("the bound is inclusive", async () => {
        await mkContact({ name: "On The Day", next_action_at: "2026-08-25" });
        const res = await as(req.get("/api/contacts?next_action_before=2026-08-25"));
        assert.ok(res.body.some((c) => c.name === "On The Day"));
    });

    test("each contact carries its derived state, so callers do not recompute it", async () => {
        const c = await mkContact({ name: "Stateful", next_action_at: "2020-01-01" });
        const read = await as(req.get(`/api/contacts/${c.id}`));
        assert.equal(read.body.follow_up_state, "overdue");
        assert.ok(read.body.follow_up_days < 0);
    });

    test("the list leads with what is owed soonest, not alphabetically", async () => {
        const res = await as(req.get("/api/contacts?has_next_action=true"));
        const dated = res.body.filter((c) => c.next_action_at);
        const sorted = [...dated].sort((a, b) =>
            a.next_action_at.localeCompare(b.next_action_at),
        );
        assert.deepEqual(
            dated.map((c) => c.name),
            sorted.map((c) => c.name),
        );
    });

    test("logging an interaction can set the next touch in the same call", async () => {
        const c = await mkContact({ name: "Re-dater" });
        const res = await as(req.post(`/api/contacts/${c.id}/notes`)).send({
            content: "Emailed her the updated CV",
            occurred_at: "2026-08-14",
            next_action_at: "2026-08-21",
            next_action: "Chase the shortlist decision",
        });
        assert.equal(res.status, 201);
        assert.equal(res.body.next_action_at, "2026-08-21");
        assert.equal(res.body.next_action, "Chase the shortlist decision");
        assert.equal(res.body.last_contacted_at, "2026-08-14");
    });

    test("logging without naming a next touch leaves the existing one alone", async () => {
        const c = await mkContact({
            name: "Committed",
            next_action_at: "2026-09-01",
            next_action: "Call about the offer",
        });
        const res = await as(req.post(`/api/contacts/${c.id}/notes`)).send({
            content: "Bumped into him at a meetup",
        });
        assert.equal(res.body.next_action_at, "2026-09-01");
        assert.equal(res.body.next_action, "Call about the offer");
    });

    test("an explicit null on the note clears the commitment", async () => {
        const c = await mkContact({
            name: "Discharged",
            next_action_at: "2026-09-01",
            next_action: "Call about the offer",
        });
        const res = await as(req.post(`/api/contacts/${c.id}/notes`)).send({
            content: "Role is filled, nothing left to chase",
            next_action_at: null,
            next_action: null,
        });
        assert.equal(res.body.next_action_at, null);
        assert.equal(res.body.next_action, null);
        assert.equal(res.body.follow_up_state, null);
    });

    test("re-wording the next touch does not drop its date", async () => {
        const c = await mkContact({
            name: "Reworded",
            next_action_at: "2026-09-01",
            next_action: "Call",
        });
        const res = await as(req.post(`/api/contacts/${c.id}/notes`)).send({
            content: "She prefers email",
            next_action: "Email instead of calling",
        });
        assert.equal(res.body.next_action_at, "2026-09-01");
        assert.equal(res.body.next_action, "Email instead of calling");
    });

    test("rejects a malformed next_action_at on a note", async () => {
        const c = await mkContact({ name: "Note Validator" });
        const res = await as(req.post(`/api/contacts/${c.id}/notes`)).send({
            content: "Spoke to her",
            next_action_at: "next Thursday",
        });
        assert.equal(res.status, 400);
        const after = await as(req.get(`/api/contacts/${c.id}`));
        assert.equal(
            after.body.interactions.length,
            0,
            "a rejected note must not be written at all",
        );
    });

    test("a record's linked people carry their follow-up state", async () => {
        const app = await as(req.post("/api/applications")).send({
            company_name: "Linked Co",
            role_title: "Engineer",
            status: "interested",
        });
        const c = await mkContact({
            name: "Linked Person",
            next_action_at: "2020-01-01",
            next_action: "Long overdue call",
        });
        await as(req.post(`/api/contacts/${c.id}/links`)).send({
            application_id: app.body.id,
        });

        const res = await as(req.get(`/api/applications/${app.body.id}`));
        const person = res.body.contacts.find((p) => p.id === c.id);
        assert.equal(
            person.follow_up_state,
            "overdue",
            "the record's own panel must see who is owed a touch without a call per person",
        );
        assert.equal(person.next_action, "Long overdue call");
        assert.ok(person.follow_up_days < 0);
    });

    test("rejects a malformed bound rather than returning everything", async () => {
        const res = await as(req.get("/api/contacts?next_action_before=soon"));
        assert.equal(res.status, 400);
    });

    test("rejects a malformed next_action_at on write", async () => {
        const res = await as(req.post("/api/contacts")).send({
            name: "Bad Date",
            next_action_at: "the 25th",
        });
        assert.equal(res.status, 400);
    });
});
