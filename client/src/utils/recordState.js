// Where a record stood before a board or panel write, and the update body that
// puts it back. Both surfaces offer Undo through the ordinary update path, so
// they share one definition of "back".

export function snapshotOf(app) {
    if (!app) return null;
    return {
        stage: app.stage,
        state: app.state,
        close_reason: app.close_reason ?? null,
    };
}

export function restoreBody(snapshot) {
    return snapshot.state === "closed"
        ? {
              stage: snapshot.stage,
              state: "closed",
              close_reason: snapshot.close_reason,
          }
        : { stage: snapshot.stage, state: "open" };
}
