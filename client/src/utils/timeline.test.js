import { test } from "node:test";
import assert from "node:assert";
import {
    STAGE_ORDER,
    isTerminal,
    isMuted,
    isRejected,
    isAccepted,
    isLead,
    stageColor,
    computeSegments,
    durationDays,
} from "./timeline.js";

test("STAGE_ORDER contains the five active stages in pipeline order", () => {
    assert.deepStrictEqual(STAGE_ORDER, [
        "interested",
        "applied",
        "responded",
        "interview",
        "offer",
    ]);
});

test("isTerminal is true only for a closed record", () => {
    assert.strictEqual(isTerminal({ state: "closed", close_reason: "lapsed" }), true);
    assert.strictEqual(isTerminal({ state: "open", stage: "interview" }), false);
});

test("isTerminal is false for a missing record", () => {
    assert.strictEqual(isTerminal(undefined), false);
    assert.strictEqual(isTerminal(null), false);
    assert.strictEqual(isTerminal({}), false);
});

test("stageColor returns a CSS var reference", () => {
    assert.strictEqual(
        stageColor("interested"),
        "var(--stage-interested, oklch(57% 0.04 240))",
    );
    assert.strictEqual(
        stageColor("applied"),
        "var(--stage-applied, oklch(57% 0.04 240))",
    );
});

test("computeSegments builds stage segments from date transitions", () => {
    const app = {
        stage: "interview", state: "open",
        interested_at: "2026-01-01T00:00:00Z",
        applied_at: "2026-01-10T00:00:00Z",
        responded_at: "2026-01-20T00:00:00Z",
        interview_at: "2026-02-01T00:00:00Z",
    };
    const segments = computeSegments(app, "2026-04-01T00:00:00Z");

    assert.strictEqual(segments.length, 4);

    assert.strictEqual(segments[0].stage, "interested");
    assert.strictEqual(segments[0].start, "2026-01-01T00:00:00Z");
    assert.strictEqual(segments[0].end, "2026-01-10T00:00:00Z");
    assert.strictEqual(segments[0].isTrailing, false);

    assert.strictEqual(segments[1].stage, "applied");
    assert.strictEqual(segments[1].start, "2026-01-10T00:00:00Z");
    assert.strictEqual(segments[1].end, "2026-01-20T00:00:00Z");

    assert.strictEqual(segments[2].stage, "responded");
    assert.strictEqual(segments[2].start, "2026-01-20T00:00:00Z");
    assert.strictEqual(segments[2].end, "2026-02-01T00:00:00Z");

    assert.strictEqual(segments[3].stage, "interview");
    assert.strictEqual(segments[3].start, "2026-02-01T00:00:00Z");
    assert.strictEqual(segments[3].isTrailing, true);
});

test("computeSegments marks last segment as trailing for active apps", () => {
    const app = {
        stage: "interview", state: "open",
        interested_at: "2026-01-01T00:00:00Z",
        applied_at: "2026-01-10T00:00:00Z",
    };
    const segments = computeSegments(app, "2026-04-01T00:00:00Z");

    assert.strictEqual(segments.length, 2);
    assert.strictEqual(segments[0].stage, "interested");
    assert.strictEqual(segments[0].isTrailing, false);
    assert.strictEqual(segments[1].stage, "applied");
    assert.strictEqual(segments[1].isTrailing, true);
});

test("computeSegments adds terminal segment for closed apps", () => {
    const app = {
        state: "closed",
        close_reason: "rejected",
        interested_at: "2026-01-01T00:00:00Z",
        applied_at: "2026-01-10T00:00:00Z",
        closed_at: "2026-02-01T00:00:00Z",
    };
    const segments = computeSegments(app, "2026-04-01T00:00:00Z");

    const last = segments[segments.length - 1];
    assert.strictEqual(last.stage, "rejected");
    assert.strictEqual(last.start, "2026-02-01T00:00:00Z");
    assert.strictEqual(last.end, "2026-02-01T00:00:00Z");
    assert.strictEqual(last.isTrailing, false);
});

test("computeSegments uses today as trailing end when no terminal date", () => {
    const app = {
        stage: "interested", state: "open",
        interested_at: "2026-01-01T00:00:00Z",
    };
    const today = "2026-04-01T00:00:00Z";
    const segments = computeSegments(app, today);

    assert.strictEqual(segments[0].end, today);
});

test("durationDays calculates whole days between two dates", () => {
    assert.strictEqual(
        durationDays("2026-04-01T00:00:00Z", "2026-04-10T00:00:00Z"),
        9,
    );
    assert.strictEqual(
        durationDays("2026-04-01T00:00:00Z", "2026-04-01T00:00:00Z"),
        0,
    );
});

test("durationDays never returns negative", () => {
    assert.strictEqual(
        durationDays("2026-04-10T00:00:00Z", "2026-04-01T00:00:00Z"),
        0,
    );
});

test("computeSegments adds terminal segment for accepted apps", () => {
    const app = {
        state: "closed",
        close_reason: "accepted",
        interested_at: "2026-01-01T00:00:00Z",
        applied_at: "2026-01-10T00:00:00Z",
        closed_at: "2026-02-01T00:00:00Z",
    };
    const segments = computeSegments(app, "2026-04-01T00:00:00Z");

    const last = segments[segments.length - 1];
    assert.strictEqual(last.stage, "accepted");
    assert.strictEqual(last.start, "2026-02-01T00:00:00Z");
    assert.strictEqual(last.end, "2026-02-01T00:00:00Z");
    assert.strictEqual(last.isTrailing, false);
});

test("a non-rejection close gets a neutral closing segment that keeps its reason", () => {
    for (const reason of ["withdrawn", "role_closed", "lapsed", "not_pursued", "unresolved"]) {
        const segments = computeSegments(
            {
                stage: "applied",
                state: "closed",
                close_reason: reason,
                interested_at: "2026-01-01T00:00:00Z",
                applied_at: "2026-01-10T00:00:00Z",
                closed_at: "2026-02-01T00:00:00Z",
            },
            "2026-04-01T00:00:00Z",
        );
        const last = segments[segments.length - 1];
        assert.strictEqual(last.stage, "closed", `${reason} must not be drawn as rejected`);
        assert.strictEqual(last.reason, reason);
    }
});

test("an open record gets no closing segment", () => {
    const segments = computeSegments(
        {
            stage: "applied",
            state: "open",
            interested_at: "2026-01-01T00:00:00Z",
            applied_at: "2026-01-10T00:00:00Z",
        },
        "2026-04-01T00:00:00Z",
    );
    assert.deepStrictEqual(segments.map((s) => s.stage), ["interested", "applied"]);
});

// --- Record predicates ---

test("only a genuine rejection is quieted", () => {
    assert.equal(isMuted({ state: "closed", close_reason: "rejected" }), true);
    for (const reason of ["withdrawn", "role_closed", "lapsed", "not_pursued", "unresolved"]) {
        assert.equal(
            isMuted({ state: "closed", close_reason: reason }),
            false,
            `${reason} is not a failure and must not read as one`,
        );
    }
});

test("isRejected and isAccepted read the close reason", () => {
    assert.equal(isRejected({ state: "closed", close_reason: "rejected" }), true);
    assert.equal(isRejected({ state: "closed", close_reason: "role_closed" }), false);
    assert.equal(isAccepted({ state: "closed", close_reason: "accepted" }), true);
    assert.equal(isAccepted({ state: "closed", close_reason: "withdrawn" }), false);
    assert.equal(isAccepted({ state: "open" }), false);
});

test("isLead identifies a role that was never applied to", () => {
    assert.equal(isLead({ record_type: "lead" }), true);
    assert.equal(isLead({ record_type: "application" }), false);
    assert.equal(isLead({}), false);
});
