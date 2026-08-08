import { test } from "node:test";
import assert from "node:assert";
import { useLiveUpdates } from "./useLiveUpdates.js";
import {
    TIER_LIVE,
    TIER_DEGRADED,
    TIER_TERMINAL,
} from "../utils/freshness.js";

// Node has no global EventSource, so every test injects this fake through the
// composable's constructor seam and drives it by hand.
class FakeEventSource {
    constructor(url) {
        this.url = url;
        this.readyState = 0;
        this.closed = false;
        this.listeners = {};
        this.onopen = null;
        this.onerror = null;
    }

    addEventListener(type, fn) {
        if (!this.listeners[type]) this.listeners[type] = [];
        this.listeners[type].push(fn);
    }

    close() {
        this.closed = true;
        this.readyState = 2;
    }

    // --- drivers ---------------------------------------------------------

    open() {
        this.readyState = 1;
        if (this.onopen) this.onopen({});
    }

    fail({ permanent = false } = {}) {
        this.readyState = permanent ? 2 : 0;
        if (this.onerror) this.onerror({});
    }

    emit(type, payload) {
        const fns = this.listeners[type] || [];
        for (const fn of fns) fn({ data: JSON.stringify(payload) });
    }
}

// A harness bundling the fake stream factory, a manual clock and manual
// interval control, so nothing in these tests waits on real time.
function harness(options = {}) {
    const instances = [];
    const clock = { now: new Date(2026, 7, 8, 10, 0, 0).getTime() };
    const intervals = [];
    let nextIntervalId = 1;
    const cleared = [];

    const live = useLiveUpdates({
        eventSourceFactory: (url) => {
            const source = new FakeEventSource(url);
            instances.push(source);
            return source;
        },
        now: () => clock.now,
        setIntervalFn: (fn, ms) => {
            const id = nextIntervalId++;
            intervals.push({ id, fn, ms });
            return id;
        },
        clearIntervalFn: (id) => cleared.push(id),
        ...options,
    });

    return {
        live,
        instances,
        clock,
        intervals,
        cleared,
        advance(ms) {
            clock.now += ms;
        },
        tick() {
            for (const entry of intervals) entry.fn();
        },
        latest() {
            return instances[instances.length - 1];
        },
    };
}

test("a successful reconnection triggers the refetch callback exactly once", () => {
    const refetched = [];
    const h = harness({ onReconnect: () => refetched.push(true) });

    h.latest().open();
    assert.strictEqual(refetched.length, 0);

    h.latest().fail();
    h.advance(1000);
    h.latest().open();

    assert.strictEqual(refetched.length, 1);
    h.live.stop();
});

test("the first open confirms the connection but does not refetch", () => {
    const refetched = [];
    const h = harness({ onReconnect: () => refetched.push(true) });

    h.latest().open();

    assert.strictEqual(refetched.length, 0);
    assert.strictEqual(h.live.tier.value, TIER_LIVE);
    h.live.stop();
});

test("teardown clears the interval and closes the stream", () => {
    const h = harness();
    h.latest().open();

    assert.strictEqual(h.intervals.length, 1);
    const id = h.intervals[0].id;

    h.live.stop();

    assert.deepStrictEqual(h.cleared, [id]);
    assert.strictEqual(h.latest().closed, true);
});

test("a ping advances last confirmed sync without being an application change", () => {
    const changes = [];
    const h = harness({ onChange: (payload) => changes.push(payload) });

    h.latest().open();

    h.advance(60000);
    h.latest().emit("ping", { at: "2026-08-08T10:01:00.000Z" });
    h.tick();

    assert.strictEqual(changes.length, 0);

    // Without the ping the stream would have been silent for 120s and
    // degraded; the ping resets the silence window, so it is still live.
    h.advance(60000);
    h.tick();

    assert.strictEqual(h.live.tier.value, TIER_LIVE);
    assert.strictEqual(h.instances.length, 1);
    h.live.stop();
});

test("a change event is delivered to the consumer", () => {
    const changes = [];
    const h = harness({ onChange: (payload) => changes.push(payload) });

    h.latest().open();
    h.latest().emit("change", { id: 7 });

    assert.deepStrictEqual(changes, [{ id: 7 }]);
    h.live.stop();
});

test("reconnect() closes the existing stream and opens exactly one new one", () => {
    const h = harness();
    h.latest().open();

    const first = h.latest();
    h.live.reconnect();

    assert.strictEqual(first.closed, true);
    assert.strictEqual(h.instances.length, 2);
    assert.strictEqual(h.latest().closed, false);
    h.live.stop();
});

test("the silence condition closes and reopens the stream", () => {
    const h = harness();
    h.latest().open();
    const first = h.latest();

    // Past SILENCE_DEGRADE_MS with the socket still nominally open.
    h.advance(95000);
    h.tick();

    assert.strictEqual(h.live.tier.value, TIER_DEGRADED);
    assert.strictEqual(first.closed, true);
    assert.strictEqual(h.instances.length, 2);
    assert.strictEqual(h.latest().closed, false);
    h.live.stop();
});

test("the display refresh interval runs once a minute", () => {
    const h = harness();
    assert.strictEqual(h.intervals.length, 1);
    assert.strictEqual(h.intervals[0].ms, 60000);
    h.live.stop();
});

test("all-scope subscriptions request the all-users stream", () => {
    const h = harness({ all: true });
    assert.strictEqual(h.latest().url, "/api/events?all=true");
    h.live.stop();
});

// The terminal branch is what swaps the bar's action from "Retry now" to
// "Reload", and it is the only tier a user cannot recover from in place. The
// harness has always supported a permanent close; nothing exercised it.
test("a permanently closed stream enters the terminal tier", () => {
    const h = harness();

    h.latest().open();
    assert.strictEqual(h.live.tier.value, TIER_LIVE);

    h.latest().fail({ permanent: true });

    assert.strictEqual(h.live.tier.value, TIER_TERMINAL);
    h.live.stop();
});

test("a non-permanent failure does not enter the terminal tier", () => {
    const h = harness();

    h.latest().open();
    h.latest().fail();

    assert.notStrictEqual(h.live.tier.value, TIER_TERMINAL);
    h.live.stop();
});
