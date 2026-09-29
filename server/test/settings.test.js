"use strict";

process.env.DB_PATH = ":memory:";
process.env.RATE_LIMIT_API = "100000";
process.env.RATE_LIMIT_UPLOADS = "100000";
process.env.INSTANCE_TIMEZONE = "Australia/Sydney";

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const supertest = require("supertest");
const app = require("../app");
const db = require("../db");

const req = supertest(app);

function as(r, email) {
    return r.set("X-Forwarded-Email", email).set("X-Forwarded-User", email);
}

let seq = 0;
function user() {
    seq += 1;
    return `settings-${seq}@example.com`;
}

async function mkApp(email) {
    const res = await as(req.post("/api/applications"), email).send({
        company_name: "Settings Co",
        role_title: "Engineer",
        status: "applied",
        next_action_at: "2026-10-01",
        next_action: "Chase",
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    return res.body;
}

function step(id) {
    return db
        .prepare("SELECT next_action_at, next_action FROM applications WHERE id = ?")
        .get(id);
}

describe("per-user settings", () => {
    test("clearing the next step on close defaults to on", async () => {
        const email = user();
        const res = await as(req.get("/api/me/settings"), email);
        assert.equal(res.status, 200, JSON.stringify(res.body));
        assert.deepEqual(res.body, { clear_next_step_on_close: true });
    });

    test("the setting round-trips", async () => {
        const email = user();
        const put = await as(req.put("/api/me/settings"), email).send({
            clear_next_step_on_close: false,
        });
        assert.equal(put.status, 200, JSON.stringify(put.body));
        assert.equal(put.body.clear_next_step_on_close, false);
        const get = await as(req.get("/api/me/settings"), email);
        assert.equal(get.body.clear_next_step_on_close, false);
    });

    test("a non-boolean is refused", async () => {
        const res = await as(req.put("/api/me/settings"), user()).send({
            clear_next_step_on_close: "no",
        });
        assert.equal(res.status, 400);
        assert.match(res.body.error, /clear_next_step_on_close/);
    });

    test("an empty write is refused", async () => {
        const res = await as(req.put("/api/me/settings"), user()).send({});
        assert.equal(res.status, 400);
    });

    test("settings are per user", async () => {
        const a = user();
        const b = user();
        await as(req.put("/api/me/settings"), a).send({ clear_next_step_on_close: false });
        const other = await as(req.get("/api/me/settings"), b);
        assert.equal(other.body.clear_next_step_on_close, true);
    });
});

describe("closing honours the setting", () => {
    test("with the default, closing clears both halves", async () => {
        const email = user();
        const a = await mkApp(email);
        await as(req.put(`/api/applications/${a.id}`), email).send({
            state: "closed",
            close_reason: "rejected",
        });
        assert.deepEqual(step(a.id), { next_action_at: null, next_action: null });
    });

    test("turned off, a split-field close keeps the step and reopening brings it back", async () => {
        const email = user();
        await as(req.put("/api/me/settings"), email).send({ clear_next_step_on_close: false });
        const a = await mkApp(email);
        await as(req.put(`/api/applications/${a.id}`), email).send({
            state: "closed",
            close_reason: "rejected",
        });
        assert.deepEqual(step(a.id), { next_action_at: "2026-10-01", next_action: "Chase" });

        await as(req.put(`/api/applications/${a.id}`), email).send({ state: "open" });
        const reopened = await as(req.get(`/api/applications/${a.id}`), email);
        assert.equal(reopened.body.next_action, "Chase");
        assert.equal(reopened.body.next_action_at, "2026-10-01");
    });

    test("turned off, a status close keeps the step", async () => {
        const email = user();
        await as(req.put("/api/me/settings"), email).send({ clear_next_step_on_close: false });
        const a = await mkApp(email);
        await as(req.patch(`/api/applications/${a.id}/status`), email).send({ status: "rejected" });
        assert.deepEqual(step(a.id), { next_action_at: "2026-10-01", next_action: "Chase" });
    });

    test("a kept step on a closed record still stays off Today", async () => {
        const email = user();
        await as(req.put("/api/me/settings"), email).send({ clear_next_step_on_close: false });
        const a = await mkApp(email);
        await as(req.patch(`/api/applications/${a.id}/status`), email).send({ status: "rejected" });
        const today = await as(req.get("/api/today"), email);
        assert.equal(today.body.some((i) => i.kind === "application" && i.id === a.id), false);
    });

    test("turned back on, closing clears again", async () => {
        const email = user();
        await as(req.put("/api/me/settings"), email).send({ clear_next_step_on_close: false });
        await as(req.put("/api/me/settings"), email).send({ clear_next_step_on_close: true });
        const a = await mkApp(email);
        await as(req.patch(`/api/applications/${a.id}/status`), email).send({ status: "accepted" });
        assert.deepEqual(step(a.id), { next_action_at: null, next_action: null });
    });
});

describe("creating an already-closed record honours the setting (review P3)", () => {
    async function mkClosed(email, status) {
        const res = await as(req.post("/api/applications"), email).send({
            company_name: "Closed At Birth Co",
            role_title: "Engineer",
            status,
            next_action_at: "2026-10-01",
            next_action: "Chase",
        });
        assert.equal(res.status, 201, JSON.stringify(res.body));
        return res.body;
    }

    test("with the default, a record created rejected carries no next step", async () => {
        const a = await mkClosed(user(), "rejected");
        assert.equal(a.state, "closed");
        assert.deepEqual(step(a.id), { next_action_at: null, next_action: null });
    });

    test("with the default, a record created accepted carries no next step", async () => {
        const a = await mkClosed(user(), "accepted");
        assert.deepEqual(step(a.id), { next_action_at: null, next_action: null });
    });

    test("turned off, a record created closed keeps its step", async () => {
        const email = user();
        await as(req.put("/api/me/settings"), email).send({ clear_next_step_on_close: false });
        const a = await mkClosed(email, "rejected");
        assert.deepEqual(step(a.id), { next_action_at: "2026-10-01", next_action: "Chase" });
    });

    test("an open record created with a step keeps it", async () => {
        const a = await mkClosed(user(), "applied");
        assert.deepEqual(step(a.id), { next_action_at: "2026-10-01", next_action: "Chase" });
    });

    test("a malformed date on a closed create is still refused", async () => {
        const res = await as(req.post("/api/applications"), user()).send({
            company_name: "Bad Date Co",
            role_title: "Engineer",
            status: "rejected",
            next_action_at: "next Thursday",
        });
        assert.equal(res.status, 400);
    });
});
