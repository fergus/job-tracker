---
name: actions
description: List what needs doing in the job tracker. Use when the user asks what is overdue, due today, coming up or pending, what their next actions or follow-ups are, who they need to chase, or what is on their Today list.
---

# Job tracker actions

Call `get_today`. It takes no arguments and returns the user's own overdue, due and upcoming actions for open roles and for contacts, in one list. It matches the Today screen, so do not rebuild it from the list tools.

- **Keep the server's order**: oldest date first. Group by `follow_up_state` (`overdue`, `due`, `upcoming`) without re-sorting within a group.
- Use `follow_up_state` and `follow_up_days` as given. The server works them out in its own timezone, so do not recompute them from the date.
- For each item, show the name (`title`), the role or employer (`subtitle`), the `next_action` and the date. `next_action` can be empty when only a date was set.
- `kind` says whether `id` belongs to an application or a contact. For more detail call `get_application` or `get_contact`.
- An empty list means nothing is owed in the next seven days. Say that.

The list stops seven days ahead. Only when the user asks further out, use `list_contacts` with `next_action_before`, and `list_applications` with `follow_up_state` set to `["upcoming"]` and `state` set to `open`.
