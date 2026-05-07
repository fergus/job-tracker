"use strict";

// Must be set before any require so db.js uses an in-memory database
process.env.DB_PATH = ":memory:";
// Disable rate limiting in tests
process.env.RATE_LIMIT_API = "100000";
process.env.RATE_LIMIT_UPLOADS = "100000";
process.env.ADMIN_EMAILS = "admin@example.com";

const { test, before, after, describe } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const supertest = require("supertest");
const app = require("../app");
const { uploadsDir } = require("../lib/files");

const req = supertest(app);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createApp(overrides = {}) {
    const res = await req
        .post("/api/applications")
        .field("company_name", overrides.company_name ?? "Acme Corp")
        .field("role_title", overrides.role_title ?? "Engineer")
        .field("status", overrides.status ?? "interested");
    assert.equal(res.status, 201);
    return res.body;
}

async function createNote(appId, overrides = {}) {
    const res = await req.post(`/api/applications/${appId}/notes`).send({
        stage: overrides.stage ?? "interview",
        content: overrides.content ?? "Initial note",
    });
    assert.equal(res.status, 201);
    return res.body;
}

// ---------------------------------------------------------------------------
// /api/me
// ---------------------------------------------------------------------------

describe("GET /.well-known/oauth-authorization-server", () => {
    test("returns 404 so MCP clients skip OAuth discovery", async () => {
        const res = await req
            .get("/.well-known/oauth-authorization-server")
            .set("Accept", "application/json");
        assert.equal(res.status, 404);
        assert.equal(
            res.body.error,
            "OAuth authorization server metadata not available",
        );
    });
});

describe("GET /api/me", () => {
    test("returns dev user when no auth header is present", async () => {
        const res = await req.get("/api/me");
        assert.equal(res.status, 200);
        assert.equal(res.body.email, "dev@localhost");
        assert.equal(res.body.isAdmin, false);
    });

    test("returns email from X-Forwarded-Email header", async () => {
        const res = await req
            .get("/api/me")
            .set("X-Forwarded-Email", "alice@example.com");
        assert.equal(res.status, 200);
        assert.equal(res.body.email, "alice@example.com");
    });
});

// ---------------------------------------------------------------------------
// Applications CRUD
// ---------------------------------------------------------------------------

describe("Applications", () => {
    test("GET /api/applications returns empty list initially", async () => {
        // Use a fresh user email so we don't see apps from other tests
        const res = await req
            .get("/api/applications")
            .set("X-Forwarded-Email", "empty@example.com");
        assert.equal(res.status, 200);
        assert.deepEqual(res.body, []);
    });

    test("POST /api/applications requires company_name and role_title", async () => {
        const res = await req
            .post("/api/applications")
            .field("company_name", "Acme");
        assert.equal(res.status, 400);
        assert.ok(res.body.error);
    });

    test("POST /api/applications creates an application with notes array", async () => {
        const res = await req
            .post("/api/applications")
            .field("company_name", "Globex")
            .field("role_title", "Developer");
        assert.equal(res.status, 201);
        assert.equal(res.body.company_name, "Globex");
        assert.equal(res.body.role_title, "Developer");
        assert.equal(res.body.status, "interested");
        assert.equal(res.body.user_email, "dev@localhost");
        assert.ok(
            res.body.interested_at,
            "interested_at should be set on creation",
        );
    });

    test("GET /api/applications/:id returns the application with notes", async () => {
        const created = await createApp({
            company_name: "Initech",
            role_title: "Analyst",
        });
        const res = await req.get(`/api/applications/${created.id}`);
        assert.equal(res.status, 200);
        assert.equal(res.body.company_name, "Initech");
        assert.ok(Array.isArray(res.body.notes), "notes should be an array");
    });

    test("GET /api/applications/:id returns 404 for unknown id", async () => {
        const res = await req.get("/api/applications/999999");
        assert.equal(res.status, 404);
    });

    test("PUT /api/applications/:id updates fields", async () => {
        const created = await createApp();
        const res = await req
            .put(`/api/applications/${created.id}`)
            .send({ role_title: "Senior Engineer" });
        assert.equal(res.status, 200);
        assert.equal(res.body.role_title, "Senior Engineer");
    });

    test("PUT /api/applications/:id with no fields returns 400", async () => {
        const created = await createApp();
        const res = await req.put(`/api/applications/${created.id}`).send({});
        assert.equal(res.status, 400);
    });

    test("DELETE /api/applications/:id removes the application", async () => {
        const created = await createApp();
        const del = await req.delete(`/api/applications/${created.id}`);
        assert.equal(del.status, 200);
        const get = await req.get(`/api/applications/${created.id}`);
        assert.equal(get.status, 404);
    });
});

// ---------------------------------------------------------------------------
// Status changes
// ---------------------------------------------------------------------------

describe("Status changes", () => {
    test("PATCH /api/applications/:id/status updates status and sets date field", async () => {
        const created = await createApp();
        const res = await req
            .patch(`/api/applications/${created.id}/status`)
            .send({ status: "applied" });
        assert.equal(res.status, 200);
        assert.equal(res.body.status, "applied");
        assert.ok(res.body.applied_at, "applied_at should be set");
    });

    test("PATCH /api/applications/:id/status rejects invalid status", async () => {
        const created = await createApp();
        const res = await req
            .patch(`/api/applications/${created.id}/status`)
            .send({ status: "nope" });
        assert.equal(res.status, 400);
    });

    test("status:interview sets interview_at", async () => {
        const created = await createApp();
        const res = await req
            .patch(`/api/applications/${created.id}/status`)
            .send({ status: "interview" });
        assert.equal(res.status, 200);
        assert.ok(res.body.interview_at);
    });

    test("status:rejected sets closed_at", async () => {
        const created = await createApp();
        const res = await req
            .patch(`/api/applications/${created.id}/status`)
            .send({ status: "rejected" });
        assert.equal(res.status, 200);
        assert.ok(res.body.closed_at);
    });

    test("status:accepted sets closed_at", async () => {
        const created = await createApp();
        const res = await req
            .patch(`/api/applications/${created.id}/status`)
            .send({ status: "accepted" });
        assert.equal(res.status, 200);
        assert.ok(res.body.closed_at);
    });
});

// ---------------------------------------------------------------------------
// Date editing
// ---------------------------------------------------------------------------

describe("Date editing", () => {
    test("PATCH /api/applications/:id/dates updates a single date field", async () => {
        const app = await createApp();
        const res = await req
            .patch(`/api/applications/${app.id}/dates`)
            .send({ applied_at: "2025-06-15T12:00:00.000Z" });
        assert.equal(res.status, 200);
        assert.equal(res.body.applied_at, "2025-06-15T12:00:00.000Z");
    });

    test("PATCH /api/applications/:id/dates updates multiple date fields", async () => {
        const app = await createApp();
        const res = await req.patch(`/api/applications/${app.id}/dates`).send({
            applied_at: "2025-06-10T12:00:00.000Z",
            responded_at: "2025-06-12T12:00:00.000Z",
            interview_at: "2025-06-14T12:00:00.000Z",
        });
        assert.equal(res.status, 200);
        assert.equal(res.body.applied_at, "2025-06-10T12:00:00.000Z");
        assert.equal(res.body.responded_at, "2025-06-12T12:00:00.000Z");
        assert.equal(res.body.interview_at, "2025-06-14T12:00:00.000Z");
    });

    test("PATCH /api/applications/:id/dates clears a date with null", async () => {
        const app = await createApp();
        // Set a date first
        await req
            .patch(`/api/applications/${app.id}/dates`)
            .send({ applied_at: "2025-06-15T12:00:00.000Z" });
        // Clear it
        const res = await req
            .patch(`/api/applications/${app.id}/dates`)
            .send({ applied_at: null });
        assert.equal(res.status, 200);
        assert.equal(res.body.applied_at, null);
    });

    test("PATCH /api/applications/:id/dates sets updated_at", async () => {
        const app = await createApp();
        await new Promise((r) => setTimeout(r, 10));
        const res = await req
            .patch(`/api/applications/${app.id}/dates`)
            .send({ offer_at: "2025-07-01T12:00:00.000Z" });
        assert.equal(res.status, 200);
        assert.ok(
            res.body.updated_at > app.updated_at,
            "updated_at should advance",
        );
    });

    test("PATCH /api/applications/:id/dates rejects invalid date value", async () => {
        const app = await createApp();
        const res = await req
            .patch(`/api/applications/${app.id}/dates`)
            .send({ applied_at: "not-a-date" });
        assert.equal(res.status, 400);
        assert.ok(res.body.error.includes("Invalid date"));
    });

    test("PATCH /api/applications/:id/dates rejects non-string non-null value", async () => {
        const app = await createApp();
        const res = await req
            .patch(`/api/applications/${app.id}/dates`)
            .send({ applied_at: 12345 });
        assert.equal(res.status, 400);
    });

    test("PATCH /api/applications/:id/dates returns 400 with no date fields", async () => {
        const app = await createApp();
        const res = await req
            .patch(`/api/applications/${app.id}/dates`)
            .send({});
        assert.equal(res.status, 400);
        assert.ok(res.body.error.includes("No date fields"));
    });

    test("PATCH /api/applications/:id/dates ignores unknown fields", async () => {
        const app = await createApp();
        const res = await req.patch(`/api/applications/${app.id}/dates`).send({
            applied_at: "2025-06-15T12:00:00.000Z",
            bogus_field: "ignored",
        });
        assert.equal(res.status, 200);
        assert.equal(res.body.applied_at, "2025-06-15T12:00:00.000Z");
    });

    test("PATCH /api/applications/:id/dates returns 404 for unknown app", async () => {
        const res = await req
            .patch("/api/applications/999999/dates")
            .send({ applied_at: "2025-06-15T12:00:00.000Z" });
        assert.equal(res.status, 404);
    });

    test("PATCH /api/applications/:id/dates returns 404 for another user app", async () => {
        const app = await createApp();
        const res = await req
            .patch(`/api/applications/${app.id}/dates`)
            .set("X-Forwarded-Email", "other@example.com")
            .send({ applied_at: "2025-06-15T12:00:00.000Z" });
        assert.equal(res.status, 404);
    });

    test("PATCH /api/applications/:id/dates returns application with notes array", async () => {
        const app = await createApp();
        await createNote(app.id);
        const res = await req
            .patch(`/api/applications/${app.id}/dates`)
            .send({ applied_at: "2025-06-15T12:00:00.000Z" });
        assert.equal(res.status, 200);
        assert.ok(
            Array.isArray(res.body.notes),
            "response should include notes array",
        );
        assert.equal(res.body.notes.length, 1);
    });

    test("PATCH /api/applications/:id/dates supports interested_at", async () => {
        const app = await createApp();
        const res = await req
            .patch(`/api/applications/${app.id}/dates`)
            .send({ interested_at: "2025-05-01T12:00:00.000Z" });
        assert.equal(res.status, 200);
        assert.equal(res.body.interested_at, "2025-05-01T12:00:00.000Z");
    });

    test("PATCH /api/applications/:id/dates supports closed_at", async () => {
        const app = await createApp();
        const res = await req
            .patch(`/api/applications/${app.id}/dates`)
            .send({ closed_at: "2025-08-01T12:00:00.000Z" });
        assert.equal(res.status, 200);
        assert.equal(res.body.closed_at, "2025-08-01T12:00:00.000Z");
    });
});

// ---------------------------------------------------------------------------
// Notes CRUD
// ---------------------------------------------------------------------------

describe("Notes", () => {
    test("POST /api/applications/:id/notes creates a note", async () => {
        const app = await createApp();
        const res = await req
            .post(`/api/applications/${app.id}/notes`)
            .send({ stage: "interview", content: "Great conversation" });
        assert.equal(res.status, 201);
        assert.equal(res.body.stage, "interview");
        assert.equal(res.body.content, "Great conversation");
        assert.ok(res.body.created_at);
        assert.ok(res.body.updated_at);
    });

    test("POST note sets updated_at equal to created_at", async () => {
        const app = await createApp();
        const note = await createNote(app.id);
        assert.equal(note.created_at, note.updated_at);
    });

    test("POST /api/applications/:id/notes requires stage and content", async () => {
        const app = await createApp();
        const res = await req
            .post(`/api/applications/${app.id}/notes`)
            .send({ stage: "interview" });
        assert.equal(res.status, 400);
    });

    test("GET /api/applications includes notes array on each application", async () => {
        const email = "notes-list@example.com";
        const appRes = await req
            .post("/api/applications")
            .set("X-Forwarded-Email", email)
            .field("company_name", "NotesCo")
            .field("role_title", "Tester");
        const appId = appRes.body.id;

        await req
            .post(`/api/applications/${appId}/notes`)
            .set("X-Forwarded-Email", email)
            .send({
                stage: "responded",
                content: "# Markdown heading\n- item 1",
            });

        const list = await req
            .get("/api/applications")
            .set("X-Forwarded-Email", email);
        assert.equal(list.status, 200);
        const found = list.body.find((a) => a.id === appId);
        assert.ok(found, "application should be in list");
        assert.equal(found.notes.length, 1);
        assert.equal(found.notes[0].content, "# Markdown heading\n- item 1");
    });

    test("GET /api/applications includes attachment_count", async () => {
        const email = "attach-count@example.com";
        const appRes = await req
            .post("/api/applications")
            .set("X-Forwarded-Email", email)
            .field("company_name", "AttachCo")
            .field("role_title", "Tester");
        const appId = appRes.body.id;

        const listBefore = await req
            .get("/api/applications")
            .set("X-Forwarded-Email", email);
        const foundBefore = listBefore.body.find((a) => a.id === appId);
        assert.equal(foundBefore.attachment_count, 0);

        await req
            .post(`/api/applications/${appId}/attachments`)
            .set("X-Forwarded-Email", email)
            .attach("files", Buffer.from("test content"), "test.txt");

        const listAfter = await req
            .get("/api/applications")
            .set("X-Forwarded-Email", email);
        const foundAfter = listAfter.body.find((a) => a.id === appId);
        assert.equal(foundAfter.attachment_count, 1);
    });

    test("PUT /api/applications/:id/notes/:noteId updates content and stage", async () => {
        const app = await createApp();
        const note = await createNote(app.id, {
            stage: "responded",
            content: "Old content",
        });

        const res = await req
            .put(`/api/applications/${app.id}/notes/${note.id}`)
            .send({ content: "Updated content", stage: "interview" });
        assert.equal(res.status, 200);
        assert.equal(res.body.content, "Updated content");
        assert.equal(res.body.stage, "interview");
    });

    test("PUT note sets updated_at later than created_at", async () => {
        const app = await createApp();
        const note = await createNote(app.id);

        // Small delay to ensure updated_at is strictly later
        await new Promise((r) => setTimeout(r, 10));

        const res = await req
            .put(`/api/applications/${app.id}/notes/${note.id}`)
            .send({ content: "Changed content" });
        assert.equal(res.status, 200);
        assert.ok(
            res.body.updated_at >= note.created_at,
            "updated_at should be >= created_at",
        );
        assert.notEqual(res.body.updated_at, note.created_at);
    });

    test("PUT note requires content", async () => {
        const app = await createApp();
        const note = await createNote(app.id);
        const res = await req
            .put(`/api/applications/${app.id}/notes/${note.id}`)
            .send({ stage: "offer" });
        assert.equal(res.status, 400);
    });

    test("DELETE /api/applications/:id/notes/:noteId removes the note", async () => {
        const app = await createApp();
        const note = await createNote(app.id);

        const del = await req.delete(
            `/api/applications/${app.id}/notes/${note.id}`,
        );
        assert.equal(del.status, 200);

        const appRes = await req.get(`/api/applications/${app.id}`);
        assert.equal(appRes.body.notes.length, 0);
    });
});

// ---------------------------------------------------------------------------
// API Key authentication
// ---------------------------------------------------------------------------

describe("API Key auth", () => {
    // Helper: generate an API key via OAuth-authenticated POST
    async function createKey(
        userEmail = "keyuser@example.com",
        label = "test-key",
    ) {
        const res = await req
            .post("/api/keys")
            .set("X-Forwarded-Email", userEmail)
            .send({ label });
        assert.equal(res.status, 201);
        assert.ok(res.body.key, "raw key must be present in creation response");
        return res.body;
    }

    test("valid Bearer key grants access without X-Forwarded-Email header", async () => {
        const { key } = await createKey("bearer-test@example.com");
        // Critical: agent path — Bearer only, no X-Forwarded-Email
        const res = await req
            .get("/api/me")
            .set("Authorization", `Bearer ${key}`);
        assert.equal(res.status, 200);
        assert.equal(res.body.email, "bearer-test@example.com");
    });

    test("valid Bearer key scopes requests to key owner", async () => {
        const userA = "user-a@example.com";
        const userB = "user-b@example.com";

        // Create an app for user A via OAuth
        const app = await req
            .post("/api/applications")
            .set("X-Forwarded-Email", userA)
            .field("company_name", "AcmeCorp")
            .field("role_title", "Engineer");
        assert.equal(app.status, 201);

        // Generate a key for user B
        const { key } = await createKey(userB);

        // User B's key should NOT see user A's application
        const res = await req
            .get("/api/applications")
            .set("Authorization", `Bearer ${key}`);
        assert.equal(res.status, 200);
        assert.ok(
            !res.body.some((a) => a.user_email === userA),
            "user B should not see user A apps",
        );
    });

    test("invalid Bearer token returns 401", async () => {
        const res = await req
            .get("/api/me")
            .set("Authorization", "Bearer not-a-real-key");
        assert.equal(res.status, 401);
        assert.equal(res.body.error, "Invalid API key");
    });

    test("malformed Authorization header returns 401", async () => {
        // Use a single-char token that enters the Bearer path but matches no key
        const res = await req.get("/api/me").set("Authorization", "Bearer x");
        assert.equal(res.status, 401);
    });

    test("revoked key returns 401", async () => {
        const { key, id } = await createKey("revoke-test@example.com");

        // Verify it works before revocation
        const before = await req
            .get("/api/me")
            .set("Authorization", `Bearer ${key}`);
        assert.equal(before.status, 200);

        // Revoke it
        const del = await req
            .delete(`/api/keys/${id}`)
            .set("X-Forwarded-Email", "revoke-test@example.com");
        assert.equal(del.status, 204);

        // Should now return 401
        const after = await req
            .get("/api/me")
            .set("Authorization", `Bearer ${key}`);
        assert.equal(after.status, 401);
    });

    test("existing OAuth path still works after auth refactor", async () => {
        const res = await req
            .get("/api/me")
            .set("X-Forwarded-Email", "oauth-regression@example.com");
        assert.equal(res.status, 200);
        assert.equal(res.body.email, "oauth-regression@example.com");
    });

    test("dev fallback still works when no auth headers present", async () => {
        const res = await req.get("/api/me");
        assert.equal(res.status, 200);
        assert.equal(res.body.email, "dev@localhost");
    });
});

// ---------------------------------------------------------------------------
// API Key management endpoints
// ---------------------------------------------------------------------------

describe("Key management", () => {
    const oauthUser = "keymgmt@example.com";

    test("POST /api/keys returns 201 with raw key and metadata", async () => {
        const res = await req
            .post("/api/keys")
            .set("X-Forwarded-Email", oauthUser)
            .send({ label: "my-key" });
        assert.equal(res.status, 201);
        assert.ok(res.body.key, "raw key must be returned");
        assert.equal(res.body.label, "my-key");
        assert.ok(res.body.id);
        assert.ok(res.body.created_at);
        // key_hash must never be returned
        assert.equal(res.body.key_hash, undefined);
    });

    test("POST /api/keys without label stores null label", async () => {
        const res = await req
            .post("/api/keys")
            .set("X-Forwarded-Email", oauthUser)
            .send({});
        assert.equal(res.status, 201);
        assert.equal(res.body.label, null);
    });

    test("GET /api/keys lists keys without key_hash", async () => {
        const email = "list-keys@example.com";
        await req
            .post("/api/keys")
            .set("X-Forwarded-Email", email)
            .send({ label: "k1" });
        await req
            .post("/api/keys")
            .set("X-Forwarded-Email", email)
            .send({ label: "k2" });

        const res = await req.get("/api/keys").set("X-Forwarded-Email", email);
        assert.equal(res.status, 200);
        assert.ok(Array.isArray(res.body));
        assert.ok(res.body.length >= 2);
        // key_hash must never appear in list responses
        for (const k of res.body) {
            assert.equal(k.key_hash, undefined);
            assert.equal(k.key, undefined);
        }
    });

    test("DELETE /api/keys/:id revokes key; GET no longer includes it", async () => {
        const email = "delete-key@example.com";
        const created = await req
            .post("/api/keys")
            .set("X-Forwarded-Email", email)
            .send({ label: "to-delete" });
        assert.equal(created.status, 201);

        const del = await req
            .delete(`/api/keys/${created.body.id}`)
            .set("X-Forwarded-Email", email);
        assert.equal(del.status, 204);

        const list = await req.get("/api/keys").set("X-Forwarded-Email", email);
        assert.ok(!list.body.some((k) => k.id === created.body.id));
    });

    test("DELETE /api/keys/:id with another user key returns 404 (not 403)", async () => {
        const owner = "owner@example.com";
        const other = "other@example.com";

        const created = await req
            .post("/api/keys")
            .set("X-Forwarded-Email", owner)
            .send({ label: "owners-key" });
        assert.equal(created.status, 201);

        const res = await req
            .delete(`/api/keys/${created.body.id}`)
            .set("X-Forwarded-Email", other);
        assert.equal(res.status, 404);
    });

    test("POST /api/keys with label > 100 chars returns 400", async () => {
        const longLabel = "a".repeat(101);
        const res = await req
            .post("/api/keys")
            .set("X-Forwarded-Email", oauthUser)
            .send({ label: longLabel });
        assert.equal(res.status, 400);
    });

    test("POST /api/keys via API key auth returns 403", async () => {
        const email = "apikey-mgmt@example.com";
        const created = await req
            .post("/api/keys")
            .set("X-Forwarded-Email", email)
            .send({ label: "bootstrap" });
        const rawKey = created.body.key;

        // Try to generate a new key using the API key itself
        const res = await req
            .post("/api/keys")
            .set("Authorization", `Bearer ${rawKey}`)
            .send({ label: "agent-generated" });
        assert.equal(res.status, 403);
    });

    test("GET /api/keys via API key auth returns 403", async () => {
        const email = "apikey-list@example.com";
        const created = await req
            .post("/api/keys")
            .set("X-Forwarded-Email", email)
            .send({ label: "list-test" });

        const res = await req
            .get("/api/keys")
            .set("Authorization", `Bearer ${created.body.key}`);
        assert.equal(res.status, 403);
    });

    test("DELETE /api/keys/:id via API key auth returns 403", async () => {
        const email = "apikey-del@example.com";
        const created = await req
            .post("/api/keys")
            .set("X-Forwarded-Email", email)
            .send({ label: "del-test" });

        const res = await req
            .delete(`/api/keys/${created.body.id}`)
            .set("Authorization", `Bearer ${created.body.key}`);
        assert.equal(res.status, 403);
    });
});

// ---------------------------------------------------------------------------
// MCP Server security hardening
// ---------------------------------------------------------------------------

describe("Profile", () => {
    test("GET /api/me/profile returns profile for authenticated user", async () => {
        const res = await req.get("/api/me/profile");
        assert.equal(res.status, 200);
        assert.equal(res.body.user_email, "dev@localhost");
        assert.ok(res.body.hasOwnProperty("full_name"));
    });

    test("PUT /api/me/profile updates fields", async () => {
        const res = await req.put("/api/me/profile").send({
            full_name: "Test User",
            location_city: "Berlin",
            target_roles: "Senior Engineer, Staff Engineer",
            cv_markdown: "# Test CV\n\nExperience here.",
        });
        assert.equal(res.status, 200);
        assert.equal(res.body.full_name, "Test User");
        assert.equal(res.body.location_city, "Berlin");
        assert.equal(res.body.target_roles, "Senior Engineer, Staff Engineer");
        assert.equal(res.body.cv_markdown, "# Test CV\n\nExperience here.");
        assert.ok(res.body.updated_at);
    });

    test("PUT /api/me/profile rejects invalid URL", async () => {
        const res = await req.put("/api/me/profile").send({
            linkedin_url: "not-a-url",
        });
        assert.equal(res.status, 400);
        assert.ok(res.body.error.includes("linkedin_url"));
    });

    test("PUT /api/me/profile returns 400 with no valid fields", async () => {
        const res = await req.put("/api/me/profile").send({
            bogus_field: "ignored",
        });
        assert.equal(res.status, 400);
        assert.ok(res.body.error.includes("No valid fields"));
    });

    test("PUT /api/me/profile via API key auth returns 403", async () => {
        // Create a key first
        const keyRes = await req
            .post("/api/keys")
            .set("X-Forwarded-Email", "profile-apikey@example.com")
            .send({ label: "profile-test" });
        assert.equal(keyRes.status, 201);
        const key = keyRes.body.key;

        const res = await req
            .put("/api/me/profile")
            .set("Authorization", `Bearer ${key}`)
            .send({ full_name: "Should Fail" });
        assert.equal(res.status, 403);
    });

    test("admin GET /api/users/:email/profile returns profile", async () => {
        // Create a profile for a non-admin user
        const email = "regular@example.com";
        await req
            .post("/api/applications")
            .set("X-Forwarded-Email", email)
            .field("company_name", "TestCo")
            .field("role_title", "Tester");

        // Admin reads it
        const res = await req
            .get(`/api/users/${email}/profile`)
            .set("X-Forwarded-Email", "admin@example.com");
        assert.equal(res.status, 200);
        assert.equal(res.body.user_email, email);
    });

    test("non-admin GET /api/users/:email/profile returns 403", async () => {
        const res = await req
            .get("/api/users/other@example.com/profile")
            .set("X-Forwarded-Email", "regular-user@example.com");
        assert.equal(res.status, 403);
    });
});

// ---------------------------------------------------------------------------
// Job Description Extraction
// ---------------------------------------------------------------------------

describe("Job Description Extraction", () => {
    test("POST /api/applications/:id/extract-jd returns 404 for unknown app", async () => {
        const res = await req.post("/api/applications/999999/extract-jd");
        assert.equal(res.status, 404);
    });

    test("POST /api/applications/:id/extract-jd returns 422 when job_description is empty", async () => {
        const app = await createApp();
        const res = await req.post(`/api/applications/${app.id}/extract-jd`);
        assert.equal(res.status, 422);
        assert.ok(res.body.error.includes("empty"));
    });

    test("POST /api/applications/:id/extract-jd returns 502 when OPENAI_API_KEY is not set", async () => {
        const app = await createApp();
        await req.put(`/api/applications/${app.id}`).send({
            job_description: "Senior Engineer role. Requires Python and AWS.",
        });
        const res = await req.post(`/api/applications/${app.id}/extract-jd`);
        assert.equal(res.status, 502);
        assert.ok(res.body.error.includes("unavailable"));
    });

    test("POST /api/applications/:id/fetch-jd returns 404 for unknown app", async () => {
        const res = await req.post("/api/applications/999999/fetch-jd");
        assert.equal(res.status, 404);
    });

    test("POST /api/applications/:id/fetch-jd returns 422 when job_posting_url is empty", async () => {
        const app = await createApp();
        const res = await req.post(`/api/applications/${app.id}/fetch-jd`);
        assert.equal(res.status, 422);
        assert.ok(res.body.error.includes("empty"));
    });

    test("POST /api/applications/:id/fetch-jd returns 502 when fetch fails", async () => {
        const app = await createApp();
        await req.put(`/api/applications/${app.id}`).send({
            job_posting_url:
                "https://invalid-domain-that-does-not-exist-12345.example.com/job",
        });
        const res = await req.post(`/api/applications/${app.id}/fetch-jd`);
        assert.equal(res.status, 502);
        assert.ok(res.body.error);
    });

    test("POST /api/applications/:id/extract-jd scopes to owner", async () => {
        const app = await createApp();
        await req
            .put(`/api/applications/${app.id}`)
            .send({ job_description: "Senior Engineer role." });
        const res = await req
            .post(`/api/applications/${app.id}/extract-jd`)
            .set("X-Forwarded-Email", "other@example.com");
        assert.equal(res.status, 404);
    });

    test("POST /api/applications/:id/fetch-jd scopes to owner", async () => {
        const app = await createApp();
        await req
            .put(`/api/applications/${app.id}`)
            .send({ job_posting_url: "https://example.com/job" });
        const res = await req
            .post(`/api/applications/${app.id}/fetch-jd`)
            .set("X-Forwarded-Email", "other@example.com");
        assert.equal(res.status, 404);
    });
});

// ---------------------------------------------------------------------------
// Context Assembly
// ---------------------------------------------------------------------------

describe("Context Assembly", () => {
    test("GET /api/applications/:id/context returns full context", async () => {
        const email = "context@example.com";
        const app = await req
            .post("/api/applications")
            .set("X-Forwarded-Email", email)
            .field("company_name", "ContextCo")
            .field("role_title", "Engineer")
            .field("job_description", "Build things");
        assert.equal(app.status, 201);
        const appId = app.body.id;

        // Add a note
        const noteRes = await req
            .post(`/api/applications/${appId}/notes`)
            .set("X-Forwarded-Email", email)
            .send({ stage: "interview", content: "Great chat" });
        assert.equal(noteRes.status, 201);

        // Add an attachment
        const attachRes = await req
            .post(`/api/applications/${appId}/attachments`)
            .set("X-Forwarded-Email", email)
            .attach("files", Buffer.from("resume text"), "resume.txt");
        assert.equal(attachRes.status, 201);

        // Update profile
        await req
            .put("/api/me/profile")
            .set("X-Forwarded-Email", email)
            .send({ full_name: "Context User", cv_markdown: "# CV" });

        // Get context
        const res = await req
            .get(`/api/applications/${appId}/context`)
            .set("X-Forwarded-Email", email);
        assert.equal(res.status, 200);
        assert.equal(res.body.application.id, appId);
        assert.equal(res.body.application.company_name, "ContextCo");
        assert.equal(res.body.job_description, "Build things");
        assert.equal(res.body.notes.length, 1);
        assert.equal(res.body.notes[0].content, "Great chat");
        assert.equal(res.body.attachments.length, 1);
        assert.equal(res.body.attachments[0].extracted_text, "resume text");
        assert.equal(res.body.profile.full_name, "Context User");
        assert.equal(res.body.profile.cv_markdown, "# CV");
    });

    test("GET /api/applications/:id/context returns empty context", async () => {
        const email = "empty-context@example.com";
        const app = await req
            .post("/api/applications")
            .set("X-Forwarded-Email", email)
            .field("company_name", "EmptyCo")
            .field("role_title", "Engineer");
        assert.equal(app.status, 201);
        const appId = app.body.id;

        const res = await req
            .get(`/api/applications/${appId}/context`)
            .set("X-Forwarded-Email", email);
        assert.equal(res.status, 200);
        assert.equal(res.body.application.id, appId);
        assert.deepEqual(res.body.notes, []);
        assert.deepEqual(res.body.attachments, []);
        assert.ok(res.body.profile);
        assert.equal(res.body.job_description, null);
    });

    test("GET /api/applications/:id/context returns 404 for unknown id", async () => {
        const res = await req.get("/api/applications/999999/context");
        assert.equal(res.status, 404);
    });

    test("GET /api/applications/:id/context returns 404 for another user app", async () => {
        const app = await createApp();
        const res = await req
            .get(`/api/applications/${app.id}/context`)
            .set("X-Forwarded-Email", "other@example.com");
        assert.equal(res.status, 404);
    });

    test("admin GET /api/applications/:id/context returns context and logs", async () => {
        const email = "admin-context@example.com";
        const app = await req
            .post("/api/applications")
            .set("X-Forwarded-Email", email)
            .field("company_name", "AdminCo")
            .field("role_title", "Engineer");
        assert.equal(app.status, 201);
        const appId = app.body.id;

        const res = await req
            .get(`/api/applications/${appId}/context`)
            .set("X-Forwarded-Email", "admin@example.com");
        assert.equal(res.status, 200);
        assert.equal(res.body.application.id, appId);
    });
});

// ---------------------------------------------------------------------------
// Document Generation
// ---------------------------------------------------------------------------

describe("Document Generation", () => {
    const extraction = require("../services/extraction");
    let originalGetOpenAIClient;

    before(() => {
        originalGetOpenAIClient = extraction.getOpenAIClient;
        extraction.getOpenAIClient = () => ({
            chat: {
                completions: {
                    create: async () => ({
                        choices: [
                            {
                                message: {
                                    content: "Mock generated cover letter text",
                                },
                            },
                        ],
                    }),
                },
            },
        });
    });

    after(() => {
        extraction.getOpenAIClient = originalGetOpenAIClient;
    });

    test("POST /api/applications/:id/generate creates a cover letter", async () => {
        const email = "gen@example.com";
        const app = await req
            .post("/api/applications")
            .set("X-Forwarded-Email", email)
            .field("company_name", "GenCo")
            .field("role_title", "Engineer")
            .field("job_description", "Build scalable systems");
        assert.equal(app.status, 201);
        const appId = app.body.id;

        const res = await req
            .post(`/api/applications/${appId}/generate`)
            .set("X-Forwarded-Email", email)
            .send({ task: "cover_letter" });

        assert.equal(res.status, 200);
        assert.equal(res.body.text, "Mock generated cover letter text");
        assert.ok(res.body.attachment);
        assert.equal(res.body.attachment.generated_by, "agent");
        assert.equal(res.body.attachment.generation_task, "cover_letter");
        assert.equal(res.body.attachment.mime_type, "text/markdown");

        // Verify attachment appears in application
        const attachRes = await req
            .get(`/api/applications/${appId}/attachments`)
            .set("X-Forwarded-Email", email);
        assert.equal(attachRes.status, 200);
        assert.equal(attachRes.body.length, 1);
        assert.equal(attachRes.body[0].generated_by, "agent");
    });

    test("POST /api/applications/:id/generate supports resume_tailor and interview_prep", async () => {
        const email = "gen-tasks@example.com";
        const app = await req
            .post("/api/applications")
            .set("X-Forwarded-Email", email)
            .field("company_name", "TaskCo")
            .field("role_title", "Engineer");
        assert.equal(app.status, 201);
        const appId = app.body.id;

        for (const task of ["resume_tailor", "interview_prep"]) {
            const res = await req
                .post(`/api/applications/${appId}/generate`)
                .set("X-Forwarded-Email", email)
                .send({ task });
            assert.equal(res.status, 200);
            assert.equal(res.body.attachment.generation_task, task);
        }

        const attachRes = await req
            .get(`/api/applications/${appId}/attachments`)
            .set("X-Forwarded-Email", email);
        assert.equal(attachRes.body.length, 2);
    });

    test("POST /api/applications/:id/generate returns 404 for unknown app", async () => {
        const res = await req
            .post("/api/applications/999999/generate")
            .send({ task: "cover_letter" });
        assert.equal(res.status, 404);
    });

    test("POST /api/applications/:id/generate returns 400 for invalid task", async () => {
        const app = await createApp();
        const res = await req
            .post(`/api/applications/${app.id}/generate`)
            .send({ task: "invalid_task" });
        assert.equal(res.status, 400);
    });

    test("POST /api/applications/:id/generate returns 400 for missing task", async () => {
        const app = await createApp();
        const res = await req
            .post(`/api/applications/${app.id}/generate`)
            .send({});
        assert.equal(res.status, 400);
    });

    test("admin can generate for another user app", async () => {
        const email = "gen-admin-user@example.com";
        const app = await req
            .post("/api/applications")
            .set("X-Forwarded-Email", email)
            .field("company_name", "AdminGenCo")
            .field("role_title", "Engineer");
        assert.equal(app.status, 201);
        const appId = app.body.id;

        const res = await req
            .post(`/api/applications/${appId}/generate`)
            .set("X-Forwarded-Email", "admin@example.com")
            .send({ task: "cover_letter" });
        assert.equal(res.status, 200);
        assert.equal(res.body.attachment.generation_task, "cover_letter");
    });
});

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

describe("MCP Server", () => {
    let mcpServer;
    let mcpReq;
    let apiKey;

    before(async () => {
        // Create a valid API key for MCP auth
        const keyRes = await req
            .post("/api/keys")
            .set("X-Forwarded-Email", "mcp-test@example.com")
            .send({ label: "mcp-test-key" });
        assert.equal(keyRes.status, 201);
        apiKey = keyRes.body.key;

        // Start MCP server on a random port
        const { startMcpServer } = require("../mcp");
        mcpServer = startMcpServer(0);
        await new Promise((resolve, reject) => {
            mcpServer.on("listening", resolve);
            mcpServer.on("error", reject);
        });
        mcpReq = supertest(mcpServer);
    });

    after(() => {
        if (mcpServer) mcpServer.close();
    });

    test("rejects requests without Bearer token", async () => {
        const res = await mcpReq.get("/");
        assert.equal(res.status, 401);
    });

    test("rejects invalid Bearer token", async () => {
        const res = await mcpReq
            .get("/")
            .set("Authorization", "Bearer invalid-key");
        assert.equal(res.status, 401);
    });

    test("includes Helmet security headers", async () => {
        const res = await mcpReq
            .get("/")
            .set("Authorization", `Bearer ${apiKey}`);
        assert.equal(res.headers["x-content-type-options"], "nosniff");
        assert.ok(
            res.headers["x-frame-options"],
            "X-Frame-Options should be present",
        );
    });

    test("rejects oversized JSON bodies with 413", async () => {
        const bigBody = { data: "x".repeat(200 * 1024) };
        const res = await mcpReq
            .post("/")
            .set("Authorization", `Bearer ${apiKey}`)
            .send(bigBody);
        assert.equal(res.status, 413);
    });

    test("rate limits excessive requests", async () => {
        process.env.RATE_LIMIT_MCP = "2";
        const { startMcpServer } = require("../mcp");
        const limitedServer = startMcpServer(0);
        await new Promise((resolve, reject) => {
            limitedServer.on("listening", resolve);
            limitedServer.on("error", reject);
        });
        const limitedReq = supertest(limitedServer);

        const r1 = await limitedReq
            .get("/")
            .set("Authorization", `Bearer ${apiKey}`);
        const r2 = await limitedReq
            .get("/")
            .set("Authorization", `Bearer ${apiKey}`);
        const r3 = await limitedReq
            .get("/")
            .set("Authorization", `Bearer ${apiKey}`);

        // GET / with auth but no session ID returns 400; 429 means rate limited.
        const notLimited = [400];
        assert.ok(
            notLimited.includes(r1.status),
            `first request should not be rate limited (got ${r1.status})`,
        );
        assert.ok(
            notLimited.includes(r2.status),
            `second request should not be rate limited (got ${r2.status})`,
        );
        assert.equal(r3.status, 429, "third request should be rate limited");

        limitedServer.close();
        delete process.env.RATE_LIMIT_MCP;
    });

    test("supports multiple sequential session initializations", async () => {
        const initBody = {
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: {
                protocolVersion: "2024-11-05",
                capabilities: {},
                clientInfo: { name: "test", version: "1.0" },
            },
        };

        const r1 = await mcpReq
            .post("/")
            .set("Authorization", `Bearer ${apiKey}`)
            .set("Accept", "application/json, text/event-stream")
            .set("Content-Type", "application/json")
            .send(initBody);

        assert.equal(
            r1.status,
            200,
            `first initialize should succeed, got: ${r1.body}`,
        );
        assert.ok(
            r1.headers["mcp-session-id"],
            "first session should have a session ID",
        );

        const r2 = await mcpReq
            .post("/")
            .set("Authorization", `Bearer ${apiKey}`)
            .set("Accept", "application/json, text/event-stream")
            .set("Content-Type", "application/json")
            .send(initBody);

        assert.equal(
            r2.status,
            200,
            `second initialize should succeed, got: ${r2.body}`,
        );
        assert.ok(
            r2.headers["mcp-session-id"],
            "second session should have a session ID",
        );
        assert.notEqual(
            r1.headers["mcp-session-id"],
            r2.headers["mcp-session-id"],
            "session IDs should be unique",
        );
    });

    test("get_application_context MCP tool returns assembled context", async () => {
        // Create an app for the MCP key owner (mcp-test@example.com)
        const appRes = await req
            .post("/api/applications")
            .set("X-Forwarded-Email", "mcp-test@example.com")
            .field("company_name", "McpCo")
            .field("role_title", "Engineer")
            .field("job_description", "MCP job desc");
        assert.equal(appRes.status, 201);
        const appId = appRes.body.id;

        // Add a note
        await req
            .post(`/api/applications/${appId}/notes`)
            .set("X-Forwarded-Email", "mcp-test@example.com")
            .send({ stage: "interview", content: "MCP note" });

        // Initialize MCP session
        const initBody = {
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: {
                protocolVersion: "2024-11-05",
                capabilities: {},
                clientInfo: { name: "test", version: "1.0" },
            },
        };

        const init = await mcpReq
            .post("/")
            .set("Authorization", `Bearer ${apiKey}`)
            .set("Accept", "application/json, text/event-stream")
            .set("Content-Type", "application/json")
            .send(initBody);
        assert.equal(init.status, 200);
        const sessionId = init.headers["mcp-session-id"];
        assert.ok(sessionId);

        // Call the tool
        const toolBody = {
            jsonrpc: "2.0",
            id: 2,
            method: "tools/call",
            params: {
                name: "get_application_context",
                arguments: { application_id: appId },
            },
        };

        const toolRes = await mcpReq
            .post("/")
            .set("Authorization", `Bearer ${apiKey}`)
            .set("Mcp-Session-Id", sessionId)
            .set("Accept", "application/json, text/event-stream")
            .set("Content-Type", "application/json")
            .send(toolBody);

        assert.equal(toolRes.status, 200);
        // MCP tool responses are SSE streams — parse the data line
        const lines = toolRes.text.trim().split("\n");
        const dataLine = lines.find((l) => l.startsWith("data: "));
        assert.ok(dataLine, "expected SSE data line");
        const parsed = JSON.parse(dataLine.slice("data: ".length));
        const result = parsed.result;
        assert.ok(result);
        assert.equal(result.content.length, 1);
        const payload = JSON.parse(result.content[0].text);
        assert.equal(payload.application.id, appId);
        assert.equal(payload.application.company_name, "McpCo");
        assert.equal(payload.job_description, "MCP job desc");
        assert.equal(payload.notes.length, 1);
        assert.equal(payload.notes[0].content, "MCP note");
        assert.ok(payload.profile);
    });

    test("get_application_context MCP tool returns error for unknown app", async () => {
        // Initialize MCP session
        const initBody = {
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: {
                protocolVersion: "2024-11-05",
                capabilities: {},
                clientInfo: { name: "test", version: "1.0" },
            },
        };

        const init = await mcpReq
            .post("/")
            .set("Authorization", `Bearer ${apiKey}`)
            .set("Accept", "application/json, text/event-stream")
            .set("Content-Type", "application/json")
            .send(initBody);
        assert.equal(init.status, 200);
        const sessionId = init.headers["mcp-session-id"];

        const toolBody = {
            jsonrpc: "2.0",
            id: 2,
            method: "tools/call",
            params: {
                name: "get_application_context",
                arguments: { application_id: 999999 },
            },
        };

        const toolRes = await mcpReq
            .post("/")
            .set("Authorization", `Bearer ${apiKey}`)
            .set("Mcp-Session-Id", sessionId)
            .set("Accept", "application/json, text/event-stream")
            .set("Content-Type", "application/json")
            .send(toolBody);

        assert.equal(toolRes.status, 200);
        const lines = toolRes.text.trim().split("\n");
        const dataLine = lines.find((l) => l.startsWith("data: "));
        assert.ok(dataLine);
        const parsed = JSON.parse(dataLine.slice("data: ".length));
        const result = parsed.result;
        assert.equal(result.isError, true);
        assert.ok(result.content[0].text.includes("not found"));
    });

    test("generate_document MCP tool creates an attachment", async () => {
        const extraction = require("../services/extraction");
        const original = extraction.getOpenAIClient;
        extraction.getOpenAIClient = () => ({
            chat: {
                completions: {
                    create: async () => ({
                        choices: [
                            { message: { content: "Mock MCP generated text" } },
                        ],
                    }),
                },
            },
        });

        try {
            const appRes = await req
                .post("/api/applications")
                .set("X-Forwarded-Email", "mcp-test@example.com")
                .field("company_name", "McpGenCo")
                .field("role_title", "Engineer")
                .field("job_description", "MCP gen job");
            assert.equal(appRes.status, 201);
            const appId = appRes.body.id;

            const initBody = {
                jsonrpc: "2.0",
                id: 1,
                method: "initialize",
                params: {
                    protocolVersion: "2024-11-05",
                    capabilities: {},
                    clientInfo: { name: "test", version: "1.0" },
                },
            };

            const init = await mcpReq
                .post("/")
                .set("Authorization", `Bearer ${apiKey}`)
                .set("Accept", "application/json, text/event-stream")
                .set("Content-Type", "application/json")
                .send(initBody);
            assert.equal(init.status, 200);
            const sessionId = init.headers["mcp-session-id"];

            const toolBody = {
                jsonrpc: "2.0",
                id: 2,
                method: "tools/call",
                params: {
                    name: "generate_document",
                    arguments: {
                        application_id: appId,
                        task: "interview_prep",
                    },
                },
            };

            const toolRes = await mcpReq
                .post("/")
                .set("Authorization", `Bearer ${apiKey}`)
                .set("Mcp-Session-Id", sessionId)
                .set("Accept", "application/json, text/event-stream")
                .set("Content-Type", "application/json")
                .send(toolBody);

            assert.equal(toolRes.status, 200);
            const lines = toolRes.text.trim().split("\n");
            const dataLine = lines.find((l) => l.startsWith("data: "));
            assert.ok(dataLine);
            const parsed = JSON.parse(dataLine.slice("data: ".length));
            const result = parsed.result;
            assert.ok(result);
            assert.equal(result.content.length, 1);
            assert.equal(result.content[0].text, "Mock MCP generated text");
            assert.ok(result.attachmentMetadata);
            assert.equal(
                result.attachmentMetadata.generation_task,
                "interview_prep",
            );
            assert.equal(result.attachmentMetadata.generated_by, "agent");

            // Verify attachment exists
            const attachCheck = await req
                .get(`/api/applications/${appId}/attachments`)
                .set("X-Forwarded-Email", "mcp-test@example.com");
            assert.equal(attachCheck.body.length, 1);
        } finally {
            extraction.getOpenAIClient = original;
        }
    });
});

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

describe("Attachments", () => {
    test("POST /api/applications/:id/attachments uploads files", async () => {
        const app = await createApp();
        const res = await req
            .post(`/api/applications/${app.id}/attachments`)
            .attach("files", Buffer.from("test content"), "test.txt");
        assert.equal(res.status, 201);
        assert.ok(Array.isArray(res.body));
        assert.equal(res.body.length, 1);
        assert.equal(res.body[0].original_filename, "test.txt");
        assert.equal(res.body[0].mime_type, "text/plain");
    });

    test("POST /api/applications/:id/attachments extracts text from txt files", async () => {
        const app = await createApp();
        const res = await req
            .post(`/api/applications/${app.id}/attachments`)
            .attach("files", Buffer.from("Hello extracted world"), "test.txt");
        assert.equal(res.status, 201);
        assert.equal(res.body[0].extracted_text, "Hello extracted world");
        assert.ok(res.body[0].extracted_at);
    });

    test("GET /api/applications/:id/attachments includes extracted_text", async () => {
        const app = await createApp();
        await req
            .post(`/api/applications/${app.id}/attachments`)
            .attach("files", Buffer.from("List me"), "test.txt");
        const list = await req.get(`/api/applications/${app.id}/attachments`);
        assert.equal(list.status, 200);
        assert.equal(list.body[0].extracted_text, "List me");
        assert.ok(list.body[0].extracted_at);
    });

    test("POST /api/applications/:id/attachments extracts text from pdf files", async () => {
        const app = await createApp();
        const minimalPdf = Buffer.from(
            "%PDF-1.4\n" +
                "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
                "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
                "3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<</Font<</F1<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>>>>>/Contents 4 0 R>>endobj\n" +
                "4 0 obj<</Length 44>>stream\n" +
                "BT\n" +
                "/F1 12 Tf\n" +
                "100 700 Td\n" +
                "(Hello PDF) Tj\n" +
                "ET\n" +
                "endstream\n" +
                "endobj\n" +
                "xref\n" +
                "0 5\n" +
                "0000000000 65535 f \n" +
                "0000000009 00000 n \n" +
                "0000000052 00000 n \n" +
                "0000000101 00000 n \n" +
                "0000000263 00000 n \n" +
                "trailer<</Size 5/Root 1 0 R>>\n" +
                "startxref\n" +
                "352\n" +
                "%%EOF\n",
        );
        const res = await req
            .post(`/api/applications/${app.id}/attachments`)
            .attach("files", minimalPdf, "test.pdf");
        assert.equal(res.status, 201);
        assert.ok(res.body[0].extracted_text.includes("Hello PDF"));
        assert.ok(res.body[0].extracted_at);
    });

    test("POST /api/applications/:id/attachments extracts text from docx files", async () => {
        const app = await createApp();
        const docxPath = path.join(__dirname, "fixtures", "minimal.docx");
        const res = await req
            .post(`/api/applications/${app.id}/attachments`)
            .attach("files", docxPath);
        assert.equal(res.status, 201);
        assert.ok(res.body[0].extracted_text.includes("Hello DOCX"));
        assert.ok(res.body[0].extracted_at);
    });

    test("POST /api/applications/:id/attachments handles corrupt pdf gracefully", async () => {
        const app = await createApp();
        const res = await req
            .post(`/api/applications/${app.id}/attachments`)
            .attach("files", Buffer.from("not a real pdf"), "fake.pdf");
        assert.equal(res.status, 201);
        assert.equal(res.body[0].extracted_text, null);
        assert.equal(res.body[0].extracted_at, null);
    });

    test("POST /api/applications/:id/attachments rejects unknown file types", async () => {
        const app = await createApp();
        const res = await req
            .post(`/api/applications/${app.id}/attachments`)
            .attach("files", Buffer.from("test content"), "test.exe");
        assert.equal(res.status, 400);
    });

    test("GET /api/applications/:id/attachments/:attachmentId/extracted-text returns text", async () => {
        const app = await createApp();
        const uploadRes = await req
            .post(`/api/applications/${app.id}/attachments`)
            .attach("files", Buffer.from("Extracted text content"), "test.txt");
        assert.equal(uploadRes.status, 201);
        const attachmentId = uploadRes.body[0].id;

        const res = await req.get(
            `/api/applications/${app.id}/attachments/${attachmentId}/extracted-text`,
        );
        assert.equal(res.status, 200);
        assert.equal(res.body.text, "Extracted text content");
        assert.ok(res.body.extracted_at);
    });

    test("GET extracted-text returns 404 when text was not extracted", async () => {
        const app = await createApp();
        // Insert an attachment row directly with no extracted_text to simulate
        // an attachment that hasn't been processed yet.
        const db = require("../db");
        const result = db
            .prepare(
                "INSERT INTO attachments (application_id, original_filename, stored_filename, file_size, mime_type, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))",
            )
            .run(app.id, "pending.txt", "pending.txt", 4, "text/plain");
        const attachmentId = result.lastInsertRowid;

        const res = await req.get(
            `/api/applications/${app.id}/attachments/${attachmentId}/extracted-text`,
        );
        assert.equal(res.status, 404);
        assert.ok(res.body.error);
    });

    test("GET extracted-text returns 404 for unknown attachment", async () => {
        const app = await createApp();
        const res = await req.get(
            `/api/applications/${app.id}/attachments/999999/extracted-text`,
        );
        assert.equal(res.status, 404);
    });

    test("GET extracted-text scopes to owner", async () => {
        const app = await createApp();
        const uploadRes = await req
            .post(`/api/applications/${app.id}/attachments`)
            .attach("files", Buffer.from("secret"), "test.txt");
        assert.equal(uploadRes.status, 201);
        const attachmentId = uploadRes.body[0].id;

        const res = await req
            .get(
                `/api/applications/${app.id}/attachments/${attachmentId}/extracted-text`,
            )
            .set("X-Forwarded-Email", "other@example.com");
        assert.equal(res.status, 404);
    });
});

// ---------------------------------------------------------------------------
// Audit Log
// ---------------------------------------------------------------------------

describe("Audit Log", () => {
    test("POST /api/applications creates an audit log entry", async () => {
        const res = await req
            .post("/api/applications")
            .field("company_name", "AuditTest")
            .field("role_title", "Engineer");
        assert.equal(res.status, 201);

        const auditRes = await req.get(
            `/api/applications/${res.body.id}/audit-log`,
        );
        assert.equal(auditRes.status, 200);
        assert.equal(auditRes.body.length, 1);
        assert.equal(auditRes.body[0].action, "create_application");
        assert.equal(auditRes.body[0].source, "rest");
        assert.equal(auditRes.body[0].auth_method, "oauth");
        assert.equal(auditRes.body[0].details.company_name, "AuditTest");
    });

    test("PUT /api/applications/:id creates an audit log entry", async () => {
        const app = await createApp();
        const res = await req.put(`/api/applications/${app.id}`).send({
            company_name: "UpdatedCo",
        });
        assert.equal(res.status, 200);

        const auditRes = await req.get(`/api/applications/${app.id}/audit-log`);
        assert.equal(auditRes.status, 200);
        const updateEntry = auditRes.body.find(
            (e) => e.action === "update_application",
        );
        assert.ok(updateEntry);
        assert.equal(updateEntry.source, "rest");
        assert.equal(updateEntry.auth_method, "oauth");
        assert.deepEqual(updateEntry.details.fields, ["company_name"]);
    });

    test("PATCH /api/applications/:id/status creates an audit log entry", async () => {
        const app = await createApp();
        const res = await req
            .patch(`/api/applications/${app.id}/status`)
            .send({ status: "applied" });
        assert.equal(res.status, 200);

        const auditRes = await req.get(`/api/applications/${app.id}/audit-log`);
        assert.equal(auditRes.status, 200);
        const statusEntry = auditRes.body.find(
            (e) => e.action === "update_status",
        );
        assert.ok(statusEntry);
        assert.equal(statusEntry.details.status, "applied");
    });

    test("POST /api/applications/:id/notes creates an audit log entry", async () => {
        const app = await createApp();
        const res = await req.post(`/api/applications/${app.id}/notes`).send({
            stage: "interview",
            content: "Test note",
        });
        assert.equal(res.status, 201);

        const auditRes = await req.get(`/api/applications/${app.id}/audit-log`);
        assert.equal(auditRes.status, 200);
        const noteEntry = auditRes.body.find((e) => e.action === "add_note");
        assert.ok(noteEntry);
        assert.equal(noteEntry.details.stage, "interview");
    });

    test("DELETE /api/applications/:id creates an audit log entry before deletion", async () => {
        const app = await createApp();
        const auditBefore = await req.get(
            `/api/applications/${app.id}/audit-log`,
        );
        assert.equal(auditBefore.body.length, 1);

        const del = await req.delete(`/api/applications/${app.id}`);
        assert.equal(del.status, 200);

        // Audit log is cascaded with the application
        const auditAfter = await req.get(
            `/api/applications/${app.id}/audit-log`,
        );
        assert.equal(auditAfter.status, 404);
    });

    test("API key actions are logged with auth_method=api_key", async () => {
        const keyRes = await req
            .post("/api/keys")
            .set("X-Forwarded-Email", "apikey-audit@example.com")
            .send({ label: "audit-test" });
        assert.equal(keyRes.status, 201);
        const key = keyRes.body.key;

        const res = await req
            .post("/api/applications")
            .set("Authorization", `Bearer ${key}`)
            .field("company_name", "ApiKeyCo")
            .field("role_title", "Dev");
        assert.equal(res.status, 201);

        const auditRes = await req
            .get(`/api/applications/${res.body.id}/audit-log`)
            .set("Authorization", `Bearer ${key}`);
        assert.equal(auditRes.status, 200);
        assert.equal(auditRes.body.length, 1);
        assert.equal(auditRes.body[0].auth_method, "api_key");
    });

    test("GET /api/applications/:id/audit-log returns 404 for non-owner", async () => {
        const app = await createApp();
        const res = await req
            .get(`/api/applications/${app.id}/audit-log`)
            .set("X-Forwarded-Email", "other@example.com");
        assert.equal(res.status, 404);
    });

    test("admin can access another user's audit log", async () => {
        const app = await createApp();
        const res = await req
            .get(`/api/applications/${app.id}/audit-log`)
            .set("X-Forwarded-Email", "admin@example.com");
        assert.equal(res.status, 200);
        assert.ok(Array.isArray(res.body));
    });

    test("audit log entries are sorted newest-first", async () => {
        const app = await createApp();
        await req
            .patch(`/api/applications/${app.id}/status`)
            .send({ status: "applied" });
        await req
            .patch(`/api/applications/${app.id}/status`)
            .send({ status: "responded" });

        const auditRes = await req.get(`/api/applications/${app.id}/audit-log`);
        assert.equal(auditRes.status, 200);
        assert.equal(auditRes.body.length, 3);
        const statuses = auditRes.body.map((e) => e.action);
        assert.deepEqual(statuses, [
            "update_status",
            "update_status",
            "create_application",
        ]);
    });
});

// ---------------------------------------------------------------------------
// File cleanup consistency
// ---------------------------------------------------------------------------

describe("File cleanup", () => {
    test("DELETE /api/applications/:id removes CV file from disk", async () => {
        const created = await req
            .post("/api/applications")
            .field("company_name", "TestCo")
            .field("role_title", "Engineer")
            .attach("cv", Buffer.from("cv content"), "cv.txt");

        assert.equal(created.status, 201);
        const cvPath = path.join(uploadsDir, created.body.cv_path);
        assert.ok(fs.existsSync(cvPath), "CV file should exist on disk");

        const del = await req.delete(`/api/applications/${created.body.id}`);
        assert.equal(del.status, 200);

        // Allow async file deletion to complete
        await new Promise((r) => setTimeout(r, 50));
        assert.ok(
            !fs.existsSync(cvPath),
            "CV file should be deleted from disk",
        );
    });

    test("DELETE /api/applications/:id removes attachment files from disk", async () => {
        const app = await createApp();
        const attachRes = await req
            .post(`/api/applications/${app.id}/attachments`)
            .attach("files", Buffer.from("attachment content"), "attach.txt");
        assert.equal(attachRes.status, 201);

        const storedFilename = attachRes.body[0].stored_filename;
        const filePath = path.join(uploadsDir, storedFilename);
        assert.ok(
            fs.existsSync(filePath),
            "Attachment file should exist on disk",
        );

        const del = await req.delete(`/api/applications/${app.id}`);
        assert.equal(del.status, 200);

        await new Promise((r) => setTimeout(r, 50));
        assert.ok(
            !fs.existsSync(filePath),
            "Attachment file should be deleted from disk",
        );
    });

    test("POST /api/applications/:id/cv replaces old CV file on disk", async () => {
        const created = await req
            .post("/api/applications")
            .field("company_name", "TestCo")
            .field("role_title", "Engineer")
            .attach("cv", Buffer.from("old cv"), "old.txt");
        assert.equal(created.status, 201);

        const oldPath = path.join(uploadsDir, created.body.cv_path);
        assert.ok(fs.existsSync(oldPath), "Old CV should exist");

        const replace = await req
            .post(`/api/applications/${created.body.id}/cv`)
            .attach("cv", Buffer.from("new cv"), "new.txt");
        assert.equal(replace.status, 200);

        await new Promise((r) => setTimeout(r, 50));
        assert.ok(
            !fs.existsSync(oldPath),
            "Old CV should be deleted after replacement",
        );
        assert.ok(
            fs.existsSync(path.join(uploadsDir, replace.body.cv_path)),
            "New CV should exist",
        );
    });

    test("DELETE /api/applications/:id/attachments/:attachmentId removes file from disk", async () => {
        const app = await createApp();
        const attachRes = await req
            .post(`/api/applications/${app.id}/attachments`)
            .attach("files", Buffer.from("attachment content"), "attach.txt");
        assert.equal(attachRes.status, 201);

        const attachmentId = attachRes.body[0].id;
        const storedFilename = attachRes.body[0].stored_filename;
        const filePath = path.join(uploadsDir, storedFilename);
        assert.ok(
            fs.existsSync(filePath),
            "Attachment file should exist on disk",
        );

        const del = await req.delete(
            `/api/applications/${app.id}/attachments/${attachmentId}`,
        );
        assert.equal(del.status, 200);

        await new Promise((r) => setTimeout(r, 50));
        assert.ok(
            !fs.existsSync(filePath),
            "Attachment file should be deleted from disk",
        );
    });
});
