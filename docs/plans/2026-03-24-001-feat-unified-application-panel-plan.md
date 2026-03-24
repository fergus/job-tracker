---
title: Unified Application Slide-Over Panel
type: feat
status: complete
date: 2026-03-24
---

# feat: Unified Application Slide-Over Panel

## Overview

Replace the two-modal system (`ApplicationForm.vue` + `ApplicationDetail.vue`) with a single integrated slide-over panel (`ApplicationPanel.vue`) that handles creating, editing, and managing job applications. The panel slides in from the right on desktop and slides up as a bottom sheet on mobile, leaving the main content visible rather than blocking it entirely.

## Problem Statement

The current UI has three UX problems:

1. **Split experience**: Creating an application uses one modal; viewing/editing it uses a different one. They have different fields (create shows status + file uploads; edit shows fewer fields), which is confusing.
2. **Bounce on edit**: Clicking "Edit" in the detail modal closes it and reopens the form modal — a jarring close-then-reopen animation with no continuity.
3. **Mobile feel**: Centered overlay dialogs don't feel native on mobile. A bottom sheet is the expected pattern on phones.

## Proposed Solution

A single `ApplicationPanel.vue` component that:
- Slides in from the right (480px wide) on desktop, overlaying content with a backdrop
- Slides up from the bottom (full-screen sheet, `rounded-t-2xl`) on mobile
- Handles **create mode** (prop: `{}`) and **view/edit mode** (prop: existing app object) in one place
- After creating an application, transitions immediately into view/edit mode without closing
- Consolidates: form fields, status picker, dates, mini timeline, attachments, notes — all in one scrollable panel

## Technical Approach

### Animation Pattern

Copy the `SidebarMenu.vue` pattern exactly (`SidebarMenu.vue:117–125`):

```js
const visible = ref(false)
onMounted(() => {
  drawerRoot.value?.focus()
  requestAnimationFrame(() => { visible.value = true })
})
```

Entry: `translate-x-full` → `translate-x-0` (desktop) / `translate-y-full` → `translate-y-0` (mobile)
Transition: `transition-transform duration-300 ease-in-out`

**Exit animation (new — doesn't exist in current codebase):**
```js
function close() {
  visible.value = false
  setTimeout(() => emit('close'), 300)
}
```
This defers unmounting until the CSS transition completes.

### Panel Layout

```
┌──────────────────────────────────────────────────────┐
│ STICKY HEADER                                        │
│  [Company Name input]  [Role Title input]   [✕]     │
├──────────────────────────────────────────────────────┤
│ STICKY STATUS BAR                                    │
│  [interested] [applied] [screening] [interview]      │
│  [offer] [accepted] [rejected]                       │
├──────────────────────────────────────────────────────┤
│ SCROLLABLE BODY                                      │
│  Core fields: job_posting_url, company_website_url,  │
│               salary_min/max, job_location           │
│  Job description textarea (collapsible)              │
│  ── (view/edit mode only) ──────────────────────     │
│  Dates grid (3-col, same as ApplicationDetail)       │
│  Mini timeline                                       │
│  Attachments (generic API)                           │
│  Notes (with markdown rendering)                     │
├──────────────────────────────────────────────────────┤
│ STICKY FOOTER                                        │
│  [Delete (red, left)]          [Save Changes (right)]│
│  Create mode: [Cancel]         [Create Application]  │
└──────────────────────────────────────────────────────┘
```

### Responsive CSS

```html
<!-- Desktop: right-side drawer -->
<!-- Mobile: bottom sheet -->
<div
  class="absolute
         md:inset-y-0 md:right-0 md:w-[480px] md:rounded-none
         inset-x-0 bottom-0 h-[92vh] rounded-t-2xl
         bg-white flex flex-col shadow-xl
         transition-transform duration-300 ease-in-out"
  :class="visible
    ? 'translate-y-0 md:translate-x-0'
    : 'translate-y-full md:translate-y-0 md:translate-x-full'"
>
```

Mobile drag handle: a centered `w-8 h-1 bg-gray-300 rounded-full` pill at the top of the panel.

### Save Behaviour

| Field type | When saved |
|---|---|
| Status | Immediately on pill click — `updateStatus(id, status)` |
| Dates | Immediately on change — `updateDates(id, {key: value})` |
| Text fields (company, role, URLs, salary, desc, location) | On "Save Changes" — `updateApplication(id, data)` |
| Attachments | Immediately on file select — `uploadAttachments(appId, files)` |
| Notes | On submit (Ctrl+Enter or button); pending note auto-submitted on close |

Track dirty state: `isDirty` computed comparing `form` reactive object to `panelApp` prop. Show `confirm()` on close if dirty.

### Attachments: Migrate to Generic API

Drop the legacy CV/cover-letter UI slots. Use the generic API already in `api.js` (currently unused in the frontend):

- `fetchAttachments(appId)` — load on panel open (edit/view mode)
- `uploadAttachments(appId, files)` — field name `'files'`, multi-file
- `getAttachmentUrl(appId, attachmentId)` — download link
- `deleteAttachment(appId, attachmentId)` — delete button

**Note:** `cv_filename` and `cover_letter_filename` still exist on the application object and are read by `KanbanCard.vue:12–13` for the file indicator icons (📎📄). These columns remain untouched on the server — the icons will continue to work for legacy uploads. New uploads via the generic API won't set those columns, so new attachments won't show icons on cards. This is acceptable for now (a follow-up card icon update can use `attachments.length > 0`).

**Create mode queued uploads:** In create mode, collect selected files in a local `queuedFiles` array. After `createApplication()` resolves with the new app's full row (`server/routes/applications.js:209` returns the full row), upload queued files with `uploadAttachments(newApp.id, queuedFiles)`.

### Notes Section

Port verbatim from `ApplicationDetail.vue:121–183`:
- Stage `<select>`, `<textarea>` with `@keydown.ctrl.enter` / `@keydown.meta.enter`, Add button
- `sortedNotes` computed (newest-first)
- View mode: `v-html="renderMarkdown(note.content)"` using `marked.parse()` + `DOMPurify.sanitize()`
- Edit mode: `<textarea>` focused via `nextTick`
- **Auto-save pending note on close** (from `ApplicationDetail.vue:395–401`): if `newNoteContent` is non-empty when the panel closes, call `addNote()` first

### Mini Timeline

Port from `ApplicationDetail.vue:61–78`. Import directly from `utils/timeline.js`:
- `computeSegments(application, now)` — builds segment array
- `stageColor(stage)` — hex color per stage
- `durationDays(start, end)` — duration in days

### Prose CSS (Markdown Styles)

Port the 13-rule `<style scoped>` block verbatim from `ApplicationDetail.vue:442–455`. These `:deep()` selectors on `.prose` are required for note markdown to render correctly.

### App.vue State Changes

**Remove:**
```js
const showForm = ref(false)
const showDetail = ref(false)
const editingApp = ref(null)
const selectedApp = ref(null)
// Functions: openForm, openDetail, handleEdit, handleFileUploaded,
//            handleNotesChanged, handleDatesChanged
```

**Add:**
```js
const panelApp = ref(null)  // null = closed, {} = create mode, app object = view/edit

function openPanel(app = null) {
  showSidebar.value = false        // close hamburger if open
  panelApp.value = app ?? {}
}

function closePanel() {
  panelApp.value = null
}

async function handlePanelSaved() {
  await loadApplications()
  // Re-sync if viewing an existing app (keeps panel up to date)
  if (panelApp.value?.id) {
    panelApp.value = applications.value.find(a => a.id === panelApp.value.id) ?? null
  }
}
```

**Body scroll lock** — extend existing watch to cover the panel on mobile:
```js
watch([showSidebar, panelApp], ([sidebar, panel]) => {
  const lock = sidebar || (panel !== null && window.innerWidth < 768)
  document.body.style.overflow = lock ? 'hidden' : ''
})
```

**Template — remove both old modals, add panel:**
```html
<ApplicationPanel
  v-if="panelApp !== null"
  :panelApp="panelApp"
  @close="closePanel"
  @saved="handlePanelSaved"
  @panel-app-updated="panelApp = $event"
/>
```

`@panel-app-updated` is emitted by the panel after create, passing the new app object so App.vue transitions to view/edit mode.

**Wiring changes:**
- "+ Add Application" button: `openForm()` → `openPanel()`
- KanbanBoard: `@select="openDetail"` → `@select="openPanel"`
- TableView: `@select="openDetail"` → `@select="openPanel"`
- TimelineView: `@open-detail="openDetail"` → `@open-detail="openPanel"` _(note: uses `open-detail`, not `select`)_

**Delete flow:** Panel calls `deleteApplication(id)` internally, then emits `saved` (triggers reload) then calls `close()` (slides out). No separate delete handler needed in App.vue — remove `handleDelete`.

**Status change from Kanban drag-and-drop:** `handleStatusChange(id, status)` in App.vue reloads applications. After reload, if `panelApp.value?.id === id`, update `panelApp.value` from the refreshed list — the same pattern as `handlePanelSaved`.

## System-Wide Impact

- **KanbanCard file icons**: Will continue showing for legacy CV/cover-letter uploads. New generic attachments won't update those columns. Low-priority follow-up to update icons to use `attachments.length`.
- **SidebarMenu z-index**: SidebarMenu is `z-40`; ApplicationPanel should be `z-50`. Opening the panel closes the sidebar via `showSidebar.value = false` in `openPanel`.
- **No test framework**: No test files to update.
- **No linter**: No lint checks to run.

## Files to Modify

| Action | File | Changes |
|---|---|---|
| **Create** | `client/src/components/ApplicationPanel.vue` | New unified panel component |
| **Modify** | `client/src/App.vue` | Collapse 4 refs → 1, remove 6 handlers, update template wiring |
| **Delete** | `client/src/components/ApplicationForm.vue` | Superseded |
| **Delete** | `client/src/components/ApplicationDetail.vue` | Superseded |

## Key Reference Points

| What | Where |
|---|---|
| Drawer animation pattern | `SidebarMenu.vue:100–125` |
| Notes section to port | `ApplicationDetail.vue:121–183` |
| Date editing to port | `ApplicationDetail.vue:32–58, 293–322` |
| Mini timeline to port | `ApplicationDetail.vue:61–78, 246–291` |
| Prose CSS to port | `ApplicationDetail.vue:442–455` |
| Timeline utils | `utils/timeline.js` — `computeSegments`, `stageColor`, `durationDays` |
| FormData construction | `ApplicationForm.vue:110–119` |
| Salary empty-string guard | `ApplicationForm.vue` + `CLAUDE.md` note |
| Generic attachments API | `api.js:80–100` |
| App.vue state refs | `App.vue:136–145` |
| App.vue handlers | `App.vue:160–211` |
| TimelineView uses `open-detail` | `TimelineView.vue:76` (not `select`) |

## Acceptance Criteria

- [x] "+ Add Application" opens panel from the right (desktop) / from the bottom (mobile) with smooth animation
- [x] Clicking any card/row in all three views opens the panel for that application
- [x] Create mode: empty form with status pills; on save, panel transitions to view/edit mode showing the new app
- [x] View/edit mode: all fields editable; status pills update immediately; dates update immediately
- [x] "Save Changes" persists text field edits
- [ ] File upload via generic attachments API; files listed with download and delete (implemented, not browser-tested)
- [x] Notes: add, edit, delete, markdown rendering; pending note auto-saved on close (API verified)
- [x] Mini timeline visible in view/edit mode when dates exist
- [x] Closing with unsaved text changes shows `confirm()` dialog
- [x] Panel closes with reverse slide animation (not instant disappear)
- [x] Opening panel closes hamburger sidebar if it was open
- [x] Body scroll locked on mobile when panel is open
- [x] Old `ApplicationForm.vue` and `ApplicationDetail.vue` removed

## Verification Steps

1. `npm run dev:server` + `npm run dev:client`
2. Desktop: click "+ Add Application" → 480px right-side drawer slides in, backdrop closes on click
3. Mobile (DevTools 375px): same button → full-height bottom sheet slides up with rounded top corners and drag handle
4. Create app → panel transitions to view mode with correct data; app appears in Kanban/Table
5. Edit company name → click Save → reload page → change persists
6. Click status pill → change immediately reflected in Kanban board behind panel
7. Upload a file → appears in attachments list; delete button removes it
8. Add a note, add markdown formatting → renders correctly
9. Click a date field → edit inline → change saved immediately
10. Close panel with unsaved text → confirm dialog appears; cancel keeps panel open
11. Close panel → smooth slide-out animation plays before component unmounts
12. Open panel, then open hamburger menu → test both can coexist cleanly
