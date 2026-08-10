/**
 * Reconnect refetch queue.
 *
 * The stream has no event replay, so anything that changed while a tab was
 * disconnected is only recovered by refetching the whole list on reconnect
 * (R9). That refetch must never re-render the board under an active drag
 * (R10) -- see docs/solutions/ui-bugs/showclosed-toggle-drag-guard-and-panel-
 * close-sync-2026-04-30.md: never mutate layout-critical reactive state
 * mid-drag.
 *
 * Pure module: no timers, no clock reads, no Vue imports. The caller owns the
 * drag flag and the fetching; this decides only whether a refetch may apply
 * now or must wait for the drag to end.
 */

/** A queue holding at most one deferred refetch. */
export function createRefetchQueue() {
    return { pending: false };
}

/**
 * Ask to apply a refetch. `dragActive` is the caller's current drag flag.
 *
 * Returns { state, apply }. When `apply` is false the request has been held
 * and `flushRefetch` will release it once the drag ends. Requests collapse:
 * any number made during one drag release as a single refetch.
 */
export function requestRefetch(state, dragActive) {
    if (dragActive) {
        return { state: { pending: true }, apply: false };
    }
    return { state: { pending: false }, apply: true };
}

/**
 * Release a held refetch. Called when the drag ends. Flushing an empty queue
 * is a no-op, and a flushed queue does not flush twice.
 */
export function flushRefetch(state) {
    if (!state.pending) {
        return { state: { pending: false }, apply: false };
    }
    return { state: { pending: false }, apply: true };
}

/**
 * Whether a refetched list differs from the one on screen. Identity and order
 * of the array are irrelevant; only the rows and their fields count, since
 * only those are visible.
 */
export function hasContentChanged(prev, next) {
    if (!Array.isArray(prev) || !Array.isArray(next)) return true;
    if (prev.length !== next.length) return true;

    const before = new Map();
    for (const item of prev) before.set(item.id, item);

    for (const item of next) {
        const previous = before.get(item.id);
        if (previous === undefined) return true;
        if (JSON.stringify(previous) !== JSON.stringify(item)) return true;
    }
    return false;
}

/**
 * Whether the applied refetch should put the display into the just-now state
 * (R11): a content shift the user did not cause needs a stated cause, and
 * only a recovery from a degraded board is a shift worth explaining.
 */
export function shouldHoldJustNow(wasDegraded, changed) {
    return wasDegraded === true && changed === true;
}
