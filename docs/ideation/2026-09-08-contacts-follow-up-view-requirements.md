---
title: Contacts Follow-Up View - Requirements Input
type: requirements-input
date: 2026-09-08
topic: contacts-follow-up-view
status: ready-for-brainstorm
---

# Contacts Follow-Up View - Requirements Input

Captured 2026-09-08 in a thought-partner session. This is the input to
`/ce-brainstorm`, not its output: the decisions below are settled, the open
questions are not.

## Problem

Contacts, their interaction history and their next-touch dates all exist and are
all reachable only by opening an application that happens to link to the person.
There is no way to answer "who do I owe a touch this week", and no way to record
a person who is not attached to a role. The query that answers the first
question already exists server-side and has no caller.

## Decisions settled

| # | Decision |
|---|---|
| D1 | A **People view** as a third top-level view beside Kanban and Timeline, on the existing view toggle. |
| D2 | **People only.** Application follow-ups stay with plan `2026-08-12-001-feat-follow-up-date-plan.md`; this view does not become a mixed queue. |
| D3 | **Grouped sections** in one scroll: Overdue / Today / Upcoming / No commitment. Nobody is hidden behind a filter. |
| D4 | **Snooze only** inline - reschedule the next action from the row (+1w, +1m, pick a date). Anything with substance opens the existing `ContactPanel`, which stays the single path for writing history. |
| D5 | A row carries **name + follow-up state** (`overdue by 3 days: send portfolio`) and **last contacted** (`34 days ago` / `Never contacted`). |
| D6 | **Create standalone contacts** from this view, with no application link required. |
| D7 | The No-commitment group **shows elapsed time only** - no staleness threshold, no flag, no nudge. |

## Constraints carried in

Not up for re-decision in the brainstorm.

- Scale is roughly 10-30 contacts against ~191 records (76 applications, 115
  leads). Search overlays, segmentation and enrichment are anti-patterns at this
  size - see `docs/ideation/2026-08-16-contact-records-display-ideation.html`,
  where the verifier cut three ideas on exactly this basis.
- The documented failure mode is abandonment when upkeep becomes a chore. Every
  row-level interaction must justify its cost.
- `AGENTS.md` bans hero metrics: no "12 overdue" stat tile. Urgency reads as
  prose and as ordering.
- Follow-up dates are calendar dates anchored to `INSTANCE_TIMEZONE`, not
  timestamps. `follow_up_state` and `follow_up_days` are derived server-side
  (`server/lib/followup.js`) and must not be recomputed in the client.
- Design context is tactical, forward, sharp; both themes first-class. See
  `PRODUCT.md`.

## Already built - consume, do not rebuild

- `GET /contacts` (`server/routes/contacts.js`, `server/services/contacts.js`)
  supports `next_action_before`, `has_next_action` and `query`; it is already
  ordered owed-first (`ORDER BY (next_action_at IS NULL), date(next_action_at)
  ASC, name ASC`) and returns `follow_up_state`, `follow_up_days` and `links`
  per contact. It has no client caller today.
- `client/src/components/ContactPanel.vue` - detail drawer with next-action
  editing and interaction logging. Currently opened only from
  `ApplicationPanel`.
- `POST /contacts/:id/notes` advances `last_contacted_at` server-side and can
  carry `next_action_at` / `next_action` in the same write.
- `client/src/api.js` already exports `fetchContacts`, `createContact`,
  `updateContact`, `deleteContact`, `linkContact`, `unlinkContact`,
  `addContactNote`.
- Schema: `contacts` (with `last_contacted_at`, `next_action_at`,
  `next_action`), `contact_links`, `contact_notes`, plus
  `idx_contacts_next_action` on `(user_email, next_action_at)`.
- Full MCP contact tool surface: `list_contacts`, `get_contact`,
  `create_contact`, `update_contact`, `delete_contact`, `link_contact`,
  `unlink_contact`, `add_contact_note`, `convert_application_to_contact`.

## Open questions for the brainstorm

1. **Row identifiability.** D5 excludes employer and role, so two people with
   similar names are only distinguishable by opening them. Acceptable at 10-30
   contacts, or does the row need one identifying line? This changes the row
   shape everything else hangs off, so resolve it early.
2. **Person to records navigation.** `linksForContact` already returns company,
   role title, stage and open/closed state per link. Excluded from the row -
   does it stay drawer-only, or does the view offer any path from a person to
   their pipeline footprint?
3. **Does snooze write history?** A reschedule with no note leaves
   `next_action_at` moved and the interaction log silent. Is a bare snooze a
   silent field update, or should it leave a trace?
4. **Empty and steady states.** What the view says with zero contacts, and what
   it says on a good day when nothing is owed.
5. **Mobile.** Grouped sections plus an inline snooze control on a narrow
   screen.
6. **Delete and archive.** `deleteContact` exists with no UI. In or out.
7. **MCP parity.** Whether any new behaviour here needs a matching agent-facing
   surface.

## Prior art in this repo

- `docs/ideation/2026-08-16-contact-records-display-ideation.html` - the
  ideation round that produced the contacts UI direction. Its ideas 1 and 2
  (render the fetched fields, the person page as a rendered join) have since
  shipped as `ContactPanel`. Its idea 3 (put people on the board you already
  read) is the road not taken by D1 and is worth re-reading before the
  brainstorm re-opens it.
- `docs/plans/2026-08-12-001-feat-follow-up-date-plan.md` - follow-up dates for
  applications, requirements-only. D2 keeps the two separate.
