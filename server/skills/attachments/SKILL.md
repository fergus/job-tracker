---
name: attachments
description: Add and remove files on a job application in the job tracker. Use when the user wants to attach, upload or save a file such as a CV, resume or cover letter to a role, or to delete or remove an attached file.
---

# Job tracker attachments

Find the role first with `list_applications`. Allowed file types are `.pdf`, `.doc`, `.docx`, `.md` and `.txt`, up to 10 MB.

## Adding a file

**A file on disk: use `get_upload_url`, then curl, whatever the file's size.** The `upload_attachment` description chooses by size alone; do not follow it for a file on disk. Sending a file as base64 text means reproducing every byte by hand, and one slip corrupts the file.

1. Call `get_upload_url` with the `application_id` and the `filename`, including its extension.
2. Run the curl command it returns, pointed at the real file path. It is an HTTP PUT with the multipart field `file`.
3. On success the response is the new attachment record; otherwise it is an error message. Check that the record's `file_size` matches the file on disk.

Each URL works once and lasts 15 minutes. If an upload fails, get a new URL.

Use `upload_attachment` only when no HTTP upload can run, for example when there is no shell or the upload address cannot be reached.

## Removing a file

1. Call `list_attachments` to get the attachment ID. Filenames can repeat, so compare size and upload time. If it is not clear which file the user means, ask.
2. Call `delete_attachment`.

The delete is **permanent**. The server shows the user the exact file and asks them to confirm, so leave the confirmation to that prompt: do not ask for one of your own, and never answer it for them. If the call reports that nothing was deleted, tell the user and do not try again unless they ask.

A client that cannot show the prompt is refused. The user can then delete the file in the job tracker web app.
