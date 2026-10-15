export const STAGE_ORDER = [
    "interested",
    "applied",
    "responded",
    "interview",
    "offer",
];
export const CLOSE_REASONS = [
    "accepted",
    "rejected",
    "withdrawn",
    "role_closed",
    "lapsed",
    "not_pursued",
    "unresolved",
];

export const CLOSE_REASON_LABELS = {
    accepted: "Offer accepted",
    rejected: "Rejected",
    withdrawn: "I withdrew",
    role_closed: "Role closed",
    lapsed: "No response",
    not_pursued: "Never applied",
    unresolved: "Reason unknown",
};

export function isTerminal(app) {
    return app?.state === "closed";
}

// Only a genuine rejection is quieted. A record closed because the role was
// filled or because it lapsed is not a failure and should not read as one.
export function isMuted(app) {
    return isRejected(app);
}

export function isRejected(app) {
    return app?.close_reason === "rejected";
}

export function isAccepted(app) {
    return app?.close_reason === "accepted";
}

export function isLead(app) {
    return app?.record_type === "lead";
}

const STAGE_DATE_MAP = {
    interested: "interested_at",
    applied: "applied_at",
    responded: "responded_at",
    interview: "interview_at",
    offer: "offer_at",
};

export function stageColor(stage) {
    return `var(--stage-${stage}, oklch(57% 0.04 240))`;
}

export function computeSegments(application, globalEnd) {
    const today = globalEnd || new Date().toISOString();
    const closed = isTerminal(application);

    // Build ordered list of { stage, date } transition points
    const points = [];

    for (const stage of STAGE_ORDER) {
        const dateKey = STAGE_DATE_MAP[stage];
        if (application[dateKey]) {
            points.push({ stage, date: application[dateKey] });
        }
    }

    const terminalDate = application.closed_at;
    const trailingEnd = closed && terminalDate ? terminalDate : today;

    const segments = [];

    for (let i = 0; i < points.length; i++) {
        const start = points[i].date;
        const end = i + 1 < points.length ? points[i + 1].date : trailingEnd;
        const isTrailing = i === points.length - 1 && !closed;

        if (!start) continue;

        segments.push({
            stage: points[i].stage,
            start,
            end,
            isTrailing,
        });
    }

    // Add a closing segment. Accepted and rejected keep their own colours; every
    // other reason shares a neutral one, so a lapse or a withdrawal is not drawn
    // as a rejection. `reason` carries the real close reason for labels.
    if (closed && terminalDate) {
        const reason = application.close_reason;
        segments.push({
            stage:
                reason === "accepted" || reason === "rejected"
                    ? reason
                    : "closed",
            reason,
            start: terminalDate,
            end: terminalDate,
            isTrailing: false,
        });
    }

    return segments;
}

export function durationDays(start, end) {
    const ms = new Date(end) - new Date(start);
    return Math.max(0, Math.round(ms / 86400000));
}
