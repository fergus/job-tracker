"use strict";

process.env.DB_PATH = ":memory:";
process.env.RATE_LIMIT_API = "100000";
process.env.RATE_LIMIT_UPLOADS = "100000";

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

// Initialise DB schema
require("../../app");
const db = require("../../db");
const {
    ServiceError,
    createApplication,
    updateApplication,
    updateStatus,
    deleteApplication,
    getApplication,
    listApplications,
    getOwnApp,
    attachNotes,
} = require("../../services/applications");

const TEST_EMAIL = "svc-test@example.com";

// Clean up applications from earlier test files that share the in-memory DB
function cleanupApps() {
    db.prepare("DELETE FROM applications").run();
}

// Run cleanup before each test that needs a clean slate
const originalTest = test;
function cleanTest(name, fn) {
    return originalTest(name, async (t) => {
        cleanupApps();
        return fn(t);
    });
}

describe("services/applications", () => {
    describe("ServiceError", () => {
        test("stores status and message", () => {
            const err = new ServiceError(404, "Not found");
            assert.equal(err.status, 404);
            assert.equal(err.message, "Not found");
            assert.ok(err instanceof Error);
        });
    });

    describe("createApplication", () => {
        test("requires company_name and role_title", () => {
            assert.throws(
                () => createApplication(TEST_EMAIL, {}),
                (err) =>
                    err instanceof ServiceError &&
                    err.status === 400 &&
                    err.message.includes("company_name"),
            );
        });

        test("creates application with defaults", () => {
            const app = createApplication(TEST_EMAIL, {
                company_name: "Acme",
                role_title: "Engineer",
            });
            assert.equal(app.company_name, "Acme");
            assert.equal(app.role_title, "Engineer");
            assert.equal(app.status, "interested");
            assert.ok(app.created_at);
            assert.ok(app.interested_at);
        });

        test("rejects invalid URL", () => {
            assert.throws(
                () =>
                    createApplication(TEST_EMAIL, {
                        company_name: "Acme",
                        role_title: "Engineer",
                        job_posting_url: "not-a-url",
                    }),
                (err) =>
                    err instanceof ServiceError &&
                    err.status === 400 &&
                    err.message.includes("job_posting_url"),
            );
        });

        test("rejects negative salary", () => {
            assert.throws(
                () =>
                    createApplication(TEST_EMAIL, {
                        company_name: "Acme",
                        role_title: "Engineer",
                        salary_min: -1,
                    }),
                (err) =>
                    err instanceof ServiceError &&
                    err.status === 400 &&
                    err.message.includes("salary_min"),
            );
        });

        test("rejects salary_min > salary_max", () => {
            assert.throws(
                () =>
                    createApplication(TEST_EMAIL, {
                        company_name: "Acme",
                        role_title: "Engineer",
                        salary_min: 200,
                        salary_max: 100,
                    }),
                (err) =>
                    err instanceof ServiceError &&
                    err.status === 400 &&
                    err.message.includes("salary_min must not exceed"),
            );
        });

        test("sets applied_at when status is applied", () => {
            const app = createApplication(TEST_EMAIL, {
                company_name: "Acme",
                role_title: "Engineer",
                status: "applied",
            });
            assert.equal(app.status, "applied");
            assert.ok(app.applied_at);
        });

        test("treats empty salary string as null", () => {
            const app = createApplication(TEST_EMAIL, {
                company_name: "Acme",
                role_title: "Engineer",
                salary_min: "",
                salary_max: "",
            });
            assert.equal(app.salary_min, null);
            assert.equal(app.salary_max, null);
        });
    });

    describe("updateApplication", () => {
        test("updates specified fields", () => {
            const app = createApplication(TEST_EMAIL, {
                company_name: "Acme",
                role_title: "Engineer",
            });
            const updated = updateApplication(TEST_EMAIL, app.id, {
                company_name: "Acme Inc",
                job_location: "Remote",
            });
            assert.equal(updated.company_name, "Acme Inc");
            assert.equal(updated.job_location, "Remote");
            assert.equal(updated.role_title, "Engineer");
        });

        test("returns 404 for unknown app", () => {
            assert.throws(
                () =>
                    updateApplication(TEST_EMAIL, 999999, {
                        company_name: "X",
                    }),
                (err) => err instanceof ServiceError && err.status === 404,
            );
        });

        test("returns 400 when no fields provided", () => {
            const app = createApplication(TEST_EMAIL, {
                company_name: "Acme",
                role_title: "Engineer",
            });
            assert.throws(
                () => updateApplication(TEST_EMAIL, app.id, {}),
                (err) => err instanceof ServiceError && err.status === 400,
            );
        });

        test("rejects invalid URL in update", () => {
            const app = createApplication(TEST_EMAIL, {
                company_name: "Acme",
                role_title: "Engineer",
            });
            assert.throws(
                () =>
                    updateApplication(TEST_EMAIL, app.id, {
                        job_posting_url: "ftp://bad",
                    }),
                (err) =>
                    err instanceof ServiceError &&
                    err.status === 400 &&
                    err.message.includes("job_posting_url"),
            );
        });

        test("rejects salary_min > salary_max in update", () => {
            const app = createApplication(TEST_EMAIL, {
                company_name: "Acme",
                role_title: "Engineer",
                salary_min: 50,
                salary_max: 150,
            });
            assert.throws(
                () =>
                    updateApplication(TEST_EMAIL, app.id, {
                        salary_min: 200,
                    }),
                (err) =>
                    err instanceof ServiceError &&
                    err.status === 400 &&
                    err.message.includes("salary_min must not exceed"),
            );
        });
    });

    describe("updateStatus", () => {
        test("updates status and sets date field", () => {
            const app = createApplication(TEST_EMAIL, {
                company_name: "Acme",
                role_title: "Engineer",
                status: "interested",
            });
            const updated = updateStatus(TEST_EMAIL, app.id, "interview");
            assert.equal(updated.status, "interview");
            assert.ok(updated.interview_at);
        });

        test("rejects invalid status", () => {
            const app = createApplication(TEST_EMAIL, {
                company_name: "Acme",
                role_title: "Engineer",
            });
            assert.throws(
                () => updateStatus(TEST_EMAIL, app.id, "bogus"),
                (err) => err instanceof ServiceError && err.status === 400,
            );
        });

        test("returns 404 for unknown app", () => {
            assert.throws(
                () => updateStatus(TEST_EMAIL, 999999, "applied"),
                (err) => err instanceof ServiceError && err.status === 404,
            );
        });

        test("sets closed_at for rejected", () => {
            const app = createApplication(TEST_EMAIL, {
                company_name: "Acme",
                role_title: "Engineer",
            });
            const updated = updateStatus(TEST_EMAIL, app.id, "rejected");
            assert.equal(updated.status, "rejected");
            assert.ok(updated.closed_at);
        });

        test("sets closed_at for accepted", () => {
            const app = createApplication(TEST_EMAIL, {
                company_name: "Acme",
                role_title: "Engineer",
            });
            const updated = updateStatus(TEST_EMAIL, app.id, "accepted");
            assert.equal(updated.status, "accepted");
            assert.ok(updated.closed_at);
        });
    });

    describe("deleteApplication", () => {
        test("deletes existing application", () => {
            const app = createApplication(TEST_EMAIL, {
                company_name: "Acme",
                role_title: "Engineer",
            });
            const result = deleteApplication(TEST_EMAIL, app.id);
            assert.deepEqual(result, { success: true });
            assert.equal(getOwnApp(app.id, TEST_EMAIL), undefined);
        });

        test("returns 404 for unknown app", () => {
            assert.throws(
                () => deleteApplication(TEST_EMAIL, 999999),
                (err) => err instanceof ServiceError && err.status === 404,
            );
        });
    });

    describe("getApplication", () => {
        test("returns application with notes array", () => {
            const app = createApplication(TEST_EMAIL, {
                company_name: "Acme",
                role_title: "Engineer",
            });
            db.prepare(
                "INSERT INTO stage_notes (application_id, stage, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
            ).run(
                app.id,
                "interview",
                "Note",
                new Date().toISOString(),
                new Date().toISOString(),
            );

            const result = getApplication(TEST_EMAIL, app.id);
            assert.equal(result.id, app.id);
            assert.ok(Array.isArray(result.notes));
            assert.equal(result.notes.length, 1);
        });

        test("returns 404 for unknown app", () => {
            assert.throws(
                () => getApplication(TEST_EMAIL, 999999),
                (err) => err instanceof ServiceError && err.status === 404,
            );
        });

        test("admin can get any app", () => {
            const app = createApplication("other@example.com", {
                company_name: "Acme",
                role_title: "Engineer",
            });
            const result = getApplication(TEST_EMAIL, app.id, {
                isAdmin: true,
            });
            assert.equal(result.id, app.id);
        });
    });

    describe("listApplications", () => {
        test("lists apps scoped to user", () => {
            cleanupApps();
            createApplication(TEST_EMAIL, {
                company_name: "A",
                role_title: "E1",
            });
            createApplication("other@example.com", {
                company_name: "B",
                role_title: "E2",
            });
            const list = listApplications(TEST_EMAIL, {});
            assert.equal(list.length, 1);
            assert.equal(list[0].company_name, "A");
        });

        test("filters by status", () => {
            cleanupApps();
            createApplication(TEST_EMAIL, {
                company_name: "A",
                role_title: "E1",
                status: "interested",
            });
            createApplication(TEST_EMAIL, {
                company_name: "B",
                role_title: "E2",
                status: "applied",
            });
            const list = listApplications(TEST_EMAIL, { status: "applied" });
            assert.equal(list.length, 1);
            assert.equal(list[0].company_name, "B");
        });

        test("admin can list all apps", () => {
            cleanupApps();
            createApplication(TEST_EMAIL, {
                company_name: "A",
                role_title: "E1",
            });
            createApplication("other@example.com", {
                company_name: "B",
                role_title: "E2",
            });
            const list = listApplications(TEST_EMAIL, {
                all: "true",
                isAdmin: true,
            });
            assert.equal(list.length, 2);
        });

        test("returns empty array when no apps", () => {
            const list = listApplications("nobody@example.com", {});
            assert.deepEqual(list, []);
        });
    });

    describe("getOwnApp", () => {
        test("returns row when owned", () => {
            const app = createApplication(TEST_EMAIL, {
                company_name: "Acme",
                role_title: "Engineer",
            });
            const row = getOwnApp(app.id, TEST_EMAIL);
            assert.ok(row);
            assert.equal(row.id, app.id);
        });

        test("returns undefined when not owned", () => {
            const app = createApplication(TEST_EMAIL, {
                company_name: "Acme",
                role_title: "Engineer",
            });
            const row = getOwnApp(app.id, "other@example.com");
            assert.equal(row, undefined);
        });
    });

    describe("attachNotes", () => {
        test("attaches notes to applications", () => {
            const app1 = createApplication(TEST_EMAIL, {
                company_name: "A1",
                role_title: "E",
            });
            const app2 = createApplication(TEST_EMAIL, {
                company_name: "A2",
                role_title: "E",
            });
            db.prepare(
                "INSERT INTO stage_notes (application_id, stage, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
            ).run(
                app1.id,
                "interview",
                "N1",
                new Date().toISOString(),
                new Date().toISOString(),
            );

            const rows = db
                .prepare("SELECT * FROM applications WHERE user_email = ?")
                .all(TEST_EMAIL);
            const withNotes = attachNotes(rows);
            const r1 = withNotes.find((r) => r.id === app1.id);
            const r2 = withNotes.find((r) => r.id === app2.id);
            assert.equal(r1.notes.length, 1);
            assert.equal(r2.notes.length, 0);
        });

        test("returns empty array unchanged", () => {
            const result = attachNotes([]);
            assert.deepEqual(result, []);
        });
    });
});
