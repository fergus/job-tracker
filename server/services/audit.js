"use strict";

const db = require("../db");

const READ_ONLY_TOOLS = new Set([
    "list_applications",
    "get_application",
    "list_attachments",
    "get_attachment_text",
    "get_user_profile",
    "get_application_context",
]);

function logAuditEvent({
    userEmail,
    action,
    applicationId = null,
    source,
    authMethod,
    details = null,
}) {
    try {
        const detailsJson = details ? JSON.stringify(details) : null;
        db.insertAuditLog.run(
            applicationId,
            userEmail,
            action,
            source,
            authMethod,
            detailsJson,
        );
    } catch (err) {
        console.error("[audit] Failed to log audit event:", err.message);
    }
}

module.exports = {
    logAuditEvent,
    READ_ONLY_TOOLS,
};
