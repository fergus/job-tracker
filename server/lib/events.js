"use strict";
const { EventEmitter } = require("events");

// Process-local pub/sub for application changes. Fed by both the REST routes
// and the MCP tool handlers (they share the same service functions), and
// consumed by the SSE endpoint so any open browser tab picks up changes made
// through either pipe.
const bus = new EventEmitter();
bus.setMaxListeners(0);

function emitChange(userEmail, type, applicationId) {
    bus.emit("change", {
        userEmail,
        type,
        id: applicationId,
        at: new Date().toISOString(),
    });
}

module.exports = { bus, emitChange };
