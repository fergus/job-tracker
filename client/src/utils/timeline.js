export const STAGE_ORDER = [
    "interested",
    "applied",
    "responded",
    "interview",
    "offer",
];
export const TERMINAL_STAGES = ["accepted", "rejected"];

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

// `state` is authoritative where present. The status fallback keeps a record
// rendering correctly mid-migration, before the backfill has been applied.
export function isTerminal(statusOrApp) {
    if (statusOrApp && typeof statusOrApp === "object") {
        if (statusOrApp.state) return statusOrApp.state === "closed";
        return TERMINAL_STAGES.includes(statusOrApp.status);
    }
    return TERMINAL_STAGES.includes(statusOrApp);
}

// Only a genuine rejection is quieted. A record closed because the role was
// filled or because it lapsed is not a failure and should not read as one.
export function isMuted(statusOrApp) {
    return isRejected(statusOrApp);
}

export function isRejected(statusOrApp) {
    if (statusOrApp && typeof statusOrApp === "object") {
        if (statusOrApp.close_reason) {
            return statusOrApp.close_reason === "rejected";
        }
        return statusOrApp.status === "rejected";
    }
    return statusOrApp === "rejected";
}

export function isAccepted(statusOrApp) {
    if (statusOrApp && typeof statusOrApp === "object") {
        if (statusOrApp.close_reason) {
            return statusOrApp.close_reason === "accepted";
        }
        return statusOrApp.status === "accepted";
    }
    return statusOrApp === "accepted";
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
    const isTerminal = TERMINAL_STAGES.includes(application.status);

    // Build ordered list of { stage, date } transition points
    const points = [];

    for (const stage of STAGE_ORDER) {
        const dateKey = STAGE_DATE_MAP[stage];
        if (application[dateKey]) {
            points.push({ stage, date: application[dateKey] });
        }
    }

    const terminalDate = application.closed_at;
    const trailingEnd = isTerminal && terminalDate ? terminalDate : today;

    const segments = [];

    for (let i = 0; i < points.length; i++) {
        const start = points[i].date;
        const end = i + 1 < points.length ? points[i + 1].date : trailingEnd;
        const isTrailing = i === points.length - 1 && !isTerminal;

        if (!start) continue;

        segments.push({
            stage: points[i].stage,
            start,
            end,
            isTrailing,
        });
    }

    // Add terminal stage segment if application is closed
    if (isTerminal && terminalDate) {
        segments.push({
            stage: application.status,
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
