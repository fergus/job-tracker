import { ref, getCurrentInstance, onUnmounted } from "vue";
import {
    createFreshnessState,
    markConnected,
    markKeepalive,
    markUpdate,
    markDisconnected,
    markPermanentlyClosed,
    evaluateFreshness,
    TIER_PENDING,
} from "../utils/freshness.js";

/** The display refresh cadence (KTD3): one interval, whole minutes only. */
const REFRESH_INTERVAL_MS = 60000;

/** EventSource.CLOSED -- the browser has given up reconnecting. */
const READY_STATE_CLOSED = 2;

function eventsUrl(all) {
    return all ? "/api/events?all=true" : "/api/events";
}

function parse(event) {
    try {
        return JSON.parse(event.data);
    } catch {
        // ignore malformed events
        return undefined;
    }
}

/**
 * Subscribes to the server's SSE stream of application changes (fed by both
 * the REST API and the MCP pipe, since they share the same service layer)
 * and tracks how fresh the board is.
 *
 * options:
 *   all                - subscribe to the all-users stream
 *   onChange(payload)  - a `change` event arrived
 *   onReconnect()      - the stream reopened after a drop; the caller is
 *                        expected to refetch the full list (R9). Never fires
 *                        for the very first open, since the caller already
 *                        loads on mount.
 *   now()              - clock seam, defaults to Date.now
 *   eventSourceFactory(url) - stream seam, defaults to `new EventSource(url)`
 *   setIntervalFn / clearIntervalFn - timer seams, default to the globals
 *
 * Returns reactive `tier`, `display` and `absolute` refs plus `reconnect()`
 * and `stop()`. Teardown is automatic inside a component; call `stop()`
 * directly otherwise.
 */
export function useLiveUpdates(options = {}) {
    const {
        all = false,
        onChange = () => {},
        onReconnect = () => {},
        now = () => Date.now(),
        eventSourceFactory = (url) => new EventSource(url),
        setIntervalFn = setInterval,
        clearIntervalFn = clearInterval,
    } = options;

    const tier = ref(TIER_PENDING);
    const display = ref("");
    const absolute = ref("");

    let state = createFreshnessState(now());
    let source = null;
    let timer = null;
    let everOpened = false;

    // Recompute the displayed values, assigning only when the quantised
    // result actually changed (KTD3) so the UI does not churn every minute.
    function refresh() {
        const result = evaluateFreshness(state, now());
        if (result.tier !== tier.value) tier.value = result.tier;
        if (result.display !== display.value) display.value = result.display;
        if (result.absolute !== absolute.value) absolute.value = result.absolute;
        return result;
    }

    function closeStream() {
        if (source === null) return;
        const closing = source;
        source = null;
        closing.close();
    }

    function openStream() {
        closeStream();

        const stream = eventSourceFactory(eventsUrl(all));
        source = stream;

        stream.onopen = () => {
            state = markConnected(state, now());
            refresh();
            // The first open confirms the connection; the caller already
            // loaded on mount, so only later opens are reconnections (R9).
            if (everOpened) {
                onReconnect();
            } else {
                everOpened = true;
            }
        };

        stream.onerror = () => {
            state =
                stream.readyState === READY_STATE_CLOSED
                    ? markPermanentlyClosed(state, now())
                    : markDisconnected(state, now());
            refresh();
        };

        stream.addEventListener("change", (event) => {
            const payload = parse(event);
            if (payload === undefined) return;
            state = markUpdate(state, now());
            refresh();
            onChange(payload);
        });

        // A keepalive proves the stream is alive without being a data change
        // (KD5): LIVE means updates are arriving, not merely that no error
        // has fired.
        stream.addEventListener("ping", () => {
            state = markKeepalive(state, now());
            refresh();
        });
    }

    function tick() {
        const result = refresh();
        if (!result.silenceSignal) return;
        // R13a: the socket is open but dead. EventSource will not reconnect a
        // socket it has not seen fail, so force the cycle ourselves; the fresh
        // stream either recovers or surfaces a real error. The freshness state
        // is deliberately left alone -- the board stays degraded until the new
        // stream confirms itself, rather than reverting to live on hope.
        openStream();
    }

    /** Tear down and reopen; the retry affordance calls this. */
    function reconnect() {
        state = markDisconnected(state, now());
        openStream();
        refresh();
    }

    function stop() {
        if (timer !== null) {
            clearIntervalFn(timer);
            timer = null;
        }
        closeStream();
    }

    openStream();
    refresh();
    timer = setIntervalFn(tick, REFRESH_INTERVAL_MS);

    if (getCurrentInstance()) onUnmounted(stop);

    return { tier, display, absolute, reconnect, stop };
}

// Subscribes to the server's SSE stream of application changes.
// Returns an unsubscribe function.
export function subscribeToChanges(all, onChange) {
    const source = new EventSource(eventsUrl(all));

    source.addEventListener("change", (e) => {
        const payload = parse(e);
        if (payload === undefined) return;
        onChange(payload);
    });

    return () => source.close();
}
