import { test } from "node:test";
import assert from "node:assert";
import {
    createRefetchQueue,
    requestRefetch,
    flushRefetch,
    hasContentChanged,
    shouldHoldJustNow,
} from "./refetchQueue.js";

// --- scenario 3: no drag in progress -------------------------------------

test("a refetch requested with no drag in progress applies immediately", () => {
    const queue = createRefetchQueue();
    const result = requestRefetch(queue, false);

    assert.strictEqual(result.apply, true);
    assert.strictEqual(result.state.pending, false);
});

// --- scenario 1: a refetch landing during a drag -------------------------

test("a refetch requested during an active drag does not apply", () => {
    const queue = createRefetchQueue();
    const result = requestRefetch(queue, true);

    assert.strictEqual(result.apply, false);
    assert.strictEqual(result.state.pending, true);
});

test("the held refetch applies once the drag ends", () => {
    let queue = createRefetchQueue();
    queue = requestRefetch(queue, true).state;

    const flushed = flushRefetch(queue);
    assert.strictEqual(flushed.apply, true);
    assert.strictEqual(flushed.state.pending, false);
});

// --- scenario 2: many requests, one flush --------------------------------

test("a queued refetch applies exactly once however many requests queued", () => {
    let queue = createRefetchQueue();
    for (let i = 0; i < 5; i++) {
        const result = requestRefetch(queue, true);
        assert.strictEqual(result.apply, false);
        queue = result.state;
    }

    const first = flushRefetch(queue);
    assert.strictEqual(first.apply, true);

    const second = flushRefetch(first.state);
    assert.strictEqual(second.apply, false);
});

test("a request that lands after the drag ends clears any pending flag", () => {
    let queue = createRefetchQueue();
    queue = requestRefetch(queue, true).state;

    const result = requestRefetch(queue, false);
    assert.strictEqual(result.apply, true);
    assert.strictEqual(result.state.pending, false);

    assert.strictEqual(flushRefetch(result.state).apply, false);
});

// --- scenario 4: flushing an empty queue ---------------------------------

test("flushing with nothing queued does nothing", () => {
    const queue = createRefetchQueue();
    const result = flushRefetch(queue);

    assert.strictEqual(result.apply, false);
    assert.strictEqual(result.state.pending, false);
});

// --- purity ---------------------------------------------------------------

test("queue transitions do not mutate the input state", () => {
    const queue = createRefetchQueue();
    const snapshot = JSON.stringify(queue);

    requestRefetch(queue, true);
    requestRefetch(queue, false);
    flushRefetch(queue);

    assert.strictEqual(JSON.stringify(queue), snapshot);
});

// --- scenario 5: the just-now hold ---------------------------------------

test("content change detection ignores an identical list", () => {
    const prev = [
        { id: 1, company: "Acme", status: "applied" },
        { id: 2, company: "Globex", status: "interview" },
    ];
    const next = [
        { id: 1, company: "Acme", status: "applied" },
        { id: 2, company: "Globex", status: "interview" },
    ];

    assert.strictEqual(hasContentChanged(prev, next), false);
});

test("content change detection ignores a reordered but identical list", () => {
    const prev = [
        { id: 1, company: "Acme" },
        { id: 2, company: "Globex" },
    ];
    const next = [
        { id: 2, company: "Globex" },
        { id: 1, company: "Acme" },
    ];

    assert.strictEqual(hasContentChanged(prev, next), false);
});

test("content change detection spots added, removed and edited rows", () => {
    const prev = [{ id: 1, status: "applied" }];

    assert.strictEqual(
        hasContentChanged(prev, [{ id: 1, status: "interview" }]),
        true,
    );
    assert.strictEqual(
        hasContentChanged(prev, [{ id: 1, status: "applied" }, { id: 2 }]),
        true,
    );
    assert.strictEqual(hasContentChanged(prev, []), true);
    assert.strictEqual(hasContentChanged(prev, [{ id: 3, status: "applied" }]), true);
});

test("a post-degraded refetch that changed content holds just-now", () => {
    assert.strictEqual(shouldHoldJustNow(true, true), true);
});

test("a post-degraded refetch that changed nothing does not hold just-now", () => {
    assert.strictEqual(shouldHoldJustNow(true, false), false);
});

test("a refetch that never went through degraded does not hold just-now", () => {
    assert.strictEqual(shouldHoldJustNow(false, true), false);
    assert.strictEqual(shouldHoldJustNow(false, false), false);
});
