---
name: search
description: Find people and roles in the job tracker. Use when the user asks to find, look up or search for a contact (a recruiter, referrer or hiring manager), or a role, job, lead or application by company or job title.
---

# Job tracker search

| Looking for | Tool | Search with |
|---|---|---|
| A person (contact) | `list_contacts` | `query`: part of a name, employer or role |
| A role (application or lead) | `list_applications` | `query`: part of a company name or role title |

When it is unclear whether the user means a person or a role, as with a bare company name, run both.

`query` matches one run of text, in order. It ignores letter case for A-Z only: accented and other non-English letters must match the stored case. If a longer phrase finds nothing, retry with one distinctive word before saying there is no match. If that word has such a letter, also try it in the other case, or search a part of the name without it.

## Roles

- Results include closed roles. Set `state` to `open` for what is live.
- Results come in pages of 50 by default. When `total` is higher than the number returned, page with `offset` before saying what is or is not there.
- Keep the response small with `fields`, for example `id`, `company_name`, `role_title`, `stage` and `state`.
- For one role's full detail, call `get_application` with its ID.

## People

`query` does not search email or phone. To find someone by either, call `list_contacts` without `query` and compare the `email` and `phone` fields (ignore spacing and country-code differences in numbers) before saying there is no match.

For one person's detail, including the roles they are linked to, call `get_contact` with their ID.
