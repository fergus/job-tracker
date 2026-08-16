"use strict";

// The one time model for "is this due yet".
//
// Both contacts (next_action_at) and, when the follow-up-date plan lands,
// applications (next_action_at) classify against this. Two independent
// derivations would let the board, the API and an agent disagree about what
// "overdue" means, which is the whole reason the plan anchors it to a single
// instance timezone rather than per-user.

const VALID_FOLLOWUP_STATES = ["overdue", "due", "upcoming"];

// A single instance-level zone: this is a self-hosted single-operator tool, so
// per-user timezone is carrying cost for nobody. Falls back to the container's
// own TZ before UTC, so a correctly-configured container needs no extra setting.
function instanceTimezone() {
    return process.env.INSTANCE_TIMEZONE || process.env.TZ || "UTC";
}

// Today's calendar date in the instance timezone, as YYYY-MM-DD.
// Intl is used rather than date arithmetic because it handles DST and the
// offset-date boundary that AE1 of the follow-up plan turns on: 00:30 on the
// 13th in Sydney is still the 12th in UTC, and the answer must be the 13th.
function todayInInstanceZone(now = new Date()) {
    const tz = instanceTimezone();
    try {
        return new Intl.DateTimeFormat("en-CA", {
            timeZone: tz,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
        }).format(now);
    } catch {
        // An invalid zone must not take the server down or silently shift every
        // date: fall back to UTC and let the caller's logs show the bad value.
        return new Intl.DateTimeFormat("en-CA", {
            timeZone: "UTC",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
        }).format(now);
    }
}

// Normalise a stored value to a bare calendar date. Day granularity throughout:
// time-of-day commitments belong in a calendar, and every other date in the
// schema is day-level.
function toCalendarDate(value) {
    if (!value) return null;
    const s = String(value).trim();
    if (!s) return null;
    const match = s.match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : null;
}

/**
 * Classify a follow-up date against today in the instance timezone.
 * Returns `overdue` | `due` | `upcoming`, or null when no date is set.
 */
function followUpState(dateValue, now = new Date()) {
    const date = toCalendarDate(dateValue);
    if (!date) return null;
    const today = todayInInstanceZone(now);
    if (date < today) return "overdue";
    if (date === today) return "due";
    return "upcoming";
}

// Whole days between today and the date; negative when overdue. Useful for
// "overdue by 3 days" wording without the caller redoing zone maths.
function daysUntil(dateValue, now = new Date()) {
    const date = toCalendarDate(dateValue);
    if (!date) return null;
    const today = todayInInstanceZone(now);
    const ms = Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`);
    return Math.round(ms / 86400000);
}

module.exports = {
    VALID_FOLLOWUP_STATES,
    instanceTimezone,
    todayInInstanceZone,
    toCalendarDate,
    followUpState,
    daysUntil,
};
