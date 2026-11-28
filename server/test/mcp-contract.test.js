"use strict";

// What an MCP client sees: the tool list, argument shapes, results, errors,
// scoping and auditing, all driven over HTTP. A change here is a change to
// somebody's agent.

const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const uploads = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-contract-"));
process.env.UPLOADS_DIR = uploads;
process.env.DB_PATH = ":memory:";
process.env.RATE_LIMIT_API = "100000";
process.env.RATE_LIMIT_UPLOADS = "100000";
process.env.RATE_LIMIT_MCP = "100000";
// The model client is pointed at a local fake before anything can build it.
process.env.OPENAI_API_KEY = "test-key";

const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const supertest = require("supertest");

const app = require("../app");
const db = require("../db");
const { startMcpServer } = require("../mcp");
const fixture = require("./fixtures/mcp-tools.json");

const req = supertest(app);
const OWNER = "contract-owner@example.com";
const OTHER = "contract-other@example.com";
const GENERATED = "Dear hiring manager, this is generated text.";

let mcpServer;
let fakeModel;
let owner;
let other;

// Only the parts of a JSON Schema that change what a caller may send. Wrapper
// keys are the SDK's own and differ between its versions.
const KEPT = [
    "type",
    "description",
    "enum",
    "minLength",
    "maxLength",
    "minimum",
    "maximum",
    "exclusiveMinimum",
];

function shape(schema) {
    const out = {};
    for (const key of KEPT) {
        if (key in schema) out[key] = schema[key];
    }
    if (schema.items) out.items = shape(schema.items);
    if (schema.anyOf) out.anyOf = schema.anyOf.map(shape);
    return out;
}

function toolShape(tool) {
    const properties = tool.inputSchema.properties ?? {};
    return {
        name: tool.name,
        description: tool.description,
        args: Object.fromEntries(
            Object.keys(properties)
                .sort()
                .map((key) => [key, shape(properties[key])]),
        ),
        required: [...(tool.inputSchema.required ?? [])].sort(),
    };
}

// The one place that knows the 2025-era handshake.
async function connect(apiKey) {
    const mcp = supertest(mcpServer);
    const headers = {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
    };
    const parse = (res) => {
        const dataLine = res.text
            .split("\n")
            .find((line) => line.startsWith("data: "));
        return JSON.parse(dataLine ? dataLine.slice("data: ".length) : res.text);
    };

    const init = await mcp
        .post("/")
        .set(headers)
        .send({
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: {
                protocolVersion: "2025-06-18",
                capabilities: {},
                clientInfo: { name: "contract", version: "1.0" },
            },
        });
    assert.equal(init.status, 200);

    let id = 1;
    const rpc = async (method, params) => {
        const res = await mcp
            .post("/")
            .set(headers)
            .send({ jsonrpc: "2.0", id: ++id, method, params });
        assert.equal(res.status, 200, res.text);
        return parse(res);
    };
    return {
        listTools: async () => (await rpc("tools/list", {})).result.tools,
        call: async (name, args = {}) =>
            (await rpc("tools/call", { name, arguments: args })).result,
    };
}

function ok(result) {
    assert.equal(result.isError, undefined, result.content?.[0]?.text);
    return JSON.parse(result.content[0].text);
}

function failed(result, pattern) {
    assert.equal(result.isError, true, JSON.stringify(result));
    assert.match(result.content[0].text, pattern);
}

function auditActions(email) {
    return db
        .prepare(
            "SELECT action FROM audit_log WHERE user_email = ? AND source = 'mcp' ORDER BY id",
        )
        .all(email)
        .map((row) => row.action);
}

async function apiKeyFor(email) {
    const res = await req
        .post("/api/keys")
        .set("X-Forwarded-Email", email)
        .send({ label: "contract" });
    assert.equal(res.status, 201);
    return res.body.key;
}

before(async () => {
    fakeModel = http.createServer((request, response) => {
        request.resume();
        request.on("end", () => {
            response.setHeader("Content-Type", "application/json");
            response.end(
                JSON.stringify({
                    id: "fake",
                    object: "chat.completion",
                    created: 0,
                    model: "fake",
                    choices: [
                        {
                            index: 0,
                            finish_reason: "stop",
                            message: { role: "assistant", content: GENERATED },
                        },
                    ],
                }),
            );
        });
    });
    await new Promise((resolve) => fakeModel.listen(0, "127.0.0.1", resolve));
    process.env.OPENAI_BASE_URL = `http://127.0.0.1:${fakeModel.address().port}/v1`;

    const ownerKey = await apiKeyFor(OWNER);
    const otherKey = await apiKeyFor(OTHER);

    mcpServer = startMcpServer(0);
    await new Promise((resolve, reject) => {
        mcpServer.on("listening", resolve);
        mcpServer.on("error", reject);
    });
    owner = await connect(ownerKey);
    other = await connect(otherKey);
});

after(async () => {
    await new Promise((resolve) => mcpServer.close(resolve));
    fakeModel.close();
    fs.rmSync(uploads, { recursive: true, force: true });
});

describe("mcp contract", () => {
    test("tools/list matches the recorded tools and argument shapes", async () => {
        const tools = (await owner.listTools()).map(toolShape);
        const byName = (a, b) => a.name.localeCompare(b.name);
        assert.deepEqual(tools.sort(byName), [...fixture].sort(byName));
    });

    test("application, note, attachment and profile tools", async () => {
        const created = ok(
            await owner.call("create_application", {
                company_name: "Contract Co",
                role_title: "Staff Engineer",
            }),
        );
        assert.equal(created.company_name, "Contract Co");
        const id = created.id;

        const listed = ok(
            await owner.call("list_applications", {
                company_name: "contract",
                fields: ["id", "role_title"],
            }),
        );
        assert.deepEqual(listed, {
            total: 1,
            items: [{ id, role_title: "Staff Engineer" }],
        });
        assert.equal(ok(await owner.call("get_application", { id })).id, id);
        assert.equal(
            ok(
                await owner.call("update_application", {
                    id,
                    job_location: "Sydney",
                }),
            ).job_location,
            "Sydney",
        );

        const noted = ok(
            await owner.call("add_note", {
                id,
                stage: "interested",
                content: "first",
            }),
        );
        assert.ok(noted);
        const noteId = db
            .prepare("SELECT id FROM stage_notes WHERE application_id = ?")
            .get(id).id;
        ok(
            await owner.call("update_note", {
                id,
                note_id: noteId,
                content: "second",
            }),
        );
        ok(await owner.call("delete_note", { id, note_id: noteId }));

        const uploaded = ok(
            await owner.call("upload_attachment", {
                application_id: id,
                filename: "cv.txt",
                file_content: Buffer.from("plain cv text").toString("base64"),
            }),
        );
        assert.equal(uploaded[0].file_size, 13);
        assert.equal(ok(await owner.call("list_attachments", { id })).length, 1);
        const text = await owner.call("get_attachment_text", {
            application_id: id,
            attachment_id: uploaded[0].id,
        });
        assert.equal(text.content[0].text, "plain cv text");
        const url = ok(
            await owner.call("get_upload_url", {
                application_id: id,
                filename: "big.pdf",
            }),
        );
        assert.equal(url.method, "PUT");
        assert.match(url.upload_url, /\/upload\//);

        // The one tool that takes no arguments.
        assert.equal(
            ok(await owner.call("get_user_profile")).user_email,
            OWNER,
        );
        assert.equal(
            ok(
                await owner.call("get_application_context", {
                    application_id: id,
                }),
            ).application.id,
            id,
        );
    });

    test("contact, contact note and connection tools", async () => {
        const contact = ok(
            await owner.call("create_contact", { name: "Pat Recruiter" }),
        );
        const target = ok(
            await owner.call("create_application", {
                company_name: "Linked Co",
                role_title: "Lead",
            }),
        );
        assert.equal(
            ok(await owner.call("list_contacts", { query: "pat" })).length,
            1,
        );
        ok(
            await owner.call("link_contact", {
                contact_id: contact.id,
                application_id: target.id,
                relation: "recruiter",
            }),
        );
        ok(
            await owner.call("unlink_contact", {
                contact_id: contact.id,
                application_id: target.id,
            }),
        );
        assert.equal(
            ok(
                await owner.call("update_contact", {
                    id: contact.id,
                    employer: "Agency",
                }),
            ).employer,
            "Agency",
        );
        ok(
            await owner.call("add_contact_note", {
                contact_id: contact.id,
                content: "called",
            }),
        );
        const noteId = db
            .prepare("SELECT id FROM contact_notes WHERE contact_id = ?")
            .get(contact.id).id;
        ok(
            await owner.call("update_contact_note", {
                contact_id: contact.id,
                note_id: noteId,
                content: "emailed",
            }),
        );
        ok(
            await owner.call("delete_contact_note", {
                contact_id: contact.id,
                note_id: noteId,
            }),
        );
        assert.equal(
            ok(await owner.call("get_contact", { id: contact.id })).name,
            "Pat Recruiter",
        );
        ok(await owner.call("delete_contact", { id: contact.id }));

        const imported = await req
            .post("/api/connections/import")
            .set("X-Forwarded-Email", OWNER)
            .set("Content-Type", "text/csv")
            .send(
                "First Name,Last Name,URL,Email Address,Company,Position,Connected On\n" +
                    "Sam,Known,https://www.linkedin.com/in/sam,,Linked Co,Director,01 Jan 2026\n",
            );
        assert.equal(imported.status, 200);
        const connections = ok(
            await owner.call("list_connections", { company: "Linked Co" }),
        );
        assert.equal(connections.total, 1);
        ok(
            await owner.call("promote_connection", {
                connection_id: connections.connections[0].id,
            }),
        );

        const person = ok(
            await owner.call("create_application", {
                company_name: "Actually A Person",
                role_title: "Recruiter",
            }),
        );
        ok(
            await owner.call("convert_application_to_contact", {
                application_id: person.id,
                name: "Converted Person",
            }),
        );
    });

    test("another user's records are not found", async () => {
        const mine = ok(
            await owner.call("create_application", {
                company_name: "Private Co",
                role_title: "Engineer",
            }),
        );
        failed(
            await other.call("get_application", { id: mine.id }),
            /^Error 404: Not found$/,
        );
        failed(
            await other.call("get_upload_url", {
                application_id: mine.id,
                filename: "a.pdf",
            }),
            /^Application not found$/,
        );
    });

    // The wording of a schema failure belongs to the SDK and may change with
    // it. That it fails, names the argument and writes nothing may not.
    test("a schema-invalid argument is an error that writes nothing", async () => {
        const count = () =>
            db.prepare("SELECT COUNT(*) AS n FROM applications").get().n;
        const earlier = count();
        const result = await owner.call("create_application", {
            company_name: 42,
            role_title: "Engineer",
        });
        failed(result, /create_application/);
        assert.match(result.content[0].text, /company_name/);
        assert.equal(count(), earlier);
    });

    test("a legacy status argument fails with the app's message", async () => {
        const result = await owner.call("list_applications", {
            status: "applied",
        });
        failed(result, /^Error 400: /);
        assert.match(
            result.content[0].text,
            /stage, state, close_reason and record_type/,
        );
    });

    test("model-backed tools fail without making a request", async () => {
        const bare = ok(
            await owner.call("create_application", {
                company_name: "Bare Co",
                role_title: "Engineer",
            }),
        );
        failed(
            await owner.call("extract_job_description", {
                application_id: bare.id,
            }),
            /^Job description is empty$/,
        );
        failed(
            await owner.call("fetch_job_description", {
                application_id: bare.id,
            }),
            /^Job posting URL is empty$/,
        );
        failed(
            await owner.call("generate_document", {
                application_id: 999999,
                task: "cover_letter",
            }),
            /^Application not found$/,
        );
    });

    test("generate_document returns the text and its attachment metadata", async () => {
        const target = ok(
            await owner.call("create_application", {
                company_name: "Generate Co",
                role_title: "Engineer",
            }),
        );
        const result = await owner.call("generate_document", {
            application_id: target.id,
            task: "cover_letter",
        });
        assert.equal(result.isError, undefined, result.content?.[0]?.text);
        assert.equal(result.content[0].text, GENERATED);
        assert.equal(result.attachmentMetadata.generation_task, "cover_letter");
        assert.equal(result.attachmentMetadata.file_size, GENERATED.length);
    });

    test("only successful mutating calls are audited", async () => {
        const earlier = auditActions(OWNER).length;
        await owner.call("list_applications");
        await owner.call("get_application", { id: 999999 });
        await owner.call("update_application", {
            id: 999999,
            job_location: "x",
        });
        assert.equal(auditActions(OWNER).length, earlier);
        ok(await owner.call("create_contact", { name: "Audited" }));
        assert.deepEqual(auditActions(OWNER).slice(earlier), [
            "create_contact",
        ]);
    });
});
