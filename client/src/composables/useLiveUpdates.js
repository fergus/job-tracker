// Subscribes to the server's SSE stream of application changes (fed by both
// the REST API and the MCP pipe, since they share the same service layer).
// Returns an unsubscribe function.
export function subscribeToChanges(all, onChange) {
    const url = all ? "/api/events?all=true" : "/api/events";
    const source = new EventSource(url);

    source.addEventListener("change", (e) => {
        try {
            onChange(JSON.parse(e.data));
        } catch {
            // ignore malformed events
        }
    });

    return () => source.close();
}
