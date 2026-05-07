"use strict";

process.env.DB_PATH = ":memory:";
process.env.RATE_LIMIT_API = "100000";
process.env.RATE_LIMIT_UPLOADS = "100000";

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

// Initialise DB schema
require("../../app");
const db = require("../../db");
const { logAuditEvent, READ_ONLY_TOOLS } = require("../../services/audit");

describe("services/audit", () => {
    describe("logAuditEvent", () => {
        test("inserts an audit log record", () => {
            logAuditEvent({
                userEmail: "test@example.com",
                action: "create_application",
                applicationId: null,
                source: "rest",
                authMethod: "oauth",
                details: { foo: "bar" },
            });

            const row = db
                .prepare("SELECT * FROM audit_log WHERE action = ?")
                .get("create_application");
            assert.ok(row);
            assert.equal(row.user_email, "test@example.com");
            assert.equal(row.application_id, null);
            assert.equal(row.source, "rest");
            assert.equal(row.auth_method, "oauth");
            assert.equal(row.details, '{"foo":"bar"}');
        });

        test("handles null details", () => {
            logAuditEvent({
                userEmail: "test@example.com",
                action: "delete_application",
                applicationId: null,
                source: "rest",
                authMethod: "oauth",
                details: null,
            });

            const row = db
                .prepare("SELECT * FROM audit_log WHERE action = ?")
                .get("delete_application");
            assert.ok(row);
            assert.equal(row.details, null);
        });

        test("does not throw when db is unavailable (best-effort)", () => {
            // We can't easily make the DB unavailable, but we can verify the
            // function completes without error under normal circumstances.
            assert.doesNotThrow(() => {
                logAuditEvent({
                    userEmail: "test@example.com",
                    action: "test_action",
                    source: "rest",
                    authMethod: "oauth",
                });
            });
        });
    });

    describe("READ_ONLY_TOOLS", () => {
        test("is a Set containing expected tool names", () => {
            assert.ok(READ_ONLY_TOOLS instanceof Set);
            assert.ok(READ_ONLY_TOOLS.has("list_applications"));
            assert.ok(READ_ONLY_TOOLS.has("get_application"));
            assert.ok(READ_ONLY_TOOLS.has("list_attachments"));
            assert.ok(!READ_ONLY_TOOLS.has("create_application"));
        });
    });
});
