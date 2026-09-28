"use strict";

// The Today queue: everything owed in the next seven days, across open
// applications, leads and contacts, as one list the server has already
// classified and ordered. The client buckets it by follow_up_state and never
// re-sorts, so the screen, the API and an agent reading it agree across a day
// boundary.

const db = require("../db");
const {
    todayInInstanceZone,
    toCalendarDate,
    followUpState,
    daysUntil,
} = require("../lib/followup");

const WINDOW_DAYS = 7;

function windowEnd(now) {
    const d = new Date(`${todayInInstanceZone(now)}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + WINDOW_DAYS);
    return d.toISOString().slice(0, 10);
}

function decorate(item, now) {
    return {
        ...item,
        next_action_at: toCalendarDate(item.next_action_at),
        follow_up_state: followUpState(item.next_action_at, now),
        follow_up_days: daysUntil(item.next_action_at, now),
    };
}

// Date first, so the oldest overdue commitment leads. Title, kind and id only
// break ties, which keeps the order total and therefore stable across reads.
function compareItems(a, b) {
    if (a.next_action_at !== b.next_action_at) {
        return a.next_action_at < b.next_action_at ? -1 : 1;
    }
    const ta = a.title.toLowerCase();
    const tb = b.title.toLowerCase();
    if (ta !== tb) return ta < tb ? -1 : 1;
    if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
    return a.id - b.id;
}

function listToday(userEmail, { all, isAdmin = false } = {}, now = new Date()) {
    const showAll = isAdmin && all === "true";
    const bound = windowEnd(now);

    const appScope = showAll ? "" : "AND a.user_email = ?";
    const contactScope = showAll ? "" : "AND c.user_email = ?";
    const scopeParams = showAll ? [] : [userEmail];

    // Open only. The state column falls back to the legacy status for rows the
    // backfill has not reached, the same rule listApplications filters with.
    const applications = db
        .prepare(
            `SELECT a.id, a.company_name AS title, a.role_title AS subtitle,
                    COALESCE(a.record_type, CASE WHEN a.status IN ('applied','responded','interview','offer','accepted') THEN 'application' ELSE 'lead' END) AS record_type,
                    a.next_action, a.next_action_at, a.user_email
             FROM applications a
             WHERE a.next_action_at IS NOT NULL
               AND date(a.next_action_at) <= ?
               AND COALESCE(a.state, CASE WHEN a.status IN ('accepted','rejected') THEN 'closed' ELSE 'open' END) = 'open'
               ${appScope}`,
        )
        .all(bound, ...scopeParams)
        .map((row) => ({ kind: "application", ...row }));

    const contacts = db
        .prepare(
            `SELECT c.id, c.name AS title, c.employer AS subtitle,
                    NULL AS record_type, c.next_action, c.next_action_at, c.user_email
             FROM contacts c
             WHERE c.next_action_at IS NOT NULL
               AND date(c.next_action_at) <= ?
               ${contactScope}`,
        )
        .all(bound, ...scopeParams)
        .map((row) => ({ kind: "contact", ...row }));

    return [...applications, ...contacts]
        .map((item) => {
            const decorated = decorate(item, now);
            // Whose item this is only matters when more than one user's items
            // are in the list.
            if (!showAll) delete decorated.user_email;
            return decorated;
        })
        .sort(compareItems);
}

module.exports = { listToday, WINDOW_DAYS };
