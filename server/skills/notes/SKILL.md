---
name: notes
description: Create, correct or withdraw notes in the job tracker. Use when the user wants to log or add a note on a job application, role or lead, record an interaction with a contact (a call, message or meeting), or fix or delete a note already written.
---

# Job tracker notes

There are two kinds of note, with separate tools.

| About | Add | Correct | Withdraw |
|---|---|---|---|
| A role (application or lead) | `add_note` | `update_note` | `delete_note` |
| A person (contact) | `add_contact_note` | `update_contact_note` | `delete_contact_note` |

Find the record first: `list_applications` for a role, `list_contacts` with `query` for a person. Read it with `get_application` or `get_contact` to get a `note_id`.

## Adding

- A role note needs a `stage`: the stage the note is about.
- A contact note takes `occurred_at` when the interaction was not today.
- When the user says what happens next, set `next_action_at` and `next_action` in the same call. Omit both to leave the current follow-up alone; pass `null` to clear one.
- A contact's `notes` field is a standing description of the person. Log interactions with `add_contact_note` instead.

## Correcting

The two update tools behave differently.

- `update_note` **replaces** the note's content, and `content` is required on every call. To change only the `stage`, read the note first and send its text back unchanged. To add to a note, send the old text plus the addition.
- `update_contact_note` is a patch: an omitted field is left alone. Give at least one of `content` or `occurred_at`. The `content` you send still replaces the old text.

## Withdrawing

`delete_note` and `delete_contact_note` hide the note. It disappears everywhere and **there is no undo**. When a note is wrong rather than unwanted, correct it instead. Withdraw one only when the user asks for that note to be removed, and say that it cannot be brought back.
