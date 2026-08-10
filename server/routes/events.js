const express = require("express");
const { bus } = require("../lib/events");

const router = express.Router();

// Keepalive cadence. Overridable via env so tests do not have to wait a real
// 30 seconds to observe a ping; production keeps the 30s default.
const HEARTBEAT_MS = Number(process.env.SSE_HEARTBEAT_MS) || 30000;

// Server-Sent Events stream of application changes, scoped to the requesting
// user (or all users, for an admin explicitly viewing everyone's board).
router.get("/", (req, res) => {
    const wantsAll = req.isAdmin && req.query.all === "true";

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    // Prevent reverse proxies (e.g. nginx in front of oauth2-proxy) from
    // buffering the stream, which would delay delivery indefinitely.
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const listener = (evt) => {
        if (!wantsAll && evt.userEmail !== req.userEmail) return;
        res.write(`event: change\ndata: ${JSON.stringify(evt)}\n\n`);
    };
    bus.on("change", listener);

    // Named event rather than a comment line: a comment keeps the socket warm
    // but is invisible to EventSource, so the client cannot tell an open-but-
    // dead connection from a quiet one. The timestamp is server-generated.
    const heartbeat = setInterval(() => {
        res.write(
            `event: ping\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`,
        );
    }, HEARTBEAT_MS);

    req.on("close", () => {
        clearInterval(heartbeat);
        bus.off("change", listener);
    });
});

module.exports = router;
