"use strict";

// MCP tool registration tests. These construct an McpServer with
// createMcpServer() and inspect/drive the registered tools directly, which is
// what lets the note edit/delete tools be covered without standing up the
// Streamable HTTP transport.

process.env.DB_PATH = ":memory:";
process.env.RATE_LIMIT_API = "100000";
process.env.RATE_LIMIT_UPLOADS = "100000";

const { test, describe, before } = require("node:test");
const assert = require("node:assert/strict");

// Initialise DB schema
require("../app");
const { createMcpServer } = require("../mcp");
const { createApplication } = require("../services/applications");
const notesSvc = require("../services/notes");
const contactsSvc = require("../services/contacts");
const { visibleStageNotes } = require("../services/stage-notes");

const TEST_EMAIL = "mcp-test@example.com";

// The registered-tool map is private in the SDK's typings but present at
// runtime; it is the only way to reach a tool without a transport.
function tools() {
    return createMcpServer()._registeredTools;
}

function authed(email = TEST_EMAIL) {
    return { authInfo: { clientId: email } };
}

function parseResult(result) {
    assert.equal(result.isError, undefined, result.content?.[0]?.text);
    return JSON.parse(result.content[0].text);
}

describe("mcp note edit/delete tools", () => {
    let registered;

    before(() => {
        registered = tools();
    });

    const NOTE_TOOLS = [
        "update_note",
        "delete_note",
        "update_contact_note",
        "delete_contact_note",
    ];

    test("the four note tools are registered", () => {
        for (const name of NOTE_TOOLS) {
            assert.ok(registered[name], `${name} is not registered`);
        }
    });

    test("each tool declares the parameters its service function needs", () => {
        const expected = {
            update_note: ["id", "note_id", "content", "stage"],
            delete_note: ["id", "note_id"],
            update_contact_note: [
                "contact_id",
                "note_id",
                "content",
                "occurred_at",
            ],
            delete_contact_note: ["contact_id", "note_id"],
        };
        for (const [name, params] of Object.entries(expected)) {
            const shape = registered[name].inputSchema.def.shape;
            assert.deepEqual(
                Object.keys(shape).sort(),
                [...params].sort(),
                `${name} parameter list`,
            );
        }
    });

    test("a malformed call is rejected by the schema before reaching the service", () => {
        // Identifiers are required, so an empty call never reaches a service.
        for (const name of NOTE_TOOLS) {
            assert.equal(
                registered[name].inputSchema.safeParse({}).success,
                false,
                `${name} accepted an empty argument object`,
            );
        }
        // A string id is not silently coerced.
        assert.equal(
            registered.delete_note.inputSchema.safeParse({
                id: "1",
                note_id: 2,
            }).success,
            false,
        );
        // Empty content is rejected on the edit tools.
        assert.equal(
            registered.update_note.inputSchema.safeParse({
                id: 1,
                note_id: 2,
                content: "",
            }).success,
            false,
        );
    });

    test("the stage-note tools and the interaction tools are distinct handlers", () => {
        const handlers = NOTE_TOOLS.map((n) => registered[n].handler);
        assert.equal(new Set(handlers).size, NOTE_TOOLS.length);
        assert.notEqual(registered.update_note.handler, registered.add_note.handler);
    });

    test("every note tool refuses an unauthenticated call", async () => {
        for (const name of NOTE_TOOLS) {
            const result = await registered[name].handler({}, {});
            assert.equal(result.isError, true);
            assert.equal(result.content[0].text, "Unauthorized");
        }
    });

    test("update_note edits content and stage; delete_note hides the note", async () => {
        const app = createApplication(TEST_EMAIL, {
            company_name: "Acme",
            role_title: "Engineer",
        });
        const note = notesSvc.addNote(TEST_EMAIL, app.id, {
            stage: "applied",
            content: "origional spelling",
        });

        const updated = parseResult(
            await registered.update_note.handler(
                {
                    id: app.id,
                    note_id: note.id,
                    content: "original spelling",
                    stage: "interview",
                },
                authed(),
            ),
        );
        assert.equal(updated.content, "original spelling");
        assert.equal(updated.stage, "interview");

        const deleted = parseResult(
            await registered.delete_note.handler(
                { id: app.id, note_id: note.id },
                authed(),
            ),
        );
        assert.equal(deleted.success, true);
        assert.equal(
            visibleStageNotes(app.id).some((n) => n.id === note.id),
            false,
        );

        // Nothing brings a hidden note back: a second edit is a 404.
        const again = await registered.update_note.handler(
            { id: app.id, note_id: note.id, content: "again" },
            authed(),
        );
        assert.equal(again.isError, true);
        assert.match(again.content[0].text, /^Error 404: /);
    });

    test("update_contact_note corrects an interaction; delete_contact_note hides it", async () => {
        const contact = contactsSvc.createContact(TEST_EMAIL, {
            name: "Dana Recruiter",
        });
        contactsSvc.addContactNote(TEST_EMAIL, contact.id, {
            content: "spoke breifly",
            occurred_at: "2026-09-10",
        });
        const noteId = contactsSvc.notesForContact(contact.id)[0].id;

        const corrected = parseResult(
            await registered.update_contact_note.handler(
                {
                    contact_id: contact.id,
                    note_id: noteId,
                    content: "spoke briefly",
                },
                authed(),
            ),
        );
        assert.equal(corrected.interactions[0].content, "spoke briefly");

        const after = parseResult(
            await registered.delete_contact_note.handler(
                { contact_id: contact.id, note_id: noteId },
                authed(),
            ),
        );
        assert.equal(after.interactions.length, 0);
        // Freshness only advances: hiding the note does not rewind the date.
        assert.equal(after.last_contacted_at, "2026-09-10");
    });

    test("another user's note is not reachable", async () => {
        const app = createApplication(TEST_EMAIL, {
            company_name: "Beta",
            role_title: "Engineer",
        });
        const note = notesSvc.addNote(TEST_EMAIL, app.id, {
            stage: "applied",
            content: "mine",
        });
        const result = await registered.delete_note.handler(
            { id: app.id, note_id: note.id },
            authed("intruder@example.com"),
        );
        assert.equal(result.isError, true);
        assert.match(result.content[0].text, /^Error 404: /);
    });
});
