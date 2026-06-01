"use strict";

const crypto = require("crypto");
const db = require("../db");

const TOKEN_TTL_MS = 15 * 60 * 1000;

function createUploadToken(userEmail, applicationId, originalFilename) {
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
    db.prepare(
        "INSERT INTO upload_tokens (token, user_email, application_id, original_filename, expires_at) VALUES (?, ?, ?, ?, ?)",
    ).run(token, userEmail, applicationId, originalFilename, expiresAt);
    return token;
}

function validateAndConsumeToken(token) {
    const row = db
        .prepare(
            "SELECT * FROM upload_tokens WHERE token = ? AND used = 0 AND expires_at > datetime('now')",
        )
        .get(token);
    if (!row) return null;
    db.prepare("UPDATE upload_tokens SET used = 1 WHERE id = ?").run(row.id);
    return row;
}

module.exports = { createUploadToken, validateAndConsumeToken };
