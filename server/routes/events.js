const express = require("express");
const { bus } = require("../lib/events");

const router = express.Router();

const HEARTBEAT_MS = 30000;

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

    const heartbeat = setInterval(() => {
        res.write(":heartbeat\n\n");
    }, HEARTBEAT_MS);

    req.on("close", () => {
        clearInterval(heartbeat);
        bus.off("change", listener);
    });
});

module.exports = router;
