import { test } from "node:test";
import assert from "node:assert";
import { snapshotOf, restoreBody } from "./recordState.js";

test("snapshotOf keeps stage, state, close reason and the follow-up only", () => {
    const snap = snapshotOf({
        id: 7,
        company_name: "Acme",
        stage: "interview",
        state: "closed",
        close_reason: "withdrawn",
        next_action_at: "2026-11-01",
        next_action: "Chase",
    });
    assert.deepStrictEqual(snap, {
        stage: "interview",
        state: "closed",
        close_reason: "withdrawn",
        next_action_at: "2026-11-01",
        next_action: "Chase",
    });
});

test("snapshotOf reads a missing close reason as null and a missing record as null", () => {
    assert.strictEqual(
        snapshotOf({ stage: "applied", state: "open" }).close_reason,
        null,
    );
    assert.strictEqual(snapshotOf(undefined), null);
});

test("restoring an open record reopens it at its stage with its follow-up", () => {
    assert.deepStrictEqual(
        restoreBody({
            stage: "responded",
            state: "open",
            close_reason: null,
            next_action_at: "2026-11-01",
            next_action: "Chase",
        }),
        {
            stage: "responded",
            state: "open",
            next_action_at: "2026-11-01",
            next_action: "Chase",
        },
    );
});

test("restoring an open record with no follow-up clears none that was never there", () => {
    assert.deepStrictEqual(
        restoreBody(snapshotOf({ stage: "applied", state: "open" })),
        { stage: "applied", state: "open", next_action_at: null, next_action: null },
    );
});

test("restoring a closed record closes it again with its reason", () => {
    assert.deepStrictEqual(
        restoreBody({ stage: "offer", state: "closed", close_reason: "accepted" }),
        { stage: "offer", state: "closed", close_reason: "accepted" },
    );
});
