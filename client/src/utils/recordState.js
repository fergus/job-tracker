// Where a record stood before a board or panel write, and the update body that
// puts it back. Both surfaces offer Undo through the ordinary update path, so
// they share one definition of "back". The follow-up rides along because a
// close clears it by default, and Undo of a close must not lose it.

export function snapshotOf(app) {
    if (!app) return null;
    return {
        stage: app.stage,
        state: app.state,
        close_reason: app.close_reason ?? null,
        next_action_at: app.next_action_at ?? null,
        next_action: app.next_action ?? null,
    };
}

export function restoreBody(snapshot) {
    return snapshot.state === "closed"
        ? {
              stage: snapshot.stage,
              state: "closed",
              close_reason: snapshot.close_reason,
          }
        : {
              stage: snapshot.stage,
              state: "open",
              next_action_at: snapshot.next_action_at ?? null,
              next_action: snapshot.next_action ?? null,
          };
}
