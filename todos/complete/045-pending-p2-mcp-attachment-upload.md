---
status: complete
priority: p2
issue_id: "045"
tags: [mcp, api, attachments]
dependencies: []
---

# MCP Server: Add Attachment Upload Tool

## Summary

The MCP server currently has no way to add attachments to an application. Add a tool that lets an MCP client upload a file to an existing application.

## What to build

Add an `upload_attachment` tool to the MCP server that:
- Accepts `application_id` and `file_path` (local absolute path)
- Reads file from disk and calls shared `uploadAttachments` service
- Returns created attachment metadata

## Notes

- Extracted upload logic into `uploadAttachments` service so both REST and MCP share the same code path
- REST route now cleans up temp multer files and returns 400 for multer errors (file type, size)
- MCP tool accepts local file path, reads buffer, and calls service directly

## Work Log

- 2026-04-23: Implemented `uploadAttachments` service, refactored REST route, added
  `upload_attachment` MCP tool. Added attachment upload tests. All 58 tests pass.
