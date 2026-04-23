---
status: complete
priority: p2
issue_id: "053"
tags: [performance, memory, bug, client, server]
dependencies: []
---

# Unbounded Memory Caches: markdownCache, upsertCache, and timers

## Summary

Three module-level caches grow without bound. For a long-running server or a
heavily-used client session, these are gradual memory leaks. Two are in the
client; one is in server authentication middleware.

## Issues Found

### 1. `markdownCache` in ApplicationPanel
**File:** `client/src/components/ApplicationPanel.vue:929-936`

```js
const markdownCache = new Map()
function renderMarkdown(content) {
  const key = content || ''
  if (!markdownCache.has(key)) {
    markdownCache.set(key, DOMPurify.sanitize(marked.parse(key)))
  }
  return markdownCache.get(key)
}
```

Every unique note content string is cached forever. A user with many notes, or
notes that contain timestamps / unique IDs, will accumulate entries. There is no
 eviction, no size limit, and no cleanup when the panel unmounts.

**Fix options:**
- Use a size-capped LRU (e.g. `new Map()` with explicit eviction, or a tiny LRU lib)
- Clear the cache when `panelApp.id` changes
- Use a WeakMap keyed by note object (if note objects were stable references)

### 2. `upsertCache` in auth middleware
**File:** `server/middleware/auth.js:30-39`

```js
const upsertCache = new Map()
const UPSERT_TTL_MS = 60_000

function cachedUpsertUser(email) {
  const now = Date.now()
  const last = upsertCache.get(email)
  if (last && now - last < UPSERT_TTL_MS) return
  upsertCache.set(email, now)
  upsertUser.run(email, new Date(now).toISOString(), new Date(now).toISOString())
}
```

Every unique `userEmail` that ever authenticates gets an entry that never expires.
In a multi-user deployment, this Map grows linearly with the user base. For a
public instance, this is a genuine leak.

**Fix:** Evict stale entries on access, or periodically prune:
```js
function cachedUpsertUser(email) {
  const now = Date.now()
  // Prune stale entries occasionally
  if (upsertCache.size > 1000) {
    for (const [k, v] of upsertCache) {
      if (now - v > UPSERT_TTL_MS) upsertCache.delete(k)
    }
  }
  const last = upsertCache.get(email)
  if (last && now - last < UPSERT_TTL_MS) return
  upsertCache.set(email, now)
  upsertUser.run(email, new Date(now).toISOString(), new Date(now).toISOString())
}
```

### 3. `timers` in useToast composable
**File:** `client/src/composables/useToast.js:6`

```js
const timers = {}
```

Timer IDs are stored in a plain object. When a toast is dismissed, the timer is
cleared and deleted, which is correct. However, if the page is never refreshed,
the object survives. More importantly, `timers` is module-scoped but `toasts` is a
`ref()` — if multiple components import `useToast()`, they share the same state.
This is by design, but there is no cleanup on app unmount (relevant for tests or
HMR).

**Severity:** Low — dismissed timers are cleaned up. The main risk is HMR or test
environments where the module is re-evaluated but old timers reference a stale
`toasts` ref.

## Recommended Actions

- [x] Cap `markdownCache` at ~100 entries with LRU eviction in `ApplicationPanel.vue`
- [x] Prune expired entries from `upsertCache` in `auth.js` when size exceeds threshold
- [x] Add `clearAll()` to `useToast` for explicit cleanup

## Acceptance Criteria

- [x] `markdownCache` never exceeds a configured max size; oldest entry evicted on overflow
- [x] `upsertCache` prunes entries older than `UPSERT_TTL_MS` when it grows past 1000 entries
- [x] `useToast` exposes a `clearAll()` function for test cleanup
- [x] Client build passes; server tests pass (58/58)

## Work Log

- 2026-04-23: Created from code-review performance audit
- 2026-04-23: Implemented LRU eviction for markdownCache (100 entries), upsertCache
  pruning at >1000 entries, and `clearAll()` in useToast. Client build and server
  tests pass (58/58).
