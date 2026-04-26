---
status: open
priority: p2
issue_id: "057"
tags: [ux, application-panel, attachments, recognition]
dependencies: []
---

# Add File-Type Icons to Attachment List

## Problem

The attachment list shows only a filename and a delete button. No visual indicator distinguishes PDF from DOC from TXT. Users can't quickly scan for "my CV" vs "my cover letter" by file type — a recognition-over-recall failure.

## What to build

### 1. File-type icons or colour-coded badges
- Add a small icon next to each filename indicating file type
- PDF = red/orange badge or document icon
- DOC/DOCX = blue badge or Word-style icon  
- TXT/MD = neutral grey badge or text-file icon

### 2. Keep the existing layout
- Filename remains left-aligned and truncated with `truncate`
- Icon sits between filename and delete button, or prefixes the filename
- Delete button stays at the right edge

### 3. Consider file extensions as fallback labels
- If no icon is available, show a small extension badge (`.pdf`, `.docx`)
- This also helps users notice if they uploaded the wrong file type

## Notes

- The server already knows file types from `original_filename` — no backend change needed
- Keep icons monochrome or token-coloured to match the design system
- Avoid adding a heavy icon library for just 3 file types; inline SVGs are sufficient
