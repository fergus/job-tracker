"use strict";

// Must be set before any require so db.js uses an in-memory database
process.env.DB_PATH = ":memory:";
process.env.RATE_LIMIT_API = "100000";
process.env.RATE_LIMIT_UPLOADS = "100000";

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// Initialise DB schema and module graph (loads apiKeySecret via auth -> app)
const app = require("../app");
const db = require("../db");
const { ALLOWED_EXTENSIONS, MIME_MAP } = require("../lib/mime");
const { isValidUrl } = require("../lib/validation");
const { uploadsDir, safePath, safeDeleteFile } = require("../lib/files");
const { apiKeySecret, resolveApiKey } = require("../lib/apiKeySecret");

// ---------------------------------------------------------------------------
// lib/mime.js
// ---------------------------------------------------------------------------

describe("lib/mime", () => {
    test("ALLOWED_EXTENSIONS contains expected types", () => {
        assert.deepEqual(ALLOWED_EXTENSIONS, [
            ".pdf",
            ".doc",
            ".docx",
            ".md",
            ".txt",
        ]);
    });

    test("MIME_MAP covers all allowed extensions", () => {
        for (const ext of ALLOWED_EXTENSIONS) {
            assert.ok(
                MIME_MAP[ext],
                `MIME_MAP missing entry for extension ${ext}`,
            );
        }
    });

    test("MIME_MAP has correct values", () => {
        assert.equal(MIME_MAP[".pdf"], "application/pdf");
        assert.equal(MIME_MAP[".doc"], "application/msword");
        assert.equal(
            MIME_MAP[".docx"],
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        );
        assert.equal(MIME_MAP[".md"], "text/plain");
        assert.equal(MIME_MAP[".txt"], "text/plain");
    });
});

// ---------------------------------------------------------------------------
// lib/validation.js
// ---------------------------------------------------------------------------

describe("lib/validation", () => {
    test("isValidUrl returns true for null/undefined/empty", () => {
        assert.equal(isValidUrl(null), true);
        assert.equal(isValidUrl(undefined), true);
        assert.equal(isValidUrl(""), true);
    });

    test("isValidUrl returns true for valid http/https URLs", () => {
        assert.equal(isValidUrl("http://example.com"), true);
        assert.equal(isValidUrl("https://example.com/path?query=1"), true);
        assert.equal(isValidUrl("https://localhost:3000"), true);
    });

    test("isValidUrl returns false for invalid protocols", () => {
        assert.equal(isValidUrl("ftp://example.com"), false);
        assert.equal(isValidUrl("file:///etc/passwd"), false);
        assert.equal(isValidUrl("javascript:alert(1)"), false);
    });

    test("isValidUrl returns false for malformed URLs", () => {
        assert.equal(isValidUrl("not a url"), false);
        assert.equal(isValidUrl("http://"), false);
        assert.equal(isValidUrl("example.com"), false);
    });
});

// ---------------------------------------------------------------------------
// lib/files.js
// ---------------------------------------------------------------------------

describe("lib/files", () => {
    test("uploadsDir is an absolute path ending in uploads", () => {
        assert.ok(path.isAbsolute(uploadsDir));
        assert.ok(uploadsDir.endsWith("uploads"));
    });

    test("safePath resolves a valid filename within base", () => {
        const base = "/tmp/test-uploads";
        const result = safePath(base, "file.txt");
        assert.equal(result, path.resolve(base, "file.txt"));
    });

    test("safePath rejects directory traversal", () => {
        const base = "/tmp/test-uploads";
        assert.equal(safePath(base, "../etc/passwd"), null);
        assert.equal(safePath(base, "foo/../../etc/passwd"), null);
        assert.equal(safePath(base, "/etc/passwd"), null);
    });

    test("safePath allows nested directories within base", () => {
        const base = "/tmp/test-uploads";
        const result = safePath(base, "subdir/nested/file.txt");
        assert.equal(result, path.resolve(base, "subdir/nested/file.txt"));
    });

    test("safeDeleteFile removes an existing file", async () => {
        const tmpFile = path.join(uploadsDir, `test-delete-${Date.now()}.txt`);
        fs.writeFileSync(tmpFile, "hello");
        assert.ok(fs.existsSync(tmpFile));

        await safeDeleteFile(tmpFile);

        assert.ok(!fs.existsSync(tmpFile));
    });

    test("safeDeleteFile does not throw for missing file", async () => {
        const missing = path.join(uploadsDir, `missing-${Date.now()}.txt`);
        await assert.doesNotReject(async () => {
            await safeDeleteFile(missing);
        });
    });
});

// ---------------------------------------------------------------------------
// lib/apiKeySecret.js
// ---------------------------------------------------------------------------

describe("lib/apiKeySecret", () => {
    test("apiKeySecret is a non-empty string", () => {
        assert.equal(typeof apiKeySecret, "string");
        assert.ok(apiKeySecret.length > 0);
    });

    test("resolveApiKey returns null for a non-existent token", () => {
        const result = resolveApiKey("totally-bogus-token-12345");
        assert.equal(result, null);
    });

    test("resolveApiKey returns user_email for a valid token", () => {
        const email = "test-lib-user@example.com";
        const rawToken = "my-test-token-" + Date.now();
        const keyHash = crypto
            .createHmac("sha256", apiKeySecret)
            .update(rawToken)
            .digest("hex");

        // Ensure user exists because api_keys has a FK constraint
        db.prepare(
            `INSERT OR IGNORE INTO users (email, first_seen_at, last_seen_at) VALUES (?, ?, ?)`,
        ).run(email, new Date().toISOString(), new Date().toISOString());

        db.insertApiKey.run(email, "lib-test", keyHash);

        const resolved = resolveApiKey(rawToken);
        assert.equal(resolved, email);
    });
});
