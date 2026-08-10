---
title: "A reverse-proxy 502 permanently closes EventSource, so a restart looks like a dead session"
date: "2026-08-10"
category: "ui-bugs"
module: "Live Updates"
problem_type: "ui_bug"
component: "frontend_vue"
severity: "high"
symptoms:
  - "Stopping the app container made the board jump straight to the terminal 'LIVE UPDATES STOPPED / Reload' bar, skipping the degraded and stale tiers entirely"
  - "'SYNCED 1 MIN AGO' appeared within seconds of the stream dying, before a minute had elapsed"
root_cause: "logic_error"
resolution_type: "code_fix"
tags:
  - "vue"
  - "sse"
  - "eventsource"
  - "oauth2-proxy"
  - "reconnect"
  - "stale-data"
  - "test-blind-spot"
---

# A reverse-proxy 502 permanently closes EventSource

## Problem

The freshness feature (v0.19.0) derives a staleness tier from the live-update stream: live, degraded at 60s, stale at five minutes, terminal on permanent closure. Terminal shows a `--danger` bar whose only action is a full page reload, and is meant for an expired `oauth2-proxy` session — the one case a user genuinely cannot recover from in place.

Stopping the app container produced the terminal bar **instantly**, along with a duration claiming a minute that had not passed. The entire tier ladder — the point of the feature — was unreachable in the most common real failure.

## Symptoms

- `SYNCED 1 MIN AGO` within seconds of the outage.
- The red terminal bar with **Reload** immediately, never the stale bar with **Retry now**.
- Only reproducible against the deployed stack. Every automated test passed.

## Root cause

Two independent defects that happened to surface together.

**1. A 502 is a *permanent* EventSource failure.** `oauth2-proxy` stays up when the app container stops, so `GET /api/events` returns 502 rather than dropping the connection. Per the SSE spec, any non-200 status or non-`text/event-stream` content type is fatal: the browser sets `readyState = CLOSED` and **does not retry**. The composable read that as `markPermanentlyClosed`:

```js
state = stream.readyState === READY_STATE_CLOSED
    ? markPermanentlyClosed(state, now())
    : markDisconnected(state, now());
```

An expired session and a restarting backend are **indistinguishable at this layer** — both are "the browser gave up". Treating that as terminal collapsed a recoverable outage into the unrecoverable state.

**2. A minutes floor that assumed a 60-second precondition.**

```js
// Whole minutes only (KD4). Anything past just-now is at least 1 min.
const minutes = Math.max(1, Math.floor(elapsedMs / MINUTE_MS));
```

The comment states the assumption: the duration only renders in the degraded tier, which requires 60s elapsed. But **terminal is entered immediately, with no elapsed-time precondition**. Once defect 1 made terminal reachable at t=0, the floor asserted a minute that had not passed.

## What didn't work

- **Eight review personas, plus an independent cross-model (Codex) pass.** None modelled a reverse proxy in the failure path.
- **145 automated tests.** Every client test injects a fake `EventSource` where the test chooses `readyState`. No test had ever seen a real 502.
- **Two tests actively asserted the bug**, one named `formatFreshness rounds any sub-minute non-just-now value up to 1 min`. They passed, and they locked the defect in.

## Solution

**Reopen the stream ourselves; reserve terminal for genuine unrecoverability.**

```js
stream.onerror = () => {
    if (source !== stream) return;          // a replaced stream must not write state
    state = markDisconnected(state, now());
    const result = refresh();
    if (stream.readyState !== READY_STATE_CLOSED) return;

    if (result.tier === TIER_STALE) {       // stale AND still failing -> reload is honest
        state = markPermanentlyClosed(state, now());
        refresh();
        return;
    }
    reopenPending = true;                   // otherwise retry ourselves
};
```

The existing 60-second display interval drives the reopen, so its cadence doubles as backoff — no retry storm against a server that is still down.

And never claim an unelapsed minute:

```js
if (elapsedMs < MINUTE_MS) return "SYNCED JUST NOW";
const minutes = Math.floor(elapsedMs / MINUTE_MS);
```

## Why this works

An ordinary outage now walks the ladder (silent → `SYNCED n MIN AGO` → **Retry now** bar), because we retry where the browser refuses to. A dead session still reaches terminal — reopens keep failing, the board goes stale, and *then* reload is offered, which is correct because reload is the actual fix.

## Prevention

- **A reverse proxy changes the failure mode of everything behind it.** A stopped backend behind a healthy proxy is an HTTP *error response*, not a dropped connection. Reason about the proxy's response, not the origin's absence.
- **`EventSource` auto-retry is narrower than it looks.** It retries a dropped connection; it gives up permanently on any non-200 / wrong-content-type response. Long-lived streams behind a proxy need their own reconnect.
- **A test that fabricates a protocol state proves your handler, not the protocol.** Fakes that let the test choose `readyState` cannot tell you which `readyState` reality produces. Where a fake defines the input, at least one manual run against the real stack is the only thing that closes the gap.
- **Encode the *reason* in the assertion name, not the behaviour.** `rounds any sub-minute value up to 1 min` describes what the code did; it cannot fail when the code is wrong. `never claims a minute that has not elapsed` states the invariant, and would have failed on day one.
- **Watch for assumption-carrying comments.** `// Anything past just-now is at least 1 min` was true when written and silently false once another tier reached the same code. A comment asserting a precondition is a place to check whether the precondition still holds.

## Related

- Fixed in v0.19.1 (`4710d8e`); introduced in v0.19.0 (PR #5).
- Plan: `docs/plans/2026-08-08-001-feat-live-refresh-connection-feedback-plan.md`
- Outstanding items from the same feature: `docs/residual-review-findings/feat-live-refresh-connection-feedback.md`
