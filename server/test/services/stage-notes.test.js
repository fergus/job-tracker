"use strict";

process.env.DB_PATH = ":memory:";
process.env.RATE_LIMIT_API = "100000";
process.env.RATE_LIMIT_UPLOADS = "100000";

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const supertest = require("supertest");

const app = require("../../app");
const db = require("../../db");
const {
    visibleStageNotes,
    visibleStageNotesForApplications,
} = require("../../services/stage-notes");
const { convertApplicationToContact } = require("../../services/contacts");

const req = supertest(app);
const OWNER = "stage-notes-test@example.com";

function as(email) {
    return (r) => r.set("X-Forwarded-Email", email).set("X-Forwarded-User", email);
}

async function createApp(overrides = {}) {
    const res = await as(OWNER)(req.post("/api/applications"))
        .field("company_name", overrides.company_name ?? "Hidden Note Co")
        .field("role_title", overrides.role_title ?? "Engineer");
    assert.equal(res.status, 201, JSON.stringify(res.body));
    return res.body;
}

// No writer produces a hidden row until U3, so the read paths are proved
// against directly seeded rows. `at` orders notes deterministically.
function seedNote(appId, { content, hidden = false, at = "2026-01-01T00:00:00.000Z" }) {
    db.prepare(
        `INSERT INTO stage_notes (application_id, stage, content, created_at, updated_at, hidden_at)
         VALUES (?, 'applied', ?, ?, ?, ?)`,
    ).run(appId, content, at, at, hidden ? "2026-02-01T00:00:00.000Z" : null);
}

describe("visible stage notes accessor", () => {
    test("skips hidden notes for a single application", async () => {
        const created = await createApp();
        seedNote(created.id, { content: "visible one" });
        seedNote(created.id, { content: "withdrawn", hidden: true });

        const notes = visibleStageNotes(created.id);
        assert.deepEqual(
            notes.map((n) => n.content),
            ["visible one"],
        );
    });

    test("skips hidden notes across many applications", async () => {
        const first = await createApp();
        const second = await createApp();
        seedNote(first.id, { content: "first visible" });
        seedNote(first.id, { content: "first withdrawn", hidden: true });
        seedNote(second.id, { content: "second visible" });

        const notes = visibleStageNotesForApplications([first.id, second.id]);
        assert.deepEqual(
            notes.map((n) => n.content).sort(),
            ["first visible", "second visible"],
        );
    });

    test("keeps visible notes in their existing oldest-first order", async () => {
        const created = await createApp();
        seedNote(created.id, { content: "earliest", at: "2026-01-01T00:00:00.000Z" });
        seedNote(created.id, { content: "middle, withdrawn", hidden: true, at: "2026-01-02T00:00:00.000Z" });
        seedNote(created.id, { content: "latest", at: "2026-01-03T00:00:00.000Z" });

        assert.deepEqual(
            visibleStageNotes(created.id).map((n) => n.content),
            ["earliest", "latest"],
        );
    });

    test("returns nothing for an empty application list", () => {
        assert.deepEqual(visibleStageNotesForApplications([]), []);
    });
});

describe("hidden stage notes are absent from every read path", () => {
    test("the applications list payload", async () => {
        // Covers AE5.
        const created = await createApp();
        seedNote(created.id, { content: "list visible" });
        seedNote(created.id, { content: "list withdrawn", hidden: true });

        const res = await as(OWNER)(req.get("/api/applications"));
        assert.equal(res.status, 200);
        const row = res.body.find((r) => r.id === created.id);
        assert.deepEqual(
            row.notes.map((n) => n.content),
            ["list visible"],
        );
    });

    test("the assembled application context", async () => {
        const created = await createApp();
        seedNote(created.id, { content: "context visible" });
        seedNote(created.id, { content: "context withdrawn", hidden: true });

        const res = await as(OWNER)(req.get(`/api/applications/${created.id}/context`));
        assert.equal(res.status, 200);
        const serialised = JSON.stringify(res.body);
        assert.match(serialised, /context visible/);
        assert.doesNotMatch(
            serialised,
            /context withdrawn/,
            "a withdrawn note must not reach the assembled context",
        );
    });

    // The remaining three read paths -- document generation and the two MCP
    // context builders -- cannot be driven from here: generation calls out to a
    // model that needs an API key, and MCP has no in-process transport. The
    // fan-in is the assertion instead. Nothing outside the accessor and the
    // schema selects from stage_notes, so a hidden note has no route to any of
    // them, including no route to the model.
    test("document generation and the MCP builders read only through the accessor", () => {
        const root = path.join(__dirname, "..", "..");
        const readers = [
            "mcp.js",
            "routes/applications.js",
            "services/applications.js",
        ];
        for (const file of readers) {
            const source = fs.readFileSync(path.join(root, file), "utf8");
            assert.ok(
                !/SELECT[\s\S]{0,120}FROM stage_notes/.test(source),
                `${file} still reads stage_notes directly`,
            );
        }
    });

    test("conversion carries visible note prose only", async () => {
        // Covers AE4.
        const created = await createApp();
        seedNote(created.id, { content: "carried across" });
        seedNote(created.id, { content: "never carried", hidden: true });

        const contact = convertApplicationToContact(OWNER, created.id, {
            name: "Converted Person",
        });
        assert.match(contact.notes, /carried across/);
        assert.doesNotMatch(
            contact.notes,
            /never carried/,
            "a withdrawn note must not be carried into the contact",
        );
    });

    test("the conversion backup still contains the hidden note", async () => {
        const created = await createApp();
        seedNote(created.id, { content: "backed up even though hidden", hidden: true });

        convertApplicationToContact(OWNER, created.id, { name: "Backup Person" });

        const backup = db
            .prepare(
                "SELECT * FROM _row_backups WHERE operation = ? ORDER BY id DESC LIMIT 1",
            )
            .get("convert_application_to_contact");
        const parsed = JSON.parse(backup.row_json);
        assert.deepEqual(
            parsed.stage_notes.map((n) => n.content),
            ["backed up even though hidden"],
            "the backup exists to make the conversion recoverable, so it keeps every row",
        );
    });
});
