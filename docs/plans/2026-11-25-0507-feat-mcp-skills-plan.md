---
title: MCP Skills - Plan
type: feat
date: 2026-11-25
topic: mcp-skills
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-brainstorm
execution: code
---

# MCP Skills - Plan

## Goal Capsule

- **Objective:** In Claude Code, the user can find people and roles, keep notes, manage attachments and see what needs doing, without having to explain the tracker's rules to Claude.
- **Means:** Move the MCP server to the 2026-07-28 specification and ship four skills from it, with the two tool changes those skills need.
- **Product authority:** The user (fergus). This plan owns skills only. The other areas in How This Work Fits Together are not active scope.
- **Open blockers:** None for planning.

---

## Product Contract

### Summary

The job-tracker MCP server moves to the 2026-07-28 specification and publishes four skills: search, notes, attachments and actions.
It also gains role search by title and a confirmed attachment delete, so each skill has a tool to call.

### Problem Frame

The user works the tracker from Claude Code in the terminal.
The recurring jobs are searching for contacts and roles, creating and updating notes, adding and removing attachments, and listing overdue and pending actions.

Guidance for these jobs lives in tool descriptions and in `AGENTS.md`, and the server offers no task-level playbook.
Two jobs also have gaps in the tools.
Role search matches company name only, so a role cannot be found by its title.
No MCP tool removes an attachment, although the browser can.

Claude Code loads skills from an MCP server only when the server speaks the 2026-07-28 revision.
The current server uses the older stateful transport.

### Key Decisions

- **Skills are the focus of this work.** They were chosen from three agent-experience areas. Governs R3, R4, R5, R6, R7. (session-settled: user-approved — chosen over tasks, confirmation prompts and a foundation-only plan: the tracker's guidance is already written as prose, so skills are where an agent gains most.)
- **Hard cut-over to the new revision.** The only client today is Claude Code in the terminal. Governs R1. (session-settled: user-directed — chosen over serving both revisions, a separate transport plan, and a spike first: one revision is the simplest path.)
- **One skill per recurring job.** Claude loads a skill only when it is needed, so four narrow skills keep unrelated guidance out of context. Governs R3.
- **Add an attachment delete tool.** Governs R9. (session-settled: user-directed — chosen over a skill that only adds files, and over a hide-style delete: removal is one of the recurring jobs.)
- **The server asks for delete confirmation.** The delete is permanent, and the gate has to hold when no skill is loaded. Governs R10. (session-settled: user-approved — chosen over a skill instruction alone and over relying on Claude Code's tool permissions: both can be bypassed.)
- **Role search becomes a query on the existing list tool.** Governs R8. (session-settled: user-approved — chosen over a skill-side workaround and over searching note text: the workaround wastes context and note search is a larger change.)
- **The actions list follows the Today screen.** Governs R7. (session-settled: user-approved — chosen over overdue and due only, and over roles only: it matches what the user already reads.)

### Requirements

**Protocol**

- R1. The MCP server speaks the 2026-07-28 specification and no longer serves the older stateful session transport.
- R2. The 29 existing tools keep their names, arguments, results, API-key authentication and per-user scoping, apart from the addition in R8.

**Skills**

- R3. The server publishes four skills through the MCP Skills extension (`io.modelcontextprotocol/skills`): search, notes, attachments and actions. Every user gets the same four.
- R4. The search skill finds people and roles for one request, using contact search and the role query in R8.
- R5. The notes skill creates and updates notes on roles and contacts. It states how the two update tools differ and that a note delete is a hide with no undo, as set out under "Correcting and withdrawing notes" in `AGENTS.md`.
- R6. The attachments skill adds files, choosing the direct or upload-URL route by file size, and removes them with the tool in R9.
- R7. The actions skill returns one list of overdue, due and next-seven-days actions from open roles and contacts, with the same membership and order as the Today queue (`AGENTS.md`, API Conventions).

**Tool changes**

- R8. `list_applications` accepts a free-text query that partially matches company name or role title.
- R9. A new `delete_attachment` tool permanently removes one attachment from the caller's own record, with the same effect as the browser delete, and is audited.
- R10. Before deleting, the server asks the user to confirm through MCP elicitation, naming the file and the record. Nothing is deleted if the user declines or cancels, or if the client cannot show the prompt.

**Documentation**

- R11. `docs/guide/mcp.md` and `AGENTS.md` describe the new revision, the four skills and the two tool changes.

### Acceptance Examples

- AE1. **Covers R10.** Given an attachment on the user's record, when Claude calls `delete_attachment` and the user declines the prompt, then the file and its record are unchanged.
- AE2. **Covers R10.** Given a client that cannot show an elicitation prompt, when it calls `delete_attachment`, then the call fails and nothing is deleted.
- AE3. **Covers R9.** Given another user's attachment, when the user tries to delete it, then the response is "not found" and does not reveal that it exists.
- AE4. **Covers R4, R8.** Given a role titled "Staff Engineer", when the user asks Claude to find the staff engineer role, then the search returns it although the query does not match the company name.
- AE5. **Covers R7.** Given a contact action due in 5 days, another due in 10 days, and a closed role that still has a re-check date, when the user asks for pending actions, then only the 5-day contact action appears.

### Success Criteria

- In Claude Code in the terminal, all four skills are listed for the job-tracker server.
- Each of the four recurring jobs completes without the user explaining which tool to use or how it behaves.

### Scope Boundaries

- Running slow tools as MCP tasks.
- Confirmation prompts on any tool other than `delete_attachment`.
- The File Uploads extension, MCP Apps, tool annotations and output schemas.
- Per-user or generated skills.
- Search over note text, job descriptions or attachment text.
- Support for clients on the older transport.
- Skills in `claude -p`, the Agent SDK, cloud sessions and GitHub Actions, where Claude Code does not load MCP skills.

<!-- ce-section: work-relationships -->
### How This Work Fits Together

This plan covers MCP skills.
The breakdown below is the current understanding, not a committed roadmap.

- **Tasks for slow tools** (`generate_document`, `fetch_job_description`)
  - Shares the move to the new revision.
  - Still to decide: whether it is worth doing.
- **Confirmation prompts on other irreversible tools**
  - Shares the confirmation mechanism introduced by R10.
  - Still to decide: which tools need it.
- **Wider job-tracker search** (Linear project P-INT-1)
  - Can proceed independently of this plan.
  - Shares role search: R8 is a small agent-search step, and the header search plan (`docs/plans/2026-11-09-0639-feat-header-search-plan.md`) leaves MCP search out of its scope.

### Dependencies / Assumptions

- The only client of the MCP server is Claude Code in the terminal, as stated by the user.
- Claude Code must be v2.1.331 or later. The development machine has 2.1.332.
- MCP skills are a public beta. Claude Code also requires a supported model, a direct connection to Anthropic, and an eligible login. Skills are currently off for API-key and Console logins. The user's login type has not been checked.
- The public `/mcp` URL goes through a reverse proxy outside this repository. It is assumed to pass the new request headers through; this has not been checked.

### Outstanding Questions

**Deferred to Planning**

- Does TypeScript SDK v2 work from this CommonJS server? The migration guide could not be read during the brainstorm.
- Does SDK v2 support the Skills extension? The pages read gave no TypeScript support or version.
- How do SDK v2 and Claude Code handle the confirmation in R10 on the new revision?
- What do the 29 existing tools need in order to meet R2? The audit wrapper around `server.tool` in `server/mcp.js` passes exactly four arguments.
- Can the actions skill meet R7 with the existing list tools? `AGENTS.md` records a deliberate choice to have no separate follow-ups tool.

### Sources / Research

- [MCP 2026-07-28 changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog): removes the `initialize` handshake and sessions, adds `server/discover`, and requires new request headers and result fields.
- [Skills extension overview](https://modelcontextprotocol.io/extensions/skills/overview): skills are resources with a `SKILL.md`, and the server implements `skills/list` and `skills/get`.
- [Claude Code MCP docs](https://code.claude.com/docs/en/mcp): "Use skills from MCP servers" lists version, model, login and surface requirements.
- [MCP servers can now ship skills, run tasks, and more with Claude](https://claude.com/resources/articles/skills-over-mcp-tasks-and-more): the article that framed the candidate areas.
- [TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk): v2 packages implement the new revision. The installed `@modelcontextprotocol/sdk` 1.32.2 is the v1 line.
- `server/mcp.js`: registers tools only. The `sessions` map holds transports, and no tool reads it.
- `server/routes/applications.js`: the browser attachment delete removes the row and the file, writes an audit event and keeps no backup.
- `server/services/audit.js`: tools missing from `READ_ONLY_TOOLS` are audited as changes.
