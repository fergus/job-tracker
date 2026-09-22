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
const { visibleStageNotes } = require("../../services/stage-notes");
const {
    ServiceError,
    createApplication,
} = require("../../services/applications");

const TEST_EMAIL = "notes-test@example.com";
const OTHER_EMAIL = "notes-other@example.com";

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

        // Logging a chase is the moment you know when to chase next, so the
        // note and the commitment land in one call rather than two.
        test("records the next follow-up date in the same call", () => {
            const app = makeApp();
            addNote(TEST_EMAIL, app.id, {
                stage: "interview",
                content: "Chased the recruiter",
                next_action_at: "2099-03-04",
            });

            const row = db
                .prepare("SELECT next_action_at FROM applications WHERE id = ?")
                .get(app.id);
            assert.equal(row.next_action_at, "2099-03-04");
        });

        test("omitting the date leaves an existing commitment alone", () => {
            const app = createApplication(TEST_EMAIL, {
                company_name: "Acme",
                role_title: "Engineer",
                next_action_at: "2099-05-06",
            });
            addNote(TEST_EMAIL, app.id, {
                stage: "interview",
                content: "Bumped into them at a meetup",
            });

            const row = db
                .prepare("SELECT next_action_at FROM applications WHERE id = ?")
                .get(app.id);
            assert.equal(row.next_action_at, "2099-05-06");
        });

        test("an explicit null clears the commitment", () => {
            const app = createApplication(TEST_EMAIL, {
                company_name: "Acme",
                role_title: "Engineer",
                next_action_at: "2099-05-06",
            });
            addNote(TEST_EMAIL, app.id, {
                stage: "rejected",
                content: "Role is filled, nothing left to chase",
                next_action_at: null,
            });

            const row = db
                .prepare("SELECT next_action_at FROM applications WHERE id = ?")
                .get(app.id);
            assert.equal(row.next_action_at, null);
        });

        // Validated before the transaction opens: a bad date must not leave a
        // note behind with no re-dating.
        test("a malformed date rejects the note as well", () => {
            const app = makeApp();
            assert.throws(
                () =>
                    addNote(TEST_EMAIL, app.id, {
                        stage: "interview",
                        content: "Spoke to them",
                        next_action_at: "next Thursday",
                    }),
                (err) => err instanceof ServiceError && err.status === 400,
            );

            const notes = db
                .prepare(
                    "SELECT COUNT(*) c FROM stage_notes WHERE application_id = ?",
                )
                .get(app.id).c;
            assert.equal(notes, 0, "a rejected write must not store the note");
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
        // A delete hides the note; what it said has to survive so the record of
        // the relationship stays honest.
        test("hides the note but keeps the row", () => {
            const app = makeApp();
            const note = addNote(TEST_EMAIL, app.id, {
                stage: "interview",
                content: "To delete",
            });
            const result = deleteNote(TEST_EMAIL, app.id, note.id);
            assert.deepEqual(result, { success: true });

            const row = db
                .prepare("SELECT * FROM stage_notes WHERE id = ?")
                .get(note.id);
            assert.ok(row, "row survives the delete");
            assert.equal(row.content, "To delete");
            assert.ok(row.hidden_at, "hidden_at is stamped");
        });

        test("a deleted note is absent from the application's notes", () => {
            const app = makeApp();
            const kept = addNote(TEST_EMAIL, app.id, {
                stage: "interview",
                content: "Kept",
            });
            const gone = addNote(TEST_EMAIL, app.id, {
                stage: "interview",
                content: "To delete",
            });
            deleteNote(TEST_EMAIL, app.id, gone.id);

            const visible = visibleStageNotes(app.id);
            assert.deepEqual(
                visible.map((n) => n.id),
                [kept.id],
            );
        });

        test("bumps the parent application's updated_at", () => {
            const app = makeApp();
            const note = addNote(TEST_EMAIL, app.id, {
                stage: "interview",
                content: "To delete",
            });
            const before = db
                .prepare("SELECT updated_at FROM applications WHERE id = ?")
                .get(app.id).updated_at;

            deleteNote(TEST_EMAIL, app.id, note.id);

            const after = db
                .prepare("SELECT updated_at FROM applications WHERE id = ?")
                .get(app.id).updated_at;
            assert.ok(after >= before);
        });

        // A hidden note is not found for writes either, so a second delete
        // fails exactly as a delete of someone else's note would.
        test("deleting an already-deleted note is not found", () => {
            const app = makeApp();
            const note = addNote(TEST_EMAIL, app.id, {
                stage: "interview",
                content: "To delete",
            });
            deleteNote(TEST_EMAIL, app.id, note.id);

            assert.throws(
                () => deleteNote(TEST_EMAIL, app.id, note.id),
                (err) =>
                    err instanceof ServiceError &&
                    err.status === 404 &&
                    err.message.includes("Note not found"),
            );
        });

        test("editing a deleted note is not found", () => {
            const app = makeApp();
            const note = addNote(TEST_EMAIL, app.id, {
                stage: "interview",
                content: "To delete",
            });
            deleteNote(TEST_EMAIL, app.id, note.id);

            assert.throws(
                () => updateNote(TEST_EMAIL, app.id, note.id, { content: "x" }),
                (err) =>
                    err instanceof ServiceError &&
                    err.status === 404 &&
                    err.message.includes("Note not found"),
            );
        });

        // AE6: the failure must not reveal that someone else's note exists, so
        // it is a 404 rather than a 403.
        test("deleting another user's note is not found, not forbidden", () => {
            const app = makeApp();
            const note = addNote(TEST_EMAIL, app.id, {
                stage: "interview",
                content: "Private",
            });

            assert.throws(
                () => deleteNote(OTHER_EMAIL, app.id, note.id),
                (err) => err instanceof ServiceError && err.status === 404,
            );

            const row = db
                .prepare("SELECT hidden_at FROM stage_notes WHERE id = ?")
                .get(note.id);
            assert.equal(row.hidden_at, null);
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
