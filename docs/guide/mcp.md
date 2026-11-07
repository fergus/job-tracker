# MCP server

A Model Context Protocol (MCP) server is included for AI clients to interact with your job applications programmatically. It exposes tools for applications and leads, notes, people, attachments, job descriptions and document generation.

**Endpoint:** wherever your reverse proxy exposes the MCP port (host port `MCP_LISTEN_PORT`, default 3563, served at `/`). The examples below assume `https://your-domain.com/mcp`. See [Ports and reverse proxy](install.md#ports-and-reverse-proxy).

**Authentication:** Bearer API key (generate one in the Settings panel)

**Data:** whatever an agent reads goes to its model provider. When `OPENAI_API_KEY` is set, `extract_job_description` and `generate_document` also call the OpenAI API from your server, and `fetch_job_description` runs the same extraction after fetching. Without the key, fetching still stores the description and the other two tools are unavailable. See [What leaves your server](data-flows.md).

**Tools exposed:**

*Applications and leads*
- `list_applications` — list records with filtering (state, record type, follow-up state), pagination and sparse field sets
- `get_application` — full record, including notes, linked contacts and attachment metadata
- `create_application` — create an application or lead, optionally with a follow-up date (`next_action_at`) and next-step wording (`next_action`)
- `update_application` — update fields, including the follow-up date and wording; closing clears the next step unless you turned that off in Settings
- `convert_application_to_contact` — turn a record that is really a person into a contact (the original is backed up first)

*Stage notes*
- `add_note` — append a stage note, optionally re-dating the follow-up and its wording in the same call
- `update_note` — correct a note (replaces its content; can re-file it under another stage)
- `delete_note` — withdraw a note (hidden, no undo)

*People (contacts)*
- `list_contacts` — list contacts ordered by what is owed soonest
- `get_contact` — one contact with every record they are linked to
- `create_contact` / `update_contact` / `delete_contact` — manage contacts
- `link_contact` / `unlink_contact` — attach or detach a contact from an application or lead
- `add_contact_note` — log an interaction, optionally setting the next action in the same call
- `update_contact_note` / `delete_contact_note` — correct or withdraw a logged interaction

*Attachments*
- `list_attachments` — list an application's attachments (metadata only)
- `get_attachment_text` — extracted plain text from a PDF, DOCX, TXT or MD attachment
- `upload_attachment` — upload a small file (<~30KB) as base64
- `get_upload_url` — one-time pre-signed URL for uploading larger files

*Job descriptions, profile and documents*
- `fetch_job_description` — fetch the description from the posting URL, store it and extract structured data
- `extract_job_description` — extract structured data (skills, responsibilities, salary) from the stored description
- `get_user_profile` — your candidate profile (resume, career narrative, agent instructions)
- `get_application_context` — everything about one application plus your profile, in one call
- `generate_document` — draft a cover letter, resume tailoring tips or an interview prep brief for an application

There is no separate Today tool: `list_applications` with `follow_up_state: ["overdue","due"]` and `state: "open"`, plus `list_contacts` with `next_action_before`, answer the same question.

## Connecting from Claude Code

Add this to your `~/.mcp.json`:

```json
{
  "job-tracker": {
    "type": "http",
    "url": "https://your-domain.com/mcp",
    "headers": {
      "Authorization": "Bearer YOUR_API_KEY"
    }
  }
}
```

Generate `YOUR_API_KEY` from the app's Settings panel → API Keys.

## Connecting from other MCP clients

Any MCP client that supports the Streamable HTTP transport can connect using the same URL and Bearer token.
