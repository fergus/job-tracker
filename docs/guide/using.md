# Using Job Tracker

- **Today** — the home screen: everything you owe in the next seven days across roles, leads and people, grouped Overdue / Today / This week (see [Today and follow-ups](#today-and-follow-ups))
- **Kanban board** (Pipeline) — drag cards between columns: Interested → Applied → Responded → Interview (offers sit here too) → Closed. Each column is headed by its stage colour and a count, and an **In play** rail above the board lists your interviews and offers as one-click chips. Dropping a card on Closed asks for the reason (accepted, rejected, withdrawn and so on), shown on the card; the Closed column can be hidden with the show-closed toggle
- **Timeline view** (Pipeline) — each application's stage history as a bar, switchable from the board with the Board / Timeline toggle
- **People** — recruiters, referrers and hiring managers, grouped by what you owe them; log interactions and set a next action from each person's drawer
- **Search** — find a person or role from any screen (see [Finding a record](#finding-a-record))
- **Settings panel** — manage API keys, choose whether closing a record clears its next step (Follow-ups), and, for admins, toggle between personal and all-users view
- **API keys** — generate personal API keys for programmatic access without the browser OAuth flow; scoped to your account, shown once at creation
- **File attachments** — upload PDF, DOC, DOCX, MD, or TXT files (up to 10MB each) as attachments; CV and cover letter can also be attached directly to an application
- **Salary tracking** — min/max salary range and job location per application
- **Date tracking** — timestamps auto-set when you move applications between stages; all dates are editable
- **Stage notes** — per-stage timestamped notes with markdown rendering and colored stage badges
- **Links** — store job posting and company website URLs
- **Multi-user** — each user sees only their own applications, identified by the email your OIDC provider signs them in with. Admins (configured via `ADMIN_EMAILS`) can view all users' applications but cannot edit or delete others' data

## Finding a record

The search field in the header finds people and roles from any screen. Type part of a name, employer, job title, company, email address or phone number, and pick a result to open it over the screen you are on. **Ctrl+K** (**Cmd+K** on a Mac) jumps to the field, even with a record open. On a phone, tap the magnifier.

- People match on name, employer, role, email and phone. Phone numbers match on digits from three onward, so `0412 345` finds `+61 412 345 678`.
- Roles and leads match on company and job title. Closed records are listed after open ones and marked closed.
- Use the arrow keys and **Enter** to pick a result, and **Escape** to clear and close.
- Search does not cover notes, job descriptions or LinkedIn connections yet.

## Today and follow-ups

The app opens on **Today**, a single list of what you owe this week. **Pipeline** (the board and Timeline) and **People** are one click away in the header.

**What appears on Today.** Every open role or lead, and every person, whose follow-up date falls on or before seven days from today. Rows are grouped **Overdue**, **Today** and **This week**, oldest first, with roles and people mixed together. Each row says what kind it is (Role, Lead or Person) and what to do, for example "Overdue by 2 days: Chase the panel date". A row with a date but no wording reads "Follow up". Anything further out than seven days, or with no date, lives only in Pipeline or People. When nothing is due, Today says so.

**Setting a follow-up on a role.** Open the application, expand **Dates**, and set **Follow up** (the date) and **Next step** (what to do). Each half can be changed or cleared on its own. People have the same pair in their contact drawer.

**Working the list.**
- Click a row to open the role or the person.
- Use **+1d**, **+1w** or the calendar icon to snooze. Snoozing only moves the date: it is not logged as contact and does not count as activity on the record.
- Anything that records what actually happened (a note, a call) goes through the role's panel or the person's drawer.

**Closing a role.** By default, closing a role or lead (from the board, the panel, the API or an agent) clears its next step, and reopening it does not bring the step back. To keep steps instead, turn off **Settings → Follow-ups → Clear the next step when a record closes**. With it off, the step stays on the closed record and returns if you reopen it. Either way, closed records never appear on Today.

A date you add to a role *after* closing it (for example, "re-check this company in six months") is always kept, but Today still lists open records only, so it will not show there.
