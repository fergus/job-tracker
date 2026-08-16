"use strict";
const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const {
    StreamableHTTPServerTransport,
} = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
const { z } = require("zod");
const db = require("./db");
const svc = require("./services/applications");
const contactsSvc = require("./services/contacts");
const { resolveApiKey } = require("./lib/apiKeySecret");
const { uploadsDir } = require("./lib/files");
const { extractStructuredJD } = require("./services/extraction");
const { fetchJobDescription, FetchError } = require("./services/fetch-jd");
const { generateDocument, VALID_TASKS } = require("./services/generation");
const { logAuditEvent, READ_ONLY_TOOLS } = require("./services/audit");
const { createUploadToken } = require("./lib/uploadTokens");
const { emitChange } = require("./lib/events");

// Convert a ServiceError into MCP tool content so the LLM sees the message.
function toolError(err) {
    // The contacts service defines its own ServiceError, so checking only the
    // applications class would rethrow an ordinary 404 or 409 from a contact
    // tool as an unhandled JSON-RPC error instead of an isError result.
    if (err instanceof svc.ServiceError || err instanceof contactsSvc.ServiceError) {
        return {
            content: [
                { type: "text", text: `Error ${err.status}: ${err.message}` },
            ],
            isError: true,
        };
    }
    throw err;
}

function createMcpServer() {
    const server = new McpServer({ name: "job-tracker", version: "1.0.0" });

    // Wrap server.tool to audit mutating tool calls
    const originalTool = server.tool.bind(server);
    server.tool = (name, description, schema, handler) => {
        const isReadOnly = READ_ONLY_TOOLS.has(name);
        return originalTool(name, description, schema, async (args, extra) => {
            const userEmail = extra.authInfo?.clientId;
            let result;
            try {
                result = await handler(args, extra);
            } catch (err) {
                throw err;
            }

            if (!isReadOnly && userEmail && !result?.isError) {
                let applicationId = args.id || args.application_id || null;
                let details = null;

                if (name === "create_application") {
                    try {
                        const parsed = JSON.parse(result.content[0].text);
                        applicationId = parsed.id || null;
                    } catch {
                        // ignore parse errors
                    }
                    details = {
                        company_name: args.company_name,
                        role_title: args.role_title,
                    };
                } else if (name === "update_status") {
                    details = { status: args.status };
                } else if (name === "add_note") {
                    details = { stage: args.stage };
                } else if (name === "upload_attachment") {
                    details = { filename: args.filename };
                } else if (name === "get_upload_url") {
                    details = { filename: args.filename };
                } else if (name === "generate_document") {
                    details = { task: args.task };
                } else if (name === "extract_job_description") {
                    details = {};
                } else if (name === "fetch_job_description") {
                    details = {};
                } else if (name === "update_application") {
                    details = {
                        fields: Object.keys(args).filter((k) => k !== "id"),
                    };
                }

                logAuditEvent({
                    userEmail,
                    action: name,
                    applicationId,
                    source: "mcp",
                    authMethod: "api_key",
                    details,
                });
            }

            return result;
        });
    };

    server.tool(
        "list_applications",
        "List job applications with optional filtering, pagination, and sparse field sets. Use this to locate records by ID, then call get_application(id) to fetch the full detail including job_description, extracted_jd, interview_notes, and prep_work. A record carries stage (how far it got), state (open or closed), close_reason (why it ended), and record_type (application or lead). The legacy `status` field is derived from those and kept only for compatibility -- filter on state and record_type instead, since status collapses every non-acceptance close onto 'rejected'.",
        {
            status: z
                .enum([
                    "interested",
                    "applied",
                    "responded",
                    "interview",
                    "offer",
                    "accepted",
                    "rejected",
                ])
                .optional()
                .describe("Filter by status"),
            company_name: z
                .string()
                .optional()
                .describe("Filter by company name (partial match)"),
            updated_since: z
                .string()
                .optional()
                .describe(
                    "Return only records updated after this ISO 8601 datetime (useful for incremental refresh)",
                ),
            state: z
                .enum(["open", "closed"])
                .optional()
                .describe(
                    "Filter by whether the record is still open. Prefer this over status for 'what is live'.",
                ),
            close_reason: z
                .enum([
                    "accepted",
                    "rejected",
                    "withdrawn",
                    "role_closed",
                    "lapsed",
                    "not_pursued",
                    "unresolved",
                ])
                .optional()
                .describe(
                    "Filter closed records by why they ended. 'unresolved' means the reason is not known.",
                ),
            record_type: z
                .enum(["application", "lead"])
                .optional()
                .describe(
                    "Filter by record kind. A lead is a role identified but never applied to; filter to 'application' for true pipeline counts.",
                ),
            fields: z
                .array(z.string())
                .optional()
                .describe(
                    "Limit which fields are returned per record. Omit to return all fields. Suggested summary preset: [\"id\",\"company_name\",\"role_title\",\"status\",\"job_location\",\"job_posting_url\",\"salary_min\",\"salary_max\",\"interested_at\",\"applied_at\",\"closed_at\",\"updated_at\"]",
                ),
            limit: z
                .number()
                .int()
                .positive()
                .max(200)
                .optional()
                .describe("Maximum number of records to return (default 50, max 200)"),
            offset: z
                .number()
                .int()
                .nonnegative()
                .optional()
                .describe("Number of records to skip for pagination (default 0)"),
        },
        async (args, extra) => {
            const userEmail = extra.authInfo?.clientId;
            if (!userEmail)
                return {
                    content: [{ type: "text", text: "Unauthorized" }],
                    isError: true,
                };
            try {
                const usePagination =
                    args.limit !== undefined || args.offset !== undefined;
                const includeNotes =
                    !args.fields || args.fields.includes("notes");

                // Apply default pagination at the MCP layer so all list_applications
                // calls are bounded. The service only applies SQL LIMIT when limit/offset
                // are explicitly passed.
                const limit = args.limit ?? 50;
                const offset = args.offset ?? 0;

                const result = svc.listApplications(userEmail, {
                    status: args.status,
                    state: args.state,
                    close_reason: args.close_reason,
                    record_type: args.record_type,
                    company_name: args.company_name,
                    updated_since: args.updated_since,
                    limit,
                    offset,
                    includeNotes,
                });

                // result is always {total, items} because we pass limit/offset
                let { total, items } = result;

                if (args.fields) {
                    const fieldSet = new Set(args.fields);
                    items = items.map((app) => {
                        const obj = {};
                        for (const f of fieldSet) {
                            if (f in app) obj[f] = app[f];
                        }
                        return obj;
                    });
                }

                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({ total, items }, null, 2),
                        },
                    ],
                };
            } catch (err) {
                return toolError(err);
            }
        },
    );

    server.tool(
        "get_application",
        "Get a job application by ID, returning the full record including job_description, extracted_jd, interview_notes, prep_work, notes, linked contacts, and attachment metadata. The intended pattern is: call list_applications (with sparse fields) to locate a record, then call get_application to fetch full detail.",
        {
            id: z.number().int().positive().describe("Application ID"),
        },
        async (args, extra) => {
            const userEmail = extra.authInfo?.clientId;
            if (!userEmail)
                return {
                    content: [{ type: "text", text: "Unauthorized" }],
                    isError: true,
                };
            try {
                const result = svc.getApplication(userEmail, args.id);
                return {
                    content: [
                        { type: "text", text: JSON.stringify(result, null, 2) },
                    ],
                };
            } catch (err) {
                return toolError(err);
            }
        },
    );

    server.tool(
        "create_application",
        "Create a new job application.",
        {
            company_name: z.string().min(1).max(200).describe("Company name"),
            role_title: z.string().min(1).max(200).describe("Job title"),
            status: z
                .enum([
                    "interested",
                    "applied",
                    "responded",
                    "interview",
                    "offer",
                    "accepted",
                    "rejected",
                ])
                .optional()
                .describe('Initial status (defaults to "interested")'),
            job_description: z
                .string()
                .max(10000)
                .optional()
                .describe("Job description"),
            job_posting_url: z
                .string()
                .max(2000)
                .optional()
                .describe("URL of the job posting"),
            company_website_url: z
                .string()
                .max(2000)
                .optional()
                .describe("Company website URL"),
            interview_notes: z
                .string()
                .max(10000)
                .optional()
                .describe("Interview notes"),
            prep_work: z
                .string()
                .max(10000)
                .optional()
                .describe("Prep work notes"),
            job_location: z
                .string()
                .max(500)
                .optional()
                .describe("Job location"),
            salary_min: z
                .number()
                .int()
                .nonnegative()
                .optional()
                .nullable()
                .describe("Minimum salary"),
            salary_max: z
                .number()
                .int()
                .nonnegative()
                .optional()
                .nullable()
                .describe("Maximum salary"),
        },
        async (args, extra) => {
            const userEmail = extra.authInfo?.clientId;
            if (!userEmail)
                return {
                    content: [{ type: "text", text: "Unauthorized" }],
                    isError: true,
                };
            try {
                const result = svc.createApplication(userEmail, args);
                return {
                    content: [
                        { type: "text", text: JSON.stringify(result, null, 2) },
                    ],
                };
            } catch (err) {
                return toolError(err);
            }
        },
    );

    server.tool(
        "update_application",
        "Update fields on an existing job application.",
        {
            id: z.number().int().positive().describe("Application ID"),
            company_name: z
                .string()
                .min(1)
                .max(200)
                .optional()
                .describe("Company name"),
            role_title: z
                .string()
                .min(1)
                .max(200)
                .optional()
                .describe("Job title"),
            job_description: z
                .string()
                .max(10000)
                .optional()
                .describe("Job description"),
            job_posting_url: z
                .string()
                .max(2000)
                .optional()
                .describe("URL of the job posting"),
            company_website_url: z
                .string()
                .max(2000)
                .optional()
                .describe("Company website URL"),
            interview_notes: z
                .string()
                .max(10000)
                .optional()
                .describe("Interview notes"),
            prep_work: z
                .string()
                .max(10000)
                .optional()
                .describe("Prep work notes"),
            job_location: z
                .string()
                .max(500)
                .optional()
                .describe("Job location"),
            salary_min: z
                .number()
                .int()
                .nonnegative()
                .optional()
                .nullable()
                .describe("Minimum salary"),
            salary_max: z
                .number()
                .int()
                .nonnegative()
                .optional()
                .nullable()
                .describe("Maximum salary"),
            stage: z
                .enum(["interested", "applied", "responded", "interview", "offer"])
                .optional()
                .describe("How far the record got. Closing does not change it."),
            state: z
                .enum(["open", "closed"])
                .optional()
                .describe(
                    "Whether the record is still open. Closing requires close_reason; reopening clears it.",
                ),
            close_reason: z
                .enum([
                    "accepted",
                    "rejected",
                    "withdrawn",
                    "role_closed",
                    "lapsed",
                    "not_pursued",
                    "unresolved",
                ])
                .optional()
                .describe(
                    "Why the record ended. Only valid on a closed record. Use 'not_pursued' for a role identified but never applied to, not 'rejected'.",
                ),
            record_type: z
                .enum(["application", "lead"])
                .optional()
                .describe("Whether this is a real application or an unpursued lead"),
        },
        async (args, extra) => {
            const userEmail = extra.authInfo?.clientId;
            if (!userEmail)
                return {
                    content: [{ type: "text", text: "Unauthorized" }],
                    isError: true,
                };
            const { id, ...data } = args;
            try {
                const result = svc.updateApplication(userEmail, id, data);
                return {
                    content: [
                        { type: "text", text: JSON.stringify(result, null, 2) },
                    ],
                };
            } catch (err) {
                return toolError(err);
            }
        },
    );

    server.tool(
        "update_status",
        "Change the status of a job application. Automatically sets the corresponding date field.",
        {
            id: z.number().int().positive().describe("Application ID"),
            status: z
                .enum([
                    "interested",
                    "applied",
                    "responded",
                    "interview",
                    "offer",
                    "accepted",
                    "rejected",
                ])
                .describe("New status"),
        },
        async (args, extra) => {
            const userEmail = extra.authInfo?.clientId;
            if (!userEmail)
                return {
                    content: [{ type: "text", text: "Unauthorized" }],
                    isError: true,
                };
            try {
                const result = svc.updateStatus(
                    userEmail,
                    args.id,
                    args.status,
                );
                return {
                    content: [
                        { type: "text", text: JSON.stringify(result, null, 2) },
                    ],
                };
            } catch (err) {
                return toolError(err);
            }
        },
    );

    server.tool(
        "add_note",
        "Add a stage note to a job application.",
        {
            id: z.number().int().positive().describe("Application ID"),
            stage: z
                .enum([
                    "interested",
                    "applied",
                    "responded",
                    "interview",
                    "offer",
                    "accepted",
                    "rejected",
                ])
                .describe("Stage this note applies to"),
            content: z.string().min(1).max(10000).describe("Note content"),
        },
        async (args, extra) => {
            const userEmail = extra.authInfo?.clientId;
            if (!userEmail)
                return {
                    content: [{ type: "text", text: "Unauthorized" }],
                    isError: true,
                };
            try {
                const result = svc.addNote(userEmail, args.id, {
                    stage: args.stage,
                    content: args.content,
                });
                return {
                    content: [
                        { type: "text", text: JSON.stringify(result, null, 2) },
                    ],
                };
            } catch (err) {
                return toolError(err);
            }
        },
    );

    server.tool(
        "list_attachments",
        "List attachments for a job application (filename, size, type — no binary content).",
        {
            id: z.number().int().positive().describe("Application ID"),
        },
        async (args, extra) => {
            const userEmail = extra.authInfo?.clientId;
            if (!userEmail)
                return {
                    content: [{ type: "text", text: "Unauthorized" }],
                    isError: true,
                };
            try {
                const result = svc.listAttachments(userEmail, args.id);
                return {
                    content: [
                        { type: "text", text: JSON.stringify(result, null, 2) },
                    ],
                };
            } catch (err) {
                return toolError(err);
            }
        },
    );

    server.tool(
        "get_attachment_text",
        "Get the extracted plain text from a file attachment (PDF, DOCX, TXT, MD).",
        {
            application_id: z
                .number()
                .int()
                .positive()
                .describe("Application ID"),
            attachment_id: z
                .number()
                .int()
                .positive()
                .describe("Attachment ID"),
        },
        async (args, extra) => {
            const userEmail = extra.authInfo?.clientId;
            if (!userEmail)
                return {
                    content: [{ type: "text", text: "Unauthorized" }],
                    isError: true,
                };
            try {
                const attachment = svc.getAttachment(
                    userEmail,
                    args.application_id,
                    args.attachment_id,
                );
                if (
                    attachment.extracted_text === null ||
                    attachment.extracted_text === undefined
                ) {
                    return {
                        content: [
                            {
                                type: "text",
                                text: "No extracted text available for this attachment",
                            },
                        ],
                        isError: true,
                    };
                }
                return {
                    content: [
                        { type: "text", text: attachment.extracted_text },
                    ],
                };
            } catch (err) {
                return toolError(err);
            }
        },
    );

    server.tool(
        "get_user_profile",
        "Get the candidate profile (resume, career narrative, agent instructions) for the authenticated user.",
        {},
        async (args, extra) => {
            const userEmail = extra.authInfo?.clientId;
            if (!userEmail)
                return {
                    content: [{ type: "text", text: "Unauthorized" }],
                    isError: true,
                };
            try {
                const profile = db
                    .prepare("SELECT * FROM user_profiles WHERE user_email = ?")
                    .get(userEmail);
                if (!profile) {
                    return {
                        content: [{ type: "text", text: "No profile found" }],
                        isError: true,
                    };
                }
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(profile, null, 2),
                        },
                    ],
                };
            } catch (err) {
                return toolError(err);
            }
        },
    );

    server.tool(
        "get_application_context",
        "Get the full context for a job application: application details, notes, attachments with extracted text, and user profile.",
        {
            application_id: z
                .number()
                .int()
                .positive()
                .describe("Application ID"),
        },
        async (args, extra) => {
            const userEmail = extra.authInfo?.clientId;
            if (!userEmail)
                return {
                    content: [{ type: "text", text: "Unauthorized" }],
                    isError: true,
                };
            try {
                const app = db
                    .prepare(
                        "SELECT * FROM applications WHERE id = ? AND user_email = ?",
                    )
                    .get(args.application_id, userEmail);
                if (!app) {
                    return {
                        content: [
                            { type: "text", text: "Application not found" },
                        ],
                        isError: true,
                    };
                }
                const notes = db
                    .prepare(
                        "SELECT * FROM stage_notes WHERE application_id = ? ORDER BY created_at ASC",
                    )
                    .all(args.application_id);
                const attachments = db
                    .prepare(
                        "SELECT id, original_filename, stored_filename, file_size, mime_type, extracted_text, created_at FROM attachments WHERE application_id = ?",
                    )
                    .all(args.application_id);
                const profile = db
                    .prepare("SELECT * FROM user_profiles WHERE user_email = ?")
                    .get(userEmail);

                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(
                                {
                                    application: app,
                                    notes,
                                    attachments,
                                    profile: profile || null,
                                    job_description:
                                        app.job_description || null,
                                },
                                null,
                                2,
                            ),
                        },
                    ],
                };
            } catch (err) {
                return toolError(err);
            }
        },
    );

    server.tool(
        "generate_document",
        "Generate a tailored document (cover letter, resume tailoring tips, or interview prep brief) for a job application.",
        {
            application_id: z
                .number()
                .int()
                .positive()
                .describe("Application ID"),
            task: z.enum(VALID_TASKS).describe("Type of document to generate"),
        },
        async (args, extra) => {
            const userEmail = extra.authInfo?.clientId;
            if (!userEmail)
                return {
                    content: [{ type: "text", text: "Unauthorized" }],
                    isError: true,
                };
            try {
                const app = db
                    .prepare(
                        "SELECT * FROM applications WHERE id = ? AND user_email = ?",
                    )
                    .get(args.application_id, userEmail);
                if (!app) {
                    return {
                        content: [
                            { type: "text", text: "Application not found" },
                        ],
                        isError: true,
                    };
                }

                const notes = db
                    .prepare(
                        "SELECT * FROM stage_notes WHERE application_id = ? ORDER BY created_at ASC",
                    )
                    .all(args.application_id);
                const attachments = db
                    .prepare(
                        "SELECT id, original_filename, stored_filename, file_size, mime_type, extracted_text, created_at FROM attachments WHERE application_id = ?",
                    )
                    .all(args.application_id);
                const profile = db
                    .prepare("SELECT * FROM user_profiles WHERE user_email = ?")
                    .get(userEmail);

                const context = {
                    application: app,
                    notes,
                    attachments,
                    profile: profile || null,
                    job_description: app.job_description || null,
                };

                const generatedText = await generateDocument(
                    context,
                    args.task,
                );

                const now = new Date().toISOString();
                const unique =
                    Date.now() + "-" + Math.round(Math.random() * 1e9);
                const filename = `${args.task}_${unique}.md`;
                const filePath = path.join(uploadsDir, filename);
                fs.writeFileSync(filePath, generatedText, "utf-8");
                const fileSize = fs.statSync(filePath).size;

                const result = db
                    .prepare(
                        "INSERT INTO attachments (application_id, original_filename, stored_filename, file_size, mime_type, generated_by, generation_task) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    )
                    .run(
                        args.application_id,
                        filename,
                        filename,
                        fileSize,
                        "text/markdown",
                        "agent",
                        args.task,
                    );

                db.prepare(
                    "UPDATE applications SET updated_at = ? WHERE id = ?",
                ).run(now, args.application_id);

                const attachment = db
                    .prepare("SELECT * FROM attachments WHERE id = ?")
                    .get(result.lastInsertRowid);

                emitChange(userEmail, "updated", args.application_id);

                return {
                    content: [{ type: "text", text: generatedText }],
                    attachmentMetadata: {
                        id: attachment.id,
                        original_filename: attachment.original_filename,
                        file_size: attachment.file_size,
                        mime_type: attachment.mime_type,
                        generated_by: attachment.generated_by,
                        generation_task: attachment.generation_task,
                        created_at: attachment.created_at,
                    },
                };
            } catch (err) {
                return toolError(err);
            }
        },
    );

    server.tool(
        "upload_attachment",
        "Upload a small file attachment (under ~30KB) to a job application using base64-encoded content. For larger files use get_upload_url instead.",
        {
            application_id: z
                .number()
                .int()
                .positive()
                .describe("Application ID"),
            filename: z
                .string()
                .min(1)
                .describe("Original filename including extension (e.g. cover-letter.pdf)"),
            file_content: z
                .string()
                .min(1)
                .describe("Base64-encoded file content"),
        },
        async (args, extra) => {
            const userEmail = extra.authInfo?.clientId;
            if (!userEmail)
                return {
                    content: [{ type: "text", text: "Unauthorized" }],
                    isError: true,
                };
            try {
                const buffer = Buffer.from(args.file_content, "base64");
                const result = await svc.uploadAttachments(
                    userEmail,
                    args.application_id,
                    [{ originalname: args.filename, buffer }],
                );
                return {
                    content: [
                        { type: "text", text: JSON.stringify(result, null, 2) },
                    ],
                };
            } catch (err) {
                return toolError(err);
            }
        },
    );

    server.tool(
        "get_upload_url",
        "Get a one-time pre-signed upload URL for attaching a file to a job application. Use this for files larger than ~30KB. Returns a URL and curl command — upload the file directly to that URL with HTTP PUT (multipart field name: 'file'). The attachment is linked to the application immediately on successful upload. The URL is valid for 15 minutes.",
        {
            application_id: z
                .number()
                .int()
                .positive()
                .describe("Application ID"),
            filename: z
                .string()
                .min(1)
                .describe(
                    "Original filename including extension (e.g. cover-letter.pdf)",
                ),
        },
        async (args, extra) => {
            const userEmail = extra.authInfo?.clientId;
            if (!userEmail)
                return {
                    content: [{ type: "text", text: "Unauthorized" }],
                    isError: true,
                };
            try {
                const app = db
                    .prepare(
                        "SELECT id FROM applications WHERE id = ? AND user_email = ?",
                    )
                    .get(args.application_id, userEmail);
                if (!app)
                    return {
                        content: [
                            { type: "text", text: "Application not found" },
                        ],
                        isError: true,
                    };

                const token = createUploadToken(
                    userEmail,
                    args.application_id,
                    args.filename,
                );
                const baseUrl = process.env.PUBLIC_URL;
                if (!baseUrl) {
                    console.warn(
                        "[mcp] get_upload_url: PUBLIC_URL not set, returning localhost URL which is unreachable from external clients",
                    );
                }
                const uploadUrl = `${baseUrl || "http://localhost:3000"}/upload/${token}`;

                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(
                                {
                                    upload_url: uploadUrl,
                                    method: "PUT",
                                    field: "file",
                                    expires_in_minutes: 15,
                                    curl_example: `curl -X PUT "${uploadUrl}" -F "file=@/path/to/${args.filename}"`,
                                },
                                null,
                                2,
                            ),
                        },
                    ],
                };
            } catch (err) {
                return toolError(err);
            }
        },
    );

    server.tool(
        "extract_job_description",
        "Extract structured data (skills, responsibilities, salary, etc.) from the existing job description text of an application.",
        {
            application_id: z
                .number()
                .int()
                .positive()
                .describe("Application ID"),
        },
        async (args, extra) => {
            const userEmail = extra.authInfo?.clientId;
            if (!userEmail)
                return {
                    content: [{ type: "text", text: "Unauthorized" }],
                    isError: true,
                };
            try {
                const app = db
                    .prepare(
                        "SELECT * FROM applications WHERE id = ? AND user_email = ?",
                    )
                    .get(args.application_id, userEmail);
                if (!app) {
                    return {
                        content: [
                            { type: "text", text: "Application not found" },
                        ],
                        isError: true,
                    };
                }
                if (!app.job_description || !app.job_description.trim()) {
                    return {
                        content: [
                            { type: "text", text: "Job description is empty" },
                        ],
                        isError: true,
                    };
                }
                const extracted = await extractStructuredJD(
                    app.job_description,
                );
                if (!extracted) {
                    return {
                        content: [
                            {
                                type: "text",
                                text: "Extraction failed. The LLM service may be unavailable.",
                            },
                        ],
                        isError: true,
                    };
                }
                const now = new Date().toISOString();
                db.prepare(
                    "UPDATE applications SET extracted_jd = ?, updated_at = ? WHERE id = ?",
                ).run(JSON.stringify(extracted), now, args.application_id);
                emitChange(userEmail, "updated", args.application_id);
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(extracted, null, 2),
                        },
                    ],
                };
            } catch (err) {
                return toolError(err);
            }
        },
    );

    server.tool(
        "fetch_job_description",
        "Fetch a job description from the job_posting_url, store it on the application, and extract structured data.",
        {
            application_id: z
                .number()
                .int()
                .positive()
                .describe("Application ID"),
        },
        async (args, extra) => {
            const userEmail = extra.authInfo?.clientId;
            if (!userEmail)
                return {
                    content: [{ type: "text", text: "Unauthorized" }],
                    isError: true,
                };
            try {
                const app = db
                    .prepare(
                        "SELECT * FROM applications WHERE id = ? AND user_email = ?",
                    )
                    .get(args.application_id, userEmail);
                if (!app) {
                    return {
                        content: [
                            { type: "text", text: "Application not found" },
                        ],
                        isError: true,
                    };
                }
                if (!app.job_posting_url || !app.job_posting_url.trim()) {
                    return {
                        content: [
                            { type: "text", text: "Job posting URL is empty" },
                        ],
                        isError: true,
                    };
                }
                let text;
                try {
                    text = await fetchJobDescription(app.job_posting_url);
                } catch (fetchErr) {
                    if (fetchErr instanceof FetchError) {
                        return {
                            content: [{ type: "text", text: fetchErr.message }],
                            isError: true,
                        };
                    }
                    throw fetchErr;
                }
                const now = new Date().toISOString();
                db.prepare(
                    "UPDATE applications SET job_description = ?, updated_at = ? WHERE id = ?",
                ).run(text, now, args.application_id);
                const extracted = await extractStructuredJD(text);
                if (extracted) {
                    db.prepare(
                        "UPDATE applications SET extracted_jd = ? WHERE id = ?",
                    ).run(JSON.stringify(extracted), args.application_id);
                }
                emitChange(userEmail, "updated", args.application_id);
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(
                                {
                                    job_description: text,
                                    extracted_jd: extracted,
                                },
                                null,
                                2,
                            ),
                        },
                    ],
                };
            } catch (err) {
                return toolError(err);
            }
        },
    );

    // --- Contacts ---------------------------------------------------------
    //
    // People are first-class records rather than pipeline rows. Before this
    // existed, a recruiter got filed as a job application, which inflated the
    // pipeline and left the referral network unrepresentable.

    server.tool(
        "list_contacts",
        "List contacts (recruiters, referrers, hiring managers) with the records each is linked to, ordered by what is owed soonest. Each carries follow_up_state (overdue | due | upcoming) derived against the instance timezone, so you never recompute it. Use next_action_before to answer \"who do I owe a touch this week\".",
        {
            next_action_before: z
                .string()
                .optional()
                .describe(
                    "Only contacts whose next action falls on or before this calendar date (YYYY-MM-DD).",
                ),
            has_next_action: z
                .boolean()
                .optional()
                .describe("true = only contacts with a next action set; false = only those without."),
            query: z
                .string()
                .optional()
                .describe("Partial match on name, employer or role."),
        },
        async (args, extra) => {
            const userEmail = extra.authInfo?.clientId;
            if (!userEmail)
                return {
                    content: [{ type: "text", text: "Unauthorized" }],
                    isError: true,
                };
            try {
                const result = contactsSvc.listContacts(userEmail, {
                    next_action_before: args.next_action_before,
                    has_next_action: args.has_next_action,
                    query: args.query,
                });
                return {
                    content: [
                        { type: "text", text: JSON.stringify(result, null, 2) },
                    ],
                };
            } catch (err) {
                return toolError(err);
            }
        },
    );

    server.tool(
        "get_contact",
        "Get one contact by ID, including every record they are linked to and the relation each link carries.",
        { id: z.number().int().positive().describe("Contact ID") },
        async (args, extra) => {
            const userEmail = extra.authInfo?.clientId;
            if (!userEmail)
                return {
                    content: [{ type: "text", text: "Unauthorized" }],
                    isError: true,
                };
            try {
                const result = contactsSvc.getContact(userEmail, args.id);
                return {
                    content: [
                        { type: "text", text: JSON.stringify(result, null, 2) },
                    ],
                };
            } catch (err) {
                return toolError(err);
            }
        },
    );

    server.tool(
        "create_contact",
        "Create a contact. A contact can exist with no links, so record a person met before any specific role rather than leaving them in a note body.",
        {
            name: z.string().min(1).max(200).describe("Person's name"),
            contact_role: z
                .string()
                .max(200)
                .optional()
                .describe("Their role, e.g. recruiter or hiring manager"),
            employer: z.string().max(200).optional().describe("Who they work for"),
            email: z.string().max(320).optional().describe("Email address"),
            phone: z.string().max(50).optional().describe("Phone number"),
            notes: z.string().max(10000).optional().describe("Free-text notes"),
        },
        async (args, extra) => {
            const userEmail = extra.authInfo?.clientId;
            if (!userEmail)
                return {
                    content: [{ type: "text", text: "Unauthorized" }],
                    isError: true,
                };
            try {
                const result = contactsSvc.createContact(userEmail, args);
                return {
                    content: [
                        { type: "text", text: JSON.stringify(result, null, 2) },
                    ],
                };
            } catch (err) {
                return toolError(err);
            }
        },
    );

    server.tool(
        "link_contact",
        "Attach a contact to an application or lead, recording their relation to it. Both must belong to you.",
        {
            contact_id: z.number().int().positive().describe("Contact ID"),
            application_id: z
                .number()
                .int()
                .positive()
                .describe("Application or lead ID"),
            relation: z
                .string()
                .max(100)
                .optional()
                .describe("How they relate to this record, e.g. recruiter or referrer"),
        },
        async (args, extra) => {
            const userEmail = extra.authInfo?.clientId;
            if (!userEmail)
                return {
                    content: [{ type: "text", text: "Unauthorized" }],
                    isError: true,
                };
            try {
                const result = contactsSvc.linkContact(
                    userEmail,
                    args.contact_id,
                    args.application_id,
                    args.relation,
                );
                return {
                    content: [
                        { type: "text", text: JSON.stringify(result, null, 2) },
                    ],
                };
            } catch (err) {
                return toolError(err);
            }
        },
    );

    server.tool(
        "update_contact",
        "Update a contact. Patch semantics: omitted fields are left unchanged, and an explicit null clears a field. Use this to enrich a contact created earlier -- notes, employer, email and phone are all correctable after creation.",
        {
            id: z.number().int().positive().describe("Contact ID"),
            name: z.string().min(1).max(200).optional().describe("Person's name"),
            contact_role: z
                .string()
                .max(200)
                .nullable()
                .optional()
                .describe("Their role, e.g. recruiter or hiring manager"),
            employer: z
                .string()
                .max(200)
                .nullable()
                .optional()
                .describe("Who they work for"),
            email: z.string().max(320).nullable().optional().describe("Email address"),
            phone: z.string().max(50).nullable().optional().describe("Phone number"),
            notes: z
                .string()
                .max(10000)
                .nullable()
                .optional()
                .describe("Free-text notes. Replaces the existing notes wholesale."),
        },
        async (args, extra) => {
            const userEmail = extra.authInfo?.clientId;
            if (!userEmail)
                return {
                    content: [{ type: "text", text: "Unauthorized" }],
                    isError: true,
                };
            const { id, ...data } = args;
            try {
                const result = contactsSvc.updateContact(userEmail, id, data);
                return {
                    content: [
                        { type: "text", text: JSON.stringify(result, null, 2) },
                    ],
                };
            } catch (err) {
                return toolError(err);
            }
        },
    );

    server.tool(
        "delete_contact",
        "Delete a contact. Its links to records are removed with it; the records themselves are untouched. There is no undo -- prefer update_contact when the contact is merely wrong rather than unwanted.",
        { id: z.number().int().positive().describe("Contact ID") },
        async (args, extra) => {
            const userEmail = extra.authInfo?.clientId;
            if (!userEmail)
                return {
                    content: [{ type: "text", text: "Unauthorized" }],
                    isError: true,
                };
            try {
                const result = contactsSvc.deleteContact(userEmail, args.id);
                return {
                    content: [
                        { type: "text", text: JSON.stringify(result, null, 2) },
                    ],
                };
            } catch (err) {
                return toolError(err);
            }
        },
    );

    server.tool(
        "unlink_contact",
        "Detach a contact from a record. The inverse of link_contact. To correct a link's relation, unlink then link again with the right value.",
        {
            contact_id: z.number().int().positive().describe("Contact ID"),
            application_id: z
                .number()
                .int()
                .positive()
                .describe("Application or lead ID"),
        },
        async (args, extra) => {
            const userEmail = extra.authInfo?.clientId;
            if (!userEmail)
                return {
                    content: [{ type: "text", text: "Unauthorized" }],
                    isError: true,
                };
            try {
                const result = contactsSvc.unlinkContact(
                    userEmail,
                    args.contact_id,
                    args.application_id,
                );
                return {
                    content: [
                        { type: "text", text: JSON.stringify(result, null, 2) },
                    ],
                };
            } catch (err) {
                return toolError(err);
            }
        },
    );

    server.tool(
        "convert_application_to_contact",
        "Convert a record that is actually a person into a contact, then remove the record. The original row, its notes, attachments and links are written to a backup table first, so the conversion is recoverable by hand. Use this for rows filed as applications that are really recruiters or referrers.",
        {
            application_id: z
                .number()
                .int()
                .positive()
                .describe("The record to convert"),
            name: z
                .string()
                .max(200)
                .optional()
                .describe("Person's name. Defaults to the record's company_name."),
            contact_role: z
                .string()
                .max(200)
                .optional()
                .describe("Their role. Defaults to the record's role_title."),
            employer: z.string().max(200).optional().describe("Who they work for"),
            email: z.string().max(320).optional().describe("Email address"),
            phone: z.string().max(50).optional().describe("Phone number"),
            notes: z
                .string()
                .max(10000)
                .optional()
                .describe("Extra notes. The record's own prose is carried across automatically."),
        },
        async (args, extra) => {
            const userEmail = extra.authInfo?.clientId;
            if (!userEmail)
                return {
                    content: [{ type: "text", text: "Unauthorized" }],
                    isError: true,
                };
            const { application_id, ...data } = args;
            try {
                const result = contactsSvc.convertApplicationToContact(
                    userEmail,
                    application_id,
                    data,
                );
                return {
                    content: [
                        { type: "text", text: JSON.stringify(result, null, 2) },
                    ],
                };
            } catch (err) {
                return toolError(err);
            }
        },
    );

    server.tool(
        "add_contact_note",
        "Log an interaction with a contact -- messaged, replied, meeting held, agreed to follow up. This is the relationship's history; the contact's `notes` field is a standing description, not a log. Logging advances last_contacted_at automatically, so there is no second field to maintain.",
        {
            contact_id: z.number().int().positive().describe("Contact ID"),
            content: z
                .string()
                .min(1)
                .max(10000)
                .describe("What happened, in your own words"),
            occurred_at: z
                .string()
                .optional()
                .describe(
                    "Calendar date the interaction happened (YYYY-MM-DD). Defaults to today in the instance timezone -- set it when writing up something from a few days ago.",
                ),
        },
        async (args, extra) => {
            const userEmail = extra.authInfo?.clientId;
            if (!userEmail)
                return {
                    content: [{ type: "text", text: "Unauthorized" }],
                    isError: true,
                };
            try {
                const result = contactsSvc.addContactNote(userEmail, args.contact_id, {
                    content: args.content,
                    occurred_at: args.occurred_at,
                });
                return {
                    content: [
                        { type: "text", text: JSON.stringify(result, null, 2) },
                    ],
                };
            } catch (err) {
                return toolError(err);
            }
        },
    );

    return server;
}

function startMcpServer(port) {
    if (!process.env.PUBLIC_URL) {
        console.warn(
            "[mcp] WARNING: PUBLIC_URL is not set. get_upload_url will return localhost URLs that are unreachable from MCP clients. Set PUBLIC_URL to the externally-accessible base URL of this server.",
        );
    }

    const app = express();
    app.set("trust proxy", 1);

    // Security headers — MCP is JSON-only, so CSP is disabled.
    app.use(
        helmet({
            contentSecurityPolicy: false,
            crossOriginEmbedderPolicy: false,
        }),
    );

    // Rate limiting — separate bucket from the main API.
    const mcpLimiter = rateLimit({
        windowMs: 60 * 1000,
        max: parseInt(process.env.RATE_LIMIT_MCP ?? "60", 10),
        standardHeaders: true,
        legacyHeaders: false,
    });
    app.use(mcpLimiter);

    // Body size cap — same limit as the main app.
    app.use(express.json({ limit: "100kb" }));

    // Authenticate every request with an API key
    app.use((req, res, next) => {
        const authHeader = req.headers["authorization"];
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({ error: "Missing API key" });
        }
        const userEmail = resolveApiKey(authHeader.slice(7));
        if (!userEmail) {
            return res.status(401).json({ error: "Invalid API key" });
        }
        req.auth = {
            token: authHeader.slice(7),
            clientId: userEmail,
            scopes: [],
        };
        next();
    });

    // Session map: sessionId → StreamableHTTPServerTransport
    const sessions = new Map();

    app.all("/", async (req, res) => {
        try {
            const sessionId = req.headers["mcp-session-id"];

            if (sessionId) {
                // Route to existing session
                const transport = sessions.get(sessionId);
                if (!transport)
                    return res.status(404).json({ error: "Session not found" });
                await transport.handleRequest(req, res, req.body);
            } else if (req.method === "POST") {
                // New session (Initialize handshake) — each session needs its own McpServer
                // because McpServer can only connect to one transport at a time.
                const mcpServer = createMcpServer();
                const transport = new StreamableHTTPServerTransport({
                    sessionIdGenerator: () => randomUUID(),
                    onsessioninitialized: (sid) => sessions.set(sid, transport),
                    onsessionclosed: async (sid) => {
                        sessions.delete(sid);
                        try {
                            await mcpServer.close();
                        } catch {}
                    },
                });
                await mcpServer.connect(transport);
                await transport.handleRequest(req, res, req.body);
            } else {
                res.status(400).json({ error: "No session ID provided" });
            }
        } catch (err) {
            console.error("[mcp] unhandled error:", err);
            if (!res.headersSent)
                res.status(500).json({ error: "Internal server error" });
        }
    });

    const httpServer = app.listen(port, "0.0.0.0", () => {
        console.log(`MCP server running on http://localhost:${port}`);
    });

    return httpServer;
}

module.exports = { startMcpServer, toolError };
