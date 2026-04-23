---
status: open
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
- Accepts an `application_id` and a file (path or base64 content)
- POSTs to `POST /api/applications/:id/attachments` (multipart/form-data)
- Returns the created attachment metadata

## Notes

- The REST endpoint already exists (`server/routes/applications.js`) — this is purely an MCP tool addition
- Check how existing MCP tools are structured before adding (likely in `server/mcp.js` or similar)
- File input: accepting a local file path is simpler than base64 for CLI use cases
