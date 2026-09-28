"use strict";

// Per-user preferences that change how the server treats that user's writes.
// Stored on the users row, which the auth middleware upserts on every request,
// so every authenticated user already has one. A null column means the user
// never chose, and reads back as the default.

const db = require("../db");

class ServiceError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

const DEFAULTS = { clear_next_step_on_close: true };

function getSettings(userEmail) {
    const row = db
        .prepare("SELECT clear_next_step_on_close FROM users WHERE email = ?")
        .get(userEmail);
    const stored = row?.clear_next_step_on_close;
    return {
        clear_next_step_on_close:
            stored === null || stored === undefined
                ? DEFAULTS.clear_next_step_on_close
                : stored === 1,
    };
}

function updateSettings(userEmail, data = {}) {
    if (data.clear_next_step_on_close === undefined) {
        throw new ServiceError(400, "No settings to update");
    }
    if (typeof data.clear_next_step_on_close !== "boolean") {
        throw new ServiceError(400, "clear_next_step_on_close must be true or false");
    }
    db.prepare("UPDATE users SET clear_next_step_on_close = ? WHERE email = ?").run(
        data.clear_next_step_on_close ? 1 : 0,
        userEmail,
    );
    return getSettings(userEmail);
}

// Whether closing one of this user's records ends its next step.
function clearsNextStepOnClose(userEmail) {
    return getSettings(userEmail).clear_next_step_on_close;
}

module.exports = { ServiceError, getSettings, updateSettings, clearsNextStepOnClose };
