"use strict";

const express = require("express");
const multer = require("multer");
const { validateAndConsumeToken } = require("../lib/uploadTokens");
const svc = require("../services/applications");
const { logAuditEvent } = require("../services/audit");

const router = express.Router();

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
});

function validateToken(req, res, next) {
    const tokenData = validateAndConsumeToken(req.params.token);
    if (!tokenData) {
        return res.status(401).json({ error: "Invalid or expired upload token" });
    }
    req.uploadToken = tokenData;
    next();
}

router.put("/:token", validateToken, upload.single("file"), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
    }
    try {
        const { user_email, application_id, original_filename } = req.uploadToken;
        const result = await svc.uploadAttachments(user_email, application_id, [
            { originalname: original_filename, buffer: req.file.buffer },
        ]);
        logAuditEvent({
            userEmail: user_email,
            action: "upload_attachment",
            applicationId: application_id,
            source: "mcp_upload",
            authMethod: "upload_token",
            details: { filename: original_filename },
        });
        res.status(201).json(result[0]);
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message });
    }
});

module.exports = router;
