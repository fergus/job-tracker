import { test } from "node:test";
import assert from "node:assert";
import { snapshotOf, restoreBody } from "./recordState.js";

test("snapshotOf keeps stage, state and close reason only", () => {
    const snap = snapshotOf({
        id: 7,
        company_name: "Acme",
        stage: "interview",
        state: "closed",
        close_reason: "withdrawn",
    });
    assert.deepStrictEqual(snap, {
        stage: "interview",
        state: "closed",
        close_reason: "withdrawn",
    });
});

test("snapshotOf reads a missing close reason as null and a missing record as null", () => {
    assert.strictEqual(
        snapshotOf({ stage: "applied", state: "open" }).close_reason,
        null,
    );
    assert.strictEqual(snapshotOf(undefined), null);
});

test("restoring an open record reopens it at its stage", () => {
    assert.deepStrictEqual(
        restoreBody({ stage: "responded", state: "open", close_reason: null }),
        { stage: "responded", state: "open" },
    );
});

test("restoring a closed record closes it again with its reason", () => {
    assert.deepStrictEqual(
        restoreBody({ stage: "offer", state: "closed", close_reason: "accepted" }),
        { stage: "offer", state: "closed", close_reason: "accepted" },
    );
});
