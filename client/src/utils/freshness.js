/**
 * Freshness tier machine.
 *
 * Pure module: it holds no timers and reads no clock of its own. Every
 * elapsed measurement is derived from timestamps passed in by the caller,
 * which is what makes the thresholds testable against simulated time.
 *
 * All timestamps are client receipt times (KTD2) -- never server clocks.
 */

// --- thresholds ---------------------------------------------------------

/** Continuous failed reconnection for this long degrades the board. */
export const RECONNECT_DEGRADE_MS = 60000;
/** Silence from an otherwise open stream for this long degrades the board. */
export const SILENCE_DEGRADE_MS = 90000;
/** Time spent in degraded before the board is considered stale. */
export const STALE_AFTER_DEGRADED_MS = 300000;
/** The just-now state holds for this long after an update (KTD5). */
export const JUST_NOW_MS = 10000;
/** Past this elapsed time the display falls back to an absolute form. */
export const ABSOLUTE_CUTOFF_MS = 3600000;

const MINUTE_MS = 60000;

// --- tiers --------------------------------------------------------------

/** No connection has ever been confirmed and nothing has escalated yet. */
export const TIER_PENDING = "pending";
export const TIER_LIVE = "live";
export const TIER_DEGRADED = "degraded";
export const TIER_STALE = "stale";
export const TIER_TERMINAL = "terminal";

// --- state --------------------------------------------------------------

/**
 * Build the initial state. `nowMs` is page load: a page that never connects
 * escalates from this instant (R4a).
 */
export function createFreshnessState(nowMs) {
    return {
        pageLoadAt: nowMs,
        everConnected: false,
        connected: false,
        lastConfirmedAt: null,
        lastUpdateAt: null,
        // A page starts out "trying to connect", so the reconnection window
        // is open from page load.
        reconnectingSince: nowMs,
        permanentlyClosed: false,
    };
}

function confirm(state, nowMs) {
    return {
        ...state,
        everConnected: true,
        connected: true,
        lastConfirmedAt: nowMs,
        reconnectingSince: null,
        permanentlyClosed: false,
    };
}

/** The stream opened and was confirmed healthy. */
export function markConnected(state, nowMs) {
    return confirm(state, nowMs);
}

/** A keepalive (or any server ping) arrived. */
export function markKeepalive(state, nowMs) {
    return confirm(state, nowMs);
}

/** A data update arrived; also drives the just-now display. */
export function markUpdate(state, nowMs) {
    return { ...confirm(state, nowMs), lastUpdateAt: nowMs };
}

/**
 * The stream dropped, or a reconnection attempt failed. The reconnection
 * window must be continuous, so an already-open window is preserved.
 */
export function markDisconnected(state, nowMs) {
    return {
        ...state,
        connected: false,
        reconnectingSince:
            state.reconnectingSince === null ? nowMs : state.reconnectingSince,
    };
}

/** The stream is permanently closed and will not be retried. */
export function markPermanentlyClosed(state, nowMs) {
    return {
        ...state,
        connected: false,
        permanentlyClosed: true,
        reconnectingSince:
            state.reconnectingSince === null ? nowMs : state.reconnectingSince,
    };
}

// --- formatting ---------------------------------------------------------

const MONTHS = [
    "JAN",
    "FEB",
    "MAR",
    "APR",
    "MAY",
    "JUN",
    "JUL",
    "AUG",
    "SEP",
    "OCT",
    "NOV",
    "DEC",
];

function pad2(value) {
    return String(value).padStart(2, "0");
}

function sameCalendarDay(a, b) {
    return (
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate()
    );
}

/**
 * The absolute form of a confirmed-sync timestamp. Includes the date only
 * when the sync happened on a different calendar day to `nowMs`.
 */
export function formatAbsolute(lastConfirmedAt, nowMs) {
    if (lastConfirmedAt === null || lastConfirmedAt === undefined) {
        return "NEVER SYNCED";
    }
    const then = new Date(lastConfirmedAt);
    const now = new Date(nowMs === undefined ? lastConfirmedAt : nowMs);
    const clock = `${pad2(then.getHours())}:${pad2(then.getMinutes())}`;
    if (sameCalendarDay(then, now)) {
        return `SYNCED AT ${clock}`;
    }
    return `SYNCED ${then.getDate()} ${MONTHS[then.getMonth()]} ${clock}`;
}

/**
 * The exact string to render for a tier and an elapsed duration.
 *
 * options:
 *   lastConfirmedAt - ms timestamp of the last confirmed sync, or null
 *   nowMs           - current time; defaults to lastConfirmedAt + elapsedMs
 *   sinceUpdateMs   - ms since the last data update, or null
 */
export function formatFreshness(tier, elapsedMs, options = {}) {
    const {
        lastConfirmedAt = null,
        nowMs = null,
        sinceUpdateMs = null,
    } = options;

    if (tier === TIER_PENDING) return "";

    if (tier === TIER_LIVE) {
        if (sinceUpdateMs !== null && sinceUpdateMs < JUST_NOW_MS) {
            return "SYNCED JUST NOW";
        }
        return "LIVE";
    }

    if (lastConfirmedAt === null) return "NEVER SYNCED";

    const at = nowMs === null ? lastConfirmedAt + elapsedMs : nowMs;
    const then = new Date(lastConfirmedAt);
    const now = new Date(at);

    if (elapsedMs >= ABSOLUTE_CUTOFF_MS || !sameCalendarDay(then, now)) {
        return formatAbsolute(lastConfirmedAt, at);
    }

    if (elapsedMs < JUST_NOW_MS) return "SYNCED JUST NOW";

    // Whole minutes only (KD4). Anything past just-now is at least 1 min.
    const minutes = Math.max(1, Math.floor(elapsedMs / MINUTE_MS));
    return `SYNCED ${minutes} MIN AGO`;
}

// --- evaluation ---------------------------------------------------------

/**
 * Derive the tier, display string and silence signal for `nowMs`.
 *
 * Returns:
 *   tier          - one of the TIER_* constants
 *   display       - the string to render
 *   absolute      - the absolute form, available in every tier
 *   elapsedMs     - ms since the last confirmed sync (or page load)
 *   minutes       - `elapsedMs` quantised to whole minutes
 *   silenceSignal - true when R13's silence branch has fired; the caller is
 *                   expected to force-close and reopen the stream on it.
 *                   This module only reports it, it never acts on it.
 */
export function evaluateFreshness(state, nowMs) {
    const anchor =
        state.lastConfirmedAt === null ? state.pageLoadAt : state.lastConfirmedAt;
    const elapsedMs = Math.max(0, nowMs - anchor);

    // R13, condition one: continuous failed reconnection.
    const reconnectDegradedAt =
        state.reconnectingSince === null
            ? null
            : state.reconnectingSince + RECONNECT_DEGRADE_MS;

    // R13, condition two: silence on an otherwise open connection.
    const silenceDegradedAt =
        state.connected && state.lastConfirmedAt !== null
            ? state.lastConfirmedAt + SILENCE_DEGRADE_MS
            : null;

    const candidates = [reconnectDegradedAt, silenceDegradedAt].filter(
        (value) => value !== null && nowMs >= value,
    );
    const degradedAt = candidates.length === 0 ? null : Math.min(...candidates);

    const silenceSignal =
        silenceDegradedAt !== null && nowMs >= silenceDegradedAt;

    let tier;
    if (state.permanentlyClosed) {
        // R5: terminal is entered immediately, with no debounce.
        tier = TIER_TERMINAL;
    } else if (degradedAt === null) {
        tier = state.everConnected ? TIER_LIVE : TIER_PENDING;
    } else if (nowMs - degradedAt >= STALE_AFTER_DEGRADED_MS) {
        tier = TIER_STALE;
    } else {
        tier = TIER_DEGRADED;
    }

    const sinceUpdateMs =
        state.lastUpdateAt === null ? null : Math.max(0, nowMs - state.lastUpdateAt);

    return {
        tier,
        display: formatFreshness(tier, elapsedMs, {
            lastConfirmedAt: state.lastConfirmedAt,
            nowMs,
            sinceUpdateMs,
        }),
        absolute: formatAbsolute(state.lastConfirmedAt, nowMs),
        elapsedMs,
        minutes: Math.floor(elapsedMs / MINUTE_MS),
        silenceSignal,
    };
}
