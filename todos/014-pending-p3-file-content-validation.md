---
status: pending
priority: p3
issue_id: "014"
tags: [code-review, security]
dependencies: []
---

# Add File Extension Allowlist for SMB Attachments

## Problem Statement
The plan allows "any file type" through the SMB files/ directory, while the web UI restricts to PDF/DOC/DOCX only. Executable files could be uploaded and served to other users.

## Findings
- **Security Sentinel H1:** If the uploads directory is ever served statically, this enables stored XSS or RCE. At minimum, block executable extensions.
- **Pattern Recognition #12:** File extension policy inconsistency between web and SMB uploads.

## Proposed Solutions
### Solution 1: Block executable extensions
Maintain a blocklist of dangerous extensions (.exe, .sh, .bat, .ps1, .js, .php). Allow everything else. Add Content-Disposition: attachment on all download responses.
- **Effort:** Small
- **Risk:** Low

## Acceptance Criteria
- [ ] Executable file extensions blocked on upload
- [ ] Content-Disposition: attachment set on download endpoint
- [ ] Policy documented

## Work Log
- 2026-03-09: Created from technical review (security sentinel, pattern recognition)
