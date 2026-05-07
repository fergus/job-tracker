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
    resolveApp,
    resolveOwnApp,
    handleError,
} = require("../../routes/_helpers");
const { ServiceError } = require("../../services/applications");

function makeReq({ email = "owner@example.com", isAdmin = false } = {}) {
    return { userEmail: email, isAdmin };
}

function insertApp(email) {
    const result = db
        .prepare(
            `INSERT INTO applications (company_name, role_title, status, created_at, updated_at, user_email)
       VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
            "Acme",
            "Engineer",
            "interested",
            new Date().toISOString(),
            new Date().toISOString(),
            email,
        );
    return result.lastInsertRowid;
}

describe("routes/_helpers", () => {
    describe("resolveApp", () => {
        test("returns app row when user owns it", () => {
            const appId = insertApp("owner@example.com");
            const req = makeReq({ email: "owner@example.com" });
            const result = resolveApp(req, appId);
            assert.ok(result);
            assert.equal(result.id, appId);
        });

        test("returns null when app does not exist", () => {
            const req = makeReq({ email: "owner@example.com" });
            const result = resolveApp(req, 999999);
            assert.equal(result, null);
        });

        test("returns null when user does not own app and not admin", () => {
            const appId = insertApp("someone@example.com");
            const req = makeReq({ email: "other@example.com" });
            const result = resolveApp(req, appId);
            assert.equal(result, null);
        });

        test("with allowAdmin=true, admin can access any app", () => {
            const appId = insertApp("someone@example.com");
            const req = makeReq({ email: "admin@example.com", isAdmin: true });
            const result = resolveApp(req, appId, { allowAdmin: true });
            assert.ok(result);
            assert.equal(result.id, appId);
        });

        test("with allowAdmin=false, admin cannot access another user's app", () => {
            const appId = insertApp("someone@example.com");
            const req = makeReq({ email: "admin@example.com", isAdmin: true });
            const result = resolveApp(req, appId, { allowAdmin: false });
            assert.equal(result, null);
        });

        test("logs audit message when admin accesses another user's app", () => {
            const appId = insertApp("someone@example.com");
            const req = makeReq({ email: "admin@example.com", isAdmin: true });
            let logged = false;
            const originalInfo = console.info;
            console.info = (...args) => {
                if (args[0].includes("[admin]")) logged = true;
            };
            resolveApp(req, appId, {
                allowAdmin: true,
                auditAction: "did something",
            });
            console.info = originalInfo;
            assert.equal(logged, true);
        });

        test("does not log audit when admin accesses own app", () => {
            const appId = insertApp("admin@example.com");
            const req = makeReq({ email: "admin@example.com", isAdmin: true });
            let logged = false;
            const originalInfo = console.info;
            console.info = (...args) => {
                if (args[0].includes("[admin]")) logged = true;
            };
            resolveApp(req, appId, {
                allowAdmin: true,
                auditAction: "did something",
            });
            console.info = originalInfo;
            assert.equal(logged, false);
        });
    });

    describe("resolveOwnApp", () => {
        test("is a shorthand for resolveApp with allowAdmin=false", () => {
            const appId = insertApp("owner@example.com");
            const req = makeReq({ email: "owner@example.com" });
            const result = resolveOwnApp(req, appId);
            assert.ok(result);
            assert.equal(result.id, appId);
        });
    });

    describe("handleError", () => {
        test("sets status and json for ServiceError", () => {
            let statusCode = null;
            let jsonBody = null;
            const res = {
                status: (code) => {
                    statusCode = code;
                    return res;
                },
                json: (body) => {
                    jsonBody = body;
                },
            };
            const err = new ServiceError(422, "bad input");
            handleError(res, err);
            assert.equal(statusCode, 422);
            assert.deepEqual(jsonBody, { error: "bad input" });
        });

        test("re-throws non-ServiceError", () => {
            const res = { status: () => res, json: () => {} };
            assert.throws(() => {
                handleError(res, new Error("boom"));
            }, /boom/);
        });
    });
});
