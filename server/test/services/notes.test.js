"use strict";

process.env.DB_PATH = ":memory:";
process.env.RATE_LIMIT_API = "100000";
process.env.RATE_LIMIT_UPLOADS = "100000";

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

// Initialise DB schema
require("../../app");
const db = require("../../db");
const { addNote, updateNote, deleteNote } = require("../../services/notes");
const {
    ServiceError,
    createApplication,
} = require("../../services/applications");

const TEST_EMAIL = "notes-test@example.com";

function makeApp() {
    return createApplication(TEST_EMAIL, {
        company_name: "Acme",
        role_title: "Engineer",
    });
}

describe("services/notes", () => {
    describe("addNote", () => {
        test("creates a note and updates application updated_at", () => {
            const app = makeApp();
            const before = app.updated_at;
            const note = addNote(TEST_EMAIL, app.id, {
                stage: "interview",
                content: "Great call",
            });
            assert.equal(note.stage, "interview");
            assert.equal(note.content, "Great call");
            assert.equal(note.application_id, app.id);

            const updatedApp = db
                .prepare("SELECT updated_at FROM applications WHERE id = ?")
                .get(app.id);
            assert.ok(updatedApp.updated_at >= before);
        });

        test("requires stage and content", () => {
            const app = makeApp();
            assert.throws(
                () => addNote(TEST_EMAIL, app.id, { stage: "interview" }),
                (err) =>
                    err instanceof ServiceError &&
                    err.status === 400 &&
                    err.message.includes("stage and content"),
            );
        });

        test("requires valid stage", () => {
            const app = makeApp();
            assert.throws(
                () =>
                    addNote(TEST_EMAIL, app.id, {
                        stage: "bogus",
                        content: "x",
                    }),
                (err) =>
                    err instanceof ServiceError &&
                    err.status === 400 &&
                    err.message.includes("Invalid stage"),
            );
        });

        test("rejects content over 10000 chars", () => {
            const app = makeApp();
            assert.throws(
                () =>
                    addNote(TEST_EMAIL, app.id, {
                        stage: "interview",
                        content: "x".repeat(10001),
                    }),
                (err) =>
                    err instanceof ServiceError &&
                    err.status === 400 &&
                    err.message.includes("maximum length"),
            );
        });

        test("returns 404 for unknown app", () => {
            assert.throws(
                () =>
                    addNote(TEST_EMAIL, 999999, {
                        stage: "interview",
                        content: "x",
                    }),
                (err) => err instanceof ServiceError && err.status === 404,
            );
        });
    });

    describe("updateNote", () => {
        test("updates content and stage", () => {
            const app = makeApp();
            const note = addNote(TEST_EMAIL, app.id, {
                stage: "interview",
                content: "Initial",
            });
            const updated = updateNote(TEST_EMAIL, app.id, note.id, {
                content: "Updated",
                stage: "offer",
            });
            assert.equal(updated.content, "Updated");
            assert.equal(updated.stage, "offer");
            assert.ok(updated.updated_at >= note.updated_at);
        });

        test("updates content only when stage omitted", () => {
            const app = makeApp();
            const note = addNote(TEST_EMAIL, app.id, {
                stage: "interview",
                content: "Initial",
            });
            const updated = updateNote(TEST_EMAIL, app.id, note.id, {
                content: "Updated",
            });
            assert.equal(updated.stage, "interview");
        });

        test("returns 404 for unknown app", () => {
            assert.throws(
                () => updateNote(TEST_EMAIL, 999999, 1, { content: "x" }),
                (err) => err instanceof ServiceError && err.status === 404,
            );
        });

        test("returns 404 for unknown note", () => {
            const app = makeApp();
            assert.throws(
                () => updateNote(TEST_EMAIL, app.id, 999999, { content: "x" }),
                (err) =>
                    err instanceof ServiceError &&
                    err.status === 404 &&
                    err.message.includes("Note not found"),
            );
        });

        test("requires content", () => {
            const app = makeApp();
            const note = addNote(TEST_EMAIL, app.id, {
                stage: "interview",
                content: "Initial",
            });
            assert.throws(
                () => updateNote(TEST_EMAIL, app.id, note.id, {}),
                (err) =>
                    err instanceof ServiceError &&
                    err.status === 400 &&
                    err.message.includes("content is required"),
            );
        });

        test("rejects invalid stage", () => {
            const app = makeApp();
            const note = addNote(TEST_EMAIL, app.id, {
                stage: "interview",
                content: "Initial",
            });
            assert.throws(
                () =>
                    updateNote(TEST_EMAIL, app.id, note.id, {
                        content: "Updated",
                        stage: "bogus",
                    }),
                (err) =>
                    err instanceof ServiceError &&
                    err.status === 400 &&
                    err.message.includes("Invalid stage"),
            );
        });
    });

    describe("deleteNote", () => {
        test("deletes note and updates application", () => {
            const app = makeApp();
            const note = addNote(TEST_EMAIL, app.id, {
                stage: "interview",
                content: "To delete",
            });
            const result = deleteNote(TEST_EMAIL, app.id, note.id);
            assert.deepEqual(result, { success: true });

            const remaining = db
                .prepare(
                    "SELECT COUNT(*) as count FROM stage_notes WHERE application_id = ?",
                )
                .get(app.id);
            assert.equal(remaining.count, 0);
        });

        test("returns 404 for unknown app", () => {
            assert.throws(
                () => deleteNote(TEST_EMAIL, 999999, 1),
                (err) => err instanceof ServiceError && err.status === 404,
            );
        });

        test("returns 404 for unknown note", () => {
            const app = makeApp();
            assert.throws(
                () => deleteNote(TEST_EMAIL, app.id, 999999),
                (err) =>
                    err instanceof ServiceError &&
                    err.status === 404 &&
                    err.message.includes("Note not found"),
            );
        });
    });
});
