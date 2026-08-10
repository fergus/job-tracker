# Residual Review Findings — feat/live-refresh-connection-feedback

Source run: `ce-code-review` run `20260808-043916-8bfe8163`, 8 reviewers, base `eaf2c2b`.
Findings fixed during the run are omitted; everything below is unresolved.

No tracker sink was configured, so these are inlined verbatim — this file is the durable record.

## Reviewer coverage caveat

The adversarial lens ran **in-process, not cross-model**: only the `claude` CLI is installed
locally and that is this host, so no different-provider peer was eligible. Agreement between
`correctness` and `adversarial` is therefore two contexts on the same model family, not
independent cross-model corroboration.

That gap was partly closed after the fact by Codex review on PR #5, which is a different model
family. It independently reproduced the scope-race finding this file originally carried as
residual — that corroboration is why the finding was fixed rather than deferred — and found one
the local roster missed entirely (the open detail panel not being reconciled after a bulk
recovery refetch). Both are now fixed in `a1e0eba`. The lesson worth keeping: the local
same-family roster missed a defect a different family caught on first read.

## Unresolved findings

### P1 — Reconnect refetch storms the shared API rate limit

- **File:** `client/src/composables/useLiveUpdates.js:100`
- **Reviewer:** adversarial (confidence 75, advisory/human)
- Every open after the first triggers a full list refetch. A flapping stream — browser
  auto-retry, the silence-forced reopen, and a user retry can all produce opens — turns that
  into a request burst against the `/api` limiter, which `/api/events` shares. Exhausting the
  budget can push the board into the terminal tier, which only a page reload clears.
- The plan placed reconnect rate-limit tuning in Scope Boundaries, so this boundary is now
  load-bearing rather than incidental.
- **Suggested:** debounce or back off reconnect refetches, and give the stream endpoint a
  separate connection-oriented budget rather than the shared per-request one.

### P2 — A hung refetch permanently disables missed-change recovery

- **File:** `client/src/App.vue:452`
- **Reviewer:** reliability (confidence 75, gated_auto)
- `refetchInFlight` is cleared in `finally`, but the underlying request has no timeout, so a
  hang never settles and the flag latches. Every later reconnect then queues behind a fetch
  that will never finish, and missed-change recovery stops silently.
- **Suggested:** bound the request with a timeout so the hang becomes a rejection the existing
  `catch` already reports.

### P2 — Silence-triggered reopen has no backoff or attempt cap

- **File:** `client/src/composables/useLiveUpdates.js:140`
- **Reviewer:** reliability (confidence 75, gated_auto)
- The forced reopen fires from the recurring tick whenever the silence signal is set. Against a
  server that accepts connections but never pings, that repeats indefinitely with no spacing of
  its own beyond the tick interval.

### P2 — Unhandled identity-call rejection leaves the board with no stream

- **File:** `client/src/App.vue:527`
- **Reviewer:** reliability (confidence 75, manual)
- The mount path awaits the identity call before subscribing. If it rejects, the subscription
  never happens, so no tier ever escalates and the never-connected bar never appears — the
  silent-failure shape this feature exists to remove.

### P2 — Freshness orchestration sits in App.vue

- **File:** `client/src/App.vue:386-513`
- **Reviewer:** maintainability (confidence 75)
- Roughly 130 lines of self-contained freshness/refetch glue accumulated across four authoring
  passes inside a component that also owns panel, kanban and settings state. Extracting it to a
  composable does not disturb the pure modules, which stay pure.

### P3 — Duplicate just-now mechanism

- **File:** `client/src/App.vue:391`
- **Reviewer:** maintainability (confidence 50)
- The machine already produces the just-now string via `markUpdate`; `App.vue` adds a second
  independent hold with its own timer to render the same string after a post-degraded refetch.

### P3 — Keepalive interval accepts any positive value

- **File:** `server/routes/events.js:8`
- **Reviewer:** reliability (confidence 75, gated_auto)
- The env override is unclamped, so a sub-millisecond value turns every connected client into a
  write loop. **Suggested:** clamp to a floor that still admits the test value.

### P3 — Retry reports failure on a timer, not a completion signal

- **File:** `client/src/components/FreshnessBar.vue`
- **Reviewer:** reliability (confidence 50, advisory)
- The control resolves to "failed" after a fixed window rather than on the reopened stream's
  actual outcome, so a slow success is labelled a failure.

## Settled-decision conflict (proceeded and flagged)

**KTD3 — the 60-second display interval.** KTD3 was settled before R13a existed. The silence
branch has no event traffic to drive evaluation, so silence detection actually fires between 90
and 150 seconds rather than at 90. The reconnection branch is unaffected, since its error
handler drives evaluation every few seconds. Implementation proceeded on the settled decision
rather than revising it.

## Disputed finding — not actioned

`project-standards` flagged the new client modules for using semicolons, quoting `AGENTS.md`:
"No semicolons are enforced by style in the Vue/client codebase." The rule is quotable, but the
codebase does not follow it uniformly — `timeline.js` and `closedPartition.js` use semicolons;
`date.js`, `error.js`, `storage.js` and `useToast.js` do not. The new modules matched
`timeline.js`, the pure util they sit beside. This reads as documentation drift in `AGENTS.md`
rather than a code defect; which side to correct is an open decision.

## Testing gaps carried forward

- `App.vue`'s reconnect/drag/in-flight orchestration is not reachable by the unit runner and has
  no coverage; the pure modules beneath it are well covered.
- `FreshnessBar`'s three-state retry machine has no coverage.
- No test drives a stream that opens but never pings across multiple cycles.
- No test covers a scope toggle racing an in-flight refetch.
