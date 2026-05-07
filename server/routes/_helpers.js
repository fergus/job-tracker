const db = require("../db");
const { getOwnApp } = require("../services/applications");
const { ServiceError } = require("../services/applications");

/**
 * Resolve an application row, handling both owner and admin access.
 * Returns the row or null if not found / not authorized.
 */
function resolveApp(
    req,
    id,
    { allowAdmin = false, auditAction = null } = {},
) {
    const existing =
        req.isAdmin && allowAdmin
            ? db.prepare("SELECT * FROM applications WHERE id = ?").get(id)
            : getOwnApp(id, req.userEmail);
    if (!existing) return null;
    if (
        req.isAdmin &&
        allowAdmin &&
        existing.user_email !== req.userEmail &&
        auditAction
    ) {
        console.info(
            "[admin] %s %s for app %s owned by %s",
            req.userEmail,
            auditAction,
            id,
            existing.user_email,
        );
    }
    return existing;
}

/**
 * Resolve an application row for the owner only (no admin bypass).
 * Returns the row or null if not found.
 */
function resolveOwnApp(req, id) {
    return resolveApp(req, id, { allowAdmin: false });
}

/**
 * Convert a ServiceError into an HTTP response; re-throw unexpected errors.
 */
function handleError(res, err) {
    if (err instanceof ServiceError)
        return res.status(err.status).json({ error: err.message });
    throw err;
}

module.exports = { resolveApp, resolveOwnApp, handleError };
