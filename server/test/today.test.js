"use strict";

process.env.DB_PATH = ":memory:";
process.env.RATE_LIMIT_API = "100000";
process.env.RATE_LIMIT_UPLOADS = "100000";
process.env.INSTANCE_TIMEZONE = "Australia/Sydney";
process.env.ADMIN_EMAILS = "admin-today@example.com";

const { test, describe, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const supertest = require("supertest");
const app = require("../app");
const db = require("../db");
const { todayInInstanceZone } = require("../lib/followup");

const req = supertest(app);
const USER = "today@example.com";
const OTHER = "today-other@example.com";
const ADMIN = "admin-today@example.com";

function as(r, email = USER) {
    return r.set("X-Forwarded-Email", email).set("X-Forwarded-User", email);
}

function shiftDays(n) {
    const d = new Date(`${todayInInstanceZone()}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
}

async function mkApp(body = {}, email = USER) {
    const res = await as(req.post("/api/applications"), email).send({
        company_name: "Today Co",
        role_title: "Engineer",
        status: "applied",
        ...body,
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    return res.body;
}

async function mkContact(body = {}, email = USER) {
    const res = await as(req.post("/api/contacts"), email).send({
        name: "Someone",
        ...body,
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    return res.body;
}

async function today(email = USER, query = "") {
    const res = await as(req.get(`/api/today${query}`), email);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    return res.body;
}

// Each test starts from an empty tracker so membership assertions are exact.
beforeEach(() => {
    db.exec("DELETE FROM contacts; DELETE FROM applications;");
});

describe("GET /api/today", () => {
    test("an empty tracker returns an empty array", async () => {
        assert.deepEqual(await today(), []);
    });

    test("classifies overdue, due and this week, and excludes past the window (AE1)", async () => {
        await mkApp({ company_name: "Overdue Co", next_action_at: shiftDays(-3) });
        await mkContact({ name: "Due Person", next_action_at: shiftDays(0) });
        await mkApp({ company_name: "Edge Co", status: "interested", next_action_at: shiftDays(7) });
        await mkApp({ company_name: "Far Co", next_action_at: shiftDays(8) });

        const items = await today();
        assert.deepEqual(
            items.map((i) => [i.title, i.follow_up_state]),
            [
                ["Overdue Co", "overdue"],
                ["Due Person", "due"],
                ["Edge Co", "upcoming"],
            ],
        );
    });

    test("closed applications are excluded, including a legacy row with no state", async () => {
        await mkApp({ company_name: "Open Co", next_action_at: shiftDays(-1) });
        const closed = await mkApp({ company_name: "Closed Co" });
        const legacy = await mkApp({ company_name: "Legacy Co" });
        // A date set after closing, and a pre-split row the backfill never
        // reached: neither is open, so neither is owed.
        db.prepare(
            "UPDATE applications SET state = 'closed', close_reason = 'rejected', status = 'rejected', next_action_at = ? WHERE id = ?",
        ).run(shiftDays(-1), closed.id);
        db.prepare(
            "UPDATE applications SET state = NULL, stage = NULL, close_reason = NULL, record_type = NULL, status = 'rejected', next_action_at = ? WHERE id = ?",
        ).run(shiftDays(-1), legacy.id);

        assert.deepEqual(
            (await today()).map((i) => i.title),
            ["Open Co"],
        );
    });

    test("undated records are excluded", async () => {
        await mkApp({ company_name: "No Date Co" });
        await mkContact({ name: "No Date Person" });
        assert.deepEqual(await today(), []);
    });

    test("leads are included and carry their record type", async () => {
        await mkApp({ company_name: "Lead Co", status: "interested", next_action_at: shiftDays(1) });
        const [item] = await today();
        assert.equal(item.kind, "application");
        assert.equal(item.record_type, "lead");
    });

    test("kinds interleave by title on the same day rather than grouping", async () => {
        await mkApp({ company_name: "Bravo Co", next_action_at: shiftDays(-1) });
        await mkContact({ name: "Alpha Person", next_action_at: shiftDays(-1) });
        await mkContact({ name: "Charlie Person", next_action_at: shiftDays(-1) });

        assert.deepEqual(
            (await today()).map((i) => [i.kind, i.title]),
            [
                ["contact", "Alpha Person"],
                ["application", "Bravo Co"],
                ["contact", "Charlie Person"],
            ],
        );
    });

    test("an older date sorts first regardless of title", async () => {
        await mkApp({ company_name: "Aardvark Co", next_action_at: shiftDays(-1) });
        await mkContact({ name: "Zed Person", next_action_at: shiftDays(-5) });
        assert.deepEqual(
            (await today()).map((i) => i.title),
            ["Zed Person", "Aardvark Co"],
        );
    });

    test("a same-date same-title tie breaks by kind, then id", async () => {
        const a2 = await mkApp({ company_name: "Same", next_action_at: shiftDays(0) });
        await mkContact({ name: "Same", next_action_at: shiftDays(0) });
        const a1 = await mkApp({ company_name: "same", next_action_at: shiftDays(0) });

        const items = await today();
        assert.deepEqual(
            items.map((i) => [i.kind, i.id]),
            [
                ["application", a2.id],
                ["application", a1.id],
                ["contact", items[2].id],
            ],
        );
    });

    test("items carry the item shape for both kinds", async () => {
        await mkApp({
            company_name: "Shape Co",
            role_title: "Platform Lead",
            next_action_at: shiftDays(-2),
            next_action: "Chase the panel date",
        });
        await mkContact({ name: "Priya", employer: "Talent Ltd", next_action_at: shiftDays(1) });

        const [application, contact] = await today();
        assert.equal(application.kind, "application");
        assert.equal(application.title, "Shape Co");
        assert.equal(application.subtitle, "Platform Lead");
        assert.equal(application.next_action, "Chase the panel date");
        assert.equal(application.next_action_at, shiftDays(-2));
        assert.equal(application.follow_up_days, -2);

        assert.equal(contact.kind, "contact");
        assert.equal(contact.title, "Priya");
        assert.equal(contact.subtitle, "Talent Ltd");
        assert.equal(contact.next_action, null);
        assert.equal(contact.record_type, null);
        assert.equal(contact.follow_up_state, "upcoming");
    });

    test("another user's records never appear", async () => {
        await mkApp({ company_name: "Mine", next_action_at: shiftDays(0) });
        await mkApp({ company_name: "Theirs", next_action_at: shiftDays(0) }, OTHER);
        await mkContact({ name: "Their Person", next_action_at: shiftDays(0) }, OTHER);
        assert.deepEqual(
            (await today()).map((i) => i.title),
            ["Mine"],
        );
    });

    test("an admin with all=true sees every user's items, each with its owner", async () => {
        await mkApp({ company_name: "Mine", next_action_at: shiftDays(0) });
        await mkContact({ name: "Their Person", next_action_at: shiftDays(0) }, OTHER);

        const items = await today(ADMIN, "?all=true");
        assert.deepEqual(
            items.map((i) => [i.title, i.user_email]),
            [
                ["Mine", USER],
                ["Their Person", OTHER],
            ],
        );
    });

    test("a non-admin with all=true still sees only their own", async () => {
        await mkApp({ company_name: "Mine", next_action_at: shiftDays(0) });
        await mkApp({ company_name: "Theirs", next_action_at: shiftDays(0) }, OTHER);
        assert.deepEqual(
            (await today(USER, "?all=true")).map((i) => i.title),
            ["Mine"],
        );
    });
});
