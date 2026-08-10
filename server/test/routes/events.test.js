"use strict";

// Must be set before any require so db.js uses an in-memory database
process.env.DB_PATH = ":memory:";
// Disable rate limiting in tests
process.env.RATE_LIMIT_API = "100000";
process.env.RATE_LIMIT_UPLOADS = "100000";
process.env.ADMIN_EMAILS = "admin@example.com";
// Keep the keepalive fast enough to assert on without a real 30s wait
process.env.SSE_HEARTBEAT_MS = "60";

const { test, before, after, describe } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const app = require("../../app");
const { bus, emitChange } = require("../../lib/events");

// ---------------------------------------------------------------------------
// Streaming harness
//
// An SSE response never ends, so supertest's promise API (which resolves on
// response end) would hang forever. Instead we boot the app on an ephemeral
// port and drive a raw http.request, reading chunks as they arrive and
// aborting when the assertions are done.
// ---------------------------------------------------------------------------

let server;
let port;

before(async () => {
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = server.address().port;
});

after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
});

// Opens an SSE connection and buffers everything the server writes.
// Returns a handle with `text()`, `waitFor(predicate)` and `close()`.
function openStream({ email, path = "/api/events" } = {}) {
    let buffer = "";
    const waiters = [];
    let closed = false;

    const request = http.request({
        host: "127.0.0.1",
        port,
        path,
        method: "GET",
        headers: {
            Accept: "text/event-stream",
            "X-Forwarded-Email": email,
            "X-Forwarded-User": email,
        },
    });

    const headers = new Promise((resolve, reject) => {
        request.on("response", (res) => {
            res.setEncoding("utf8");
            res.on("data", (chunk) => {
                buffer += chunk;
                for (const waiter of waiters.splice(0)) {
                    if (waiter.predicate(buffer)) waiter.resolve(buffer);
                    else waiters.push(waiter);
                }
            });
            res.on("error", () => {});
            resolve(res);
        });
        request.on("error", (err) => {
            if (!closed) reject(err);
        });
    });

    request.end();

    return {
        headers: () => headers,
        text: () => buffer,
        async waitFor(predicate, timeoutMs = 2000) {
            if (predicate(buffer)) return buffer;
            return new Promise((resolve, reject) => {
                const timer = setTimeout(() => {
                    reject(
                        new Error(
                            `timed out waiting for stream content; got: ${JSON.stringify(buffer)}`,
                        ),
                    );
                }, timeoutMs);
                waiters.push({
                    predicate,
                    resolve: (value) => {
                        clearTimeout(timer);
                        resolve(value);
                    },
                });
            });
        },
        close() {
            closed = true;
            request.destroy();
        },
    };
}

// Waits until the server has actually attached its bus listener, so events
// emitted straight afterwards are not missed.
async function waitForListeners(count, timeoutMs = 2000) {
    const deadline = Date.now() + timeoutMs;
    while (bus.listenerCount("change") !== count) {
        if (Date.now() > deadline) {
            throw new Error(
                `timed out waiting for ${count} bus listener(s); have ${bus.listenerCount("change")}`,
            );
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
}

function parseEvents(text) {
    return text
        .split("\n\n")
        .filter((block) => block.trim() !== "")
        .map((block) => {
            const event = {};
            for (const line of block.split("\n")) {
                if (line.startsWith("event:")) {
                    event.name = line.slice(6).trim();
                } else if (line.startsWith("data:")) {
                    event.data = line.slice(5).trim();
                } else if (line.startsWith(":")) {
                    event.comment = line.slice(1).trim();
                }
            }
            return event;
        });
}

describe("GET /api/events", () => {
    test("sets SSE response headers", async () => {
        const stream = openStream({ email: "alice@example.com" });
        try {
            const res = await stream.headers();
            assert.equal(res.statusCode, 200);
            assert.match(res.headers["content-type"], /text\/event-stream/);
            assert.equal(res.headers["x-accel-buffering"], "no");
        } finally {
            stream.close();
        }
    });

    test("delivers change events for the subscriber's own user", async () => {
        const stream = openStream({ email: "alice@example.com" });
        try {
            await stream.headers();
            await waitForListeners(1);

            emitChange("alice@example.com", "update", 42);

            const text = await stream.waitFor((buf) =>
                buf.includes("event: change"),
            );
            const change = parseEvents(text).find((e) => e.name === "change");
            const payload = JSON.parse(change.data);
            assert.equal(payload.userEmail, "alice@example.com");
            assert.equal(payload.type, "update");
            assert.equal(payload.id, 42);
        } finally {
            stream.close();
        }
    });

    test("admin with ?all=true receives another user's change event", async () => {
        const stream = openStream({
            email: "admin@example.com",
            path: "/api/events?all=true",
        });
        try {
            await stream.headers();
            await waitForListeners(1);

            emitChange("bob@example.com", "create", 7);

            const text = await stream.waitFor((buf) =>
                buf.includes("event: change"),
            );
            const change = parseEvents(text).find((e) => e.name === "change");
            const payload = JSON.parse(change.data);
            assert.equal(payload.userEmail, "bob@example.com");
            assert.equal(payload.id, 7);
        } finally {
            stream.close();
        }
    });

    test("non-admin does not receive another user's change event", async () => {
        const stream = openStream({ email: "alice@example.com" });
        try {
            await stream.headers();
            await waitForListeners(1);

            emitChange("bob@example.com", "update", 99);

            // Give the server a chance to (wrongly) write it out.
            await new Promise((resolve) => setTimeout(resolve, 150));
            assert.equal(stream.text().includes("event: change"), false);
        } finally {
            stream.close();
        }
    });

    test("a non-admin passing ?all=true is still scoped to its own user", async () => {
        const stream = openStream({
            email: "alice@example.com",
            path: "/api/events?all=true",
        });
        try {
            await stream.headers();
            await waitForListeners(1);

            emitChange("bob@example.com", "update", 101);

            await new Promise((resolve) => setTimeout(resolve, 150));
            assert.equal(stream.text().includes("event: change"), false);
        } finally {
            stream.close();
        }
    });

    test("keepalive arrives as a named ping event with a parseable timestamp", async () => {
        const stream = openStream({ email: "alice@example.com" });
        try {
            await stream.headers();

            const text = await stream.waitFor((buf) =>
                buf.includes("event: ping"),
            );

            // The old comment-based heartbeat must be gone.
            assert.equal(
                text.includes(":heartbeat"),
                false,
                "keepalive must not be a comment line",
            );

            const ping = parseEvents(text).find((e) => e.name === "ping");
            assert.ok(ping, "expected a named ping event");
            assert.ok(ping.data, "ping event must carry a data payload");

            const payload = JSON.parse(ping.data);
            const at = payload.at ?? payload;
            const parsed = new Date(at);
            assert.ok(
                Number.isFinite(parsed.getTime()),
                `ping timestamp not parseable: ${ping.data}`,
            );
            // Sanity: the server generated it just now.
            assert.ok(Math.abs(Date.now() - parsed.getTime()) < 60000);
        } finally {
            stream.close();
        }
    });

    test("closing the request clears the interval and removes the bus listener", async () => {
        // Earlier tests tear down asynchronously; settle first so the counts
        // below are unambiguous.
        await waitForListeners(0);

        const stream = openStream({ email: "alice@example.com" });
        await stream.headers();
        await waitForListeners(1);

        stream.close();
        await waitForListeners(0);

        // No keepalive timer should keep firing: if the interval leaked, the
        // process would be held open by an active handle.
        const timers = process
            .getActiveResourcesInfo()
            .filter((r) => r === "Timeout");
        assert.equal(
            timers.length,
            0,
            `keepalive interval leaked: ${timers.length} active timer(s)`,
        );
    });
});
