import { test } from "node:test";
import assert from "node:assert";
import {
    RECONNECT_DEGRADE_MS,
    SILENCE_DEGRADE_MS,
    STALE_AFTER_DEGRADED_MS,
    JUST_NOW_MS,
    ABSOLUTE_CUTOFF_MS,
    TIER_PENDING,
    TIER_LIVE,
    TIER_DEGRADED,
    TIER_STALE,
    TIER_TERMINAL,
    createFreshnessState,
    markConnected,
    markKeepalive,
    markUpdate,
    markDisconnected,
    markPermanentlyClosed,
    evaluateFreshness,
    formatFreshness,
    formatAbsolute,
} from "./freshness.js";

// A fixed local wall-clock instant used as "page load" for most tests.
const T0 = new Date(2026, 7, 8, 10, 0, 0).getTime();

const MIN = 60000;

// --- constants -----------------------------------------------------------

test("thresholds are exported as named constants", () => {
    assert.strictEqual(RECONNECT_DEGRADE_MS, 60000);
    assert.strictEqual(SILENCE_DEGRADE_MS, 90000);
    assert.strictEqual(STALE_AFTER_DEGRADED_MS, 300000);
    assert.strictEqual(JUST_NOW_MS, 10000);
    assert.strictEqual(ABSOLUTE_CUTOFF_MS, 3600000);
});

test("tier names are exported as named constants", () => {
    assert.strictEqual(TIER_PENDING, "pending");
    assert.strictEqual(TIER_LIVE, "live");
    assert.strictEqual(TIER_DEGRADED, "degraded");
    assert.strictEqual(TIER_STALE, "stale");
    assert.strictEqual(TIER_TERMINAL, "terminal");
});

// --- scenario 4: before any confirmed connection -------------------------

test("display is empty and not live before the first confirmed connection", () => {
    const state = createFreshnessState(T0);
    const result = evaluateFreshness(state, T0);

    assert.strictEqual(result.tier, TIER_PENDING);
    assert.strictEqual(result.display, "");
    assert.notStrictEqual(result.display, "LIVE");
});

test("display stays empty right up to the reconnect threshold", () => {
    const state = createFreshnessState(T0);
    const result = evaluateFreshness(state, T0 + RECONNECT_DEGRADE_MS - 1);

    assert.strictEqual(result.tier, TIER_PENDING);
    assert.strictEqual(result.display, "");
});

// --- scenario 5: a page that never connects ------------------------------

test("a page that never connects degrades 60s after page load", () => {
    const state = createFreshnessState(T0);
    const result = evaluateFreshness(state, T0 + RECONNECT_DEGRADE_MS);

    assert.strictEqual(result.tier, TIER_DEGRADED);
    assert.strictEqual(result.display, "NEVER SYNCED");
});

test("a page that never connects goes stale on the same 5 minute rule", () => {
    const state = createFreshnessState(T0);
    const at = T0 + RECONNECT_DEGRADE_MS + STALE_AFTER_DEGRADED_MS;
    const result = evaluateFreshness(state, at);

    assert.strictEqual(result.tier, TIER_STALE);
    assert.strictEqual(result.display, "NEVER SYNCED");
});

// --- scenario 1: drop and recovery inside the threshold ------------------

test("a drop and recovery inside the threshold produces no tier change", () => {
    let state = markConnected(createFreshnessState(T0), T0);
    assert.strictEqual(evaluateFreshness(state, T0).tier, TIER_LIVE);

    state = markDisconnected(state, T0 + 5000);
    const during = evaluateFreshness(state, T0 + 30000);
    assert.strictEqual(during.tier, TIER_LIVE);
    assert.strictEqual(during.display, "LIVE");

    state = markConnected(state, T0 + 40000);
    const after = evaluateFreshness(state, T0 + 90000);
    assert.strictEqual(after.tier, TIER_LIVE);
    assert.strictEqual(after.display, "LIVE");
});

test("recovery clears the continuous reconnection window", () => {
    let state = markConnected(createFreshnessState(T0), T0);
    state = markDisconnected(state, T0 + 10000);
    state = markConnected(state, T0 + 50000);
    state = markDisconnected(state, T0 + 60000);

    // Only 50s of the new reconnection window has elapsed at T0+110s.
    assert.strictEqual(evaluateFreshness(state, T0 + 110000).tier, TIER_LIVE);
    assert.strictEqual(
        evaluateFreshness(state, T0 + 120000).tier,
        TIER_DEGRADED,
    );
});

// --- scenario 2: R13 condition one, failed reconnection ------------------

test("60s of continuous failed reconnection yields degraded", () => {
    let state = markConnected(createFreshnessState(T0), T0);
    state = markDisconnected(state, T0);

    const before = evaluateFreshness(state, T0 + RECONNECT_DEGRADE_MS - 1);
    assert.strictEqual(before.tier, TIER_LIVE);

    const at = evaluateFreshness(state, T0 + RECONNECT_DEGRADE_MS);
    assert.strictEqual(at.tier, TIER_DEGRADED);
    assert.strictEqual(at.display, "SYNCED 1 MIN AGO");
    assert.strictEqual(at.silenceSignal, false);
});

test("degraded via failed reconnection never shows a sub-minute value", () => {
    let state = markConnected(createFreshnessState(T0), T0);
    state = markDisconnected(state, T0 + 30000);

    const result = evaluateFreshness(state, T0 + 30000 + RECONNECT_DEGRADE_MS);
    assert.strictEqual(result.tier, TIER_DEGRADED);
    assert.strictEqual(result.display, "SYNCED 1 MIN AGO");
    assert.ok(!/SEC/.test(result.display));
});

// --- scenario 3: R13 condition two, keepalive silence -------------------

test("90s without a keepalive on an open connection yields degraded", () => {
    const state = markConnected(createFreshnessState(T0), T0);

    const before = evaluateFreshness(state, T0 + SILENCE_DEGRADE_MS - 1);
    assert.strictEqual(before.tier, TIER_LIVE);
    assert.strictEqual(before.silenceSignal, false);

    const at = evaluateFreshness(state, T0 + SILENCE_DEGRADE_MS);
    assert.strictEqual(at.tier, TIER_DEGRADED);
    assert.strictEqual(at.display, "SYNCED 1 MIN AGO");
    assert.strictEqual(at.silenceSignal, true);
});

test("a keepalive resets the silence window", () => {
    let state = markConnected(createFreshnessState(T0), T0);
    state = markKeepalive(state, T0 + 80000);

    assert.strictEqual(
        evaluateFreshness(state, T0 + SILENCE_DEGRADE_MS).tier,
        TIER_LIVE,
    );
    assert.strictEqual(
        evaluateFreshness(state, T0 + 80000 + SILENCE_DEGRADE_MS).tier,
        TIER_DEGRADED,
    );
});

test("the silence signal is not raised while the socket is closed", () => {
    let state = markConnected(createFreshnessState(T0), T0);
    state = markDisconnected(state, T0);

    const result = evaluateFreshness(state, T0 + 5 * MIN);
    assert.strictEqual(result.silenceSignal, false);
});

// --- scenario 7: five minutes in degraded -------------------------------

test("five minutes in degraded yields stale", () => {
    let state = markConnected(createFreshnessState(T0), T0);
    state = markDisconnected(state, T0);

    const degradedAt = T0 + RECONNECT_DEGRADE_MS;
    const before = evaluateFreshness(
        state,
        degradedAt + STALE_AFTER_DEGRADED_MS - 1,
    );
    assert.strictEqual(before.tier, TIER_DEGRADED);

    const at = evaluateFreshness(state, degradedAt + STALE_AFTER_DEGRADED_MS);
    assert.strictEqual(at.tier, TIER_STALE);
    assert.strictEqual(at.display, "SYNCED 6 MIN AGO");
});

test("stale is reached from the silence condition too", () => {
    const state = markConnected(createFreshnessState(T0), T0);
    const degradedAt = T0 + SILENCE_DEGRADE_MS;

    const result = evaluateFreshness(
        state,
        degradedAt + STALE_AFTER_DEGRADED_MS,
    );
    assert.strictEqual(result.tier, TIER_STALE);
    assert.strictEqual(result.silenceSignal, true);
});

// --- scenario 8: permanent closure --------------------------------------

test("permanent closure yields terminal immediately, with no debounce", () => {
    let state = markConnected(createFreshnessState(T0), T0);
    state = markPermanentlyClosed(state, T0 + 1000);

    const result = evaluateFreshness(state, T0 + 1000);
    assert.strictEqual(result.tier, TIER_TERMINAL);
});

test("permanent closure before any connection is still terminal", () => {
    const state = markPermanentlyClosed(createFreshnessState(T0), T0 + 500);

    const result = evaluateFreshness(state, T0 + 500);
    assert.strictEqual(result.tier, TIER_TERMINAL);
    assert.strictEqual(result.display, "NEVER SYNCED");
});

test("terminal outranks degraded and stale", () => {
    let state = markConnected(createFreshnessState(T0), T0);
    state = markDisconnected(state, T0);
    state = markPermanentlyClosed(state, T0 + 10 * MIN);

    assert.strictEqual(
        evaluateFreshness(state, T0 + 20 * MIN).tier,
        TIER_TERMINAL,
    );
});

// --- scenario 6: R4b, no reversion --------------------------------------

test("after a confirmed connection the display never returns to empty", () => {
    let state = markConnected(createFreshnessState(T0), T0);
    state = markDisconnected(state, T0);

    for (const at of [T0 + MIN, T0 + 6 * MIN, T0 + 12 * MIN]) {
        assert.notStrictEqual(evaluateFreshness(state, at).display, "");
    }

    state = markPermanentlyClosed(state, T0 + 13 * MIN);
    assert.notStrictEqual(
        evaluateFreshness(state, T0 + 13 * MIN).display,
        "",
    );
});

test("the display never says LIVE while degraded, stale or terminal", () => {
    let state = markConnected(createFreshnessState(T0), T0);
    state = markDisconnected(state, T0);

    assert.notStrictEqual(evaluateFreshness(state, T0 + MIN).display, "LIVE");
    assert.notStrictEqual(
        evaluateFreshness(state, T0 + 6 * MIN).display,
        "LIVE",
    );

    state = markPermanentlyClosed(state, T0 + 7 * MIN);
    assert.notStrictEqual(
        evaluateFreshness(state, T0 + 7 * MIN).display,
        "LIVE",
    );
});

test("the elapsed duration keeps counting in every tier after live", () => {
    let state = markConnected(createFreshnessState(T0), T0);
    state = markDisconnected(state, T0);

    assert.strictEqual(evaluateFreshness(state, T0 + 2 * MIN).elapsedMs, 2 * MIN);
    assert.strictEqual(evaluateFreshness(state, T0 + 9 * MIN).elapsedMs, 9 * MIN);

    state = markPermanentlyClosed(state, T0 + 9 * MIN);
    assert.strictEqual(
        evaluateFreshness(state, T0 + 11 * MIN).elapsedMs,
        11 * MIN,
    );
    assert.strictEqual(
        evaluateFreshness(state, T0 + 11 * MIN).display,
        "SYNCED 11 MIN AGO",
    );
});

// --- scenario 9: whole-minute quantisation ------------------------------

test("the displayed duration changes only on minute boundaries", () => {
    let state = markConnected(createFreshnessState(T0), T0);
    state = markDisconnected(state, T0);

    assert.strictEqual(
        evaluateFreshness(state, T0 + 2 * MIN).display,
        "SYNCED 2 MIN AGO",
    );
    assert.strictEqual(
        evaluateFreshness(state, T0 + 2 * MIN + 59999).display,
        "SYNCED 2 MIN AGO",
    );
    assert.strictEqual(
        evaluateFreshness(state, T0 + 3 * MIN).display,
        "SYNCED 3 MIN AGO",
    );
});

test("minutes are exposed alongside the display string", () => {
    let state = markConnected(createFreshnessState(T0), T0);
    state = markDisconnected(state, T0);

    assert.strictEqual(evaluateFreshness(state, T0 + 150000).minutes, 2);
});

// --- scenario 10: absolute fallback -------------------------------------

test("beyond one hour the display falls back to the absolute form", () => {
    let state = markConnected(createFreshnessState(T0), T0);
    state = markDisconnected(state, T0);

    const justUnder = evaluateFreshness(state, T0 + ABSOLUTE_CUTOFF_MS - 1);
    assert.strictEqual(justUnder.display, "SYNCED 59 MIN AGO");

    const at = evaluateFreshness(state, T0 + ABSOLUTE_CUTOFF_MS);
    assert.strictEqual(at.display, "SYNCED AT 10:00");
});

test("crossing a day boundary falls back to the absolute form with a date", () => {
    const lateNight = new Date(2026, 7, 7, 23, 59, 0).getTime();
    let state = markConnected(createFreshnessState(lateNight), lateNight);
    state = markDisconnected(state, lateNight);

    const afterMidnight = new Date(2026, 7, 8, 0, 5, 0).getTime();
    const result = evaluateFreshness(state, afterMidnight);

    assert.strictEqual(result.elapsedMs, 6 * MIN);
    assert.strictEqual(result.display, "SYNCED 7 AUG 23:59");
});

test("the absolute form is available in every tier", () => {
    let state = markConnected(createFreshnessState(T0), T0);
    assert.strictEqual(evaluateFreshness(state, T0).absolute, "SYNCED AT 10:00");

    state = markDisconnected(state, T0);
    assert.strictEqual(
        evaluateFreshness(state, T0 + 2 * MIN).absolute,
        "SYNCED AT 10:00",
    );
    assert.strictEqual(
        evaluateFreshness(state, T0 + 20 * MIN).absolute,
        "SYNCED AT 10:00",
    );

    state = markPermanentlyClosed(state, T0 + 21 * MIN);
    assert.strictEqual(
        evaluateFreshness(state, T0 + 21 * MIN).absolute,
        "SYNCED AT 10:00",
    );
});

test("formatAbsolute pads hours and minutes", () => {
    const t = new Date(2026, 0, 3, 9, 5, 0).getTime();
    assert.strictEqual(formatAbsolute(t, t), "SYNCED AT 09:05");
    const nextDay = new Date(2026, 0, 4, 9, 5, 0).getTime();
    assert.strictEqual(formatAbsolute(t, nextDay), "SYNCED 3 JAN 09:05");
});

// --- scenario 11: the just-now state ------------------------------------

test("the just-now state holds for its constant and then returns to live", () => {
    let state = markConnected(createFreshnessState(T0), T0);
    state = markUpdate(state, T0 + 1000);

    const during = evaluateFreshness(state, T0 + 1000 + JUST_NOW_MS - 1);
    assert.strictEqual(during.tier, TIER_LIVE);
    assert.strictEqual(during.display, "SYNCED JUST NOW");

    const after = evaluateFreshness(state, T0 + 1000 + JUST_NOW_MS);
    assert.strictEqual(after.tier, TIER_LIVE);
    assert.strictEqual(after.display, "LIVE");
});

test("connecting alone does not trigger the just-now state", () => {
    const state = markConnected(createFreshnessState(T0), T0);
    assert.strictEqual(evaluateFreshness(state, T0).display, "LIVE");
});

// --- formatter used directly --------------------------------------------

test("formatFreshness renders each tier from a tier and elapsed ms", () => {
    assert.strictEqual(formatFreshness(TIER_PENDING, 0), "");
    assert.strictEqual(formatFreshness(TIER_LIVE, 0), "LIVE");
    assert.strictEqual(
        formatFreshness(TIER_LIVE, 0, { sinceUpdateMs: 0 }),
        "SYNCED JUST NOW",
    );
    assert.strictEqual(
        formatFreshness(TIER_DEGRADED, 90000, { lastConfirmedAt: T0 }),
        "SYNCED 1 MIN AGO",
    );
    assert.strictEqual(
        formatFreshness(TIER_STALE, 6 * MIN, { lastConfirmedAt: T0 }),
        "SYNCED 6 MIN AGO",
    );
    assert.strictEqual(
        formatFreshness(TIER_TERMINAL, 5000, { lastConfirmedAt: T0 }),
        "SYNCED JUST NOW",
    );
    assert.strictEqual(formatFreshness(TIER_STALE, 6 * MIN), "NEVER SYNCED");
});

test("formatFreshness rounds any sub-minute non-just-now value up to 1 min", () => {
    assert.strictEqual(
        formatFreshness(TIER_TERMINAL, 30000, { lastConfirmedAt: T0 }),
        "SYNCED 1 MIN AGO",
    );
});

// --- state helpers are pure ---------------------------------------------

test("state transitions do not mutate the input state", () => {
    const initial = createFreshnessState(T0);
    const snapshot = JSON.stringify(initial);

    markConnected(initial, T0 + 1);
    markKeepalive(initial, T0 + 2);
    markUpdate(initial, T0 + 3);
    markDisconnected(initial, T0 + 4);
    markPermanentlyClosed(initial, T0 + 5);

    assert.strictEqual(JSON.stringify(initial), snapshot);
});
