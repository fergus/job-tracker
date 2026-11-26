"use strict";

// delete_attachment removes a file for good, so every refusal is run over HTTP:
// the SDK's own capability and request-state checks are part of the guard.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const uploads = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-delete-"));
process.env.UPLOADS_DIR = uploads;
process.env.DB_PATH = ":memory:";
process.env.RATE_LIMIT_API = "100000";
process.env.RATE_LIMIT_UPLOADS = "100000";
process.env.RATE_LIMIT_MCP = "100000";

const { test, describe, before, after, mock } = require("node:test");
const assert = require("node:assert/strict");
const supertest = require("supertest");
const {
    Client,
    StreamableHTTPClientTransport,
} = require("@modelcontextprotocol/client");

const app = require("../app");
const db = require("../db");
const { startMcpServer } = require("../mcp");

const req = supertest(app);
const MODERN = "2026-07-28";
const LEGACY = "2025-06-18";
const OWNER = "delete-owner@example.com";
const OTHER = "delete-other@example.com";
const CAN_PROMPT = { elicitation: { form: {} } };
const YES = { confirm: { action: "accept", content: { confirm: true } } };

let server;
let url;
const keys = {};

before(async () => {
    for (const email of [OWNER, OTHER]) {
        const res = await req
            .post("/api/keys")
            .set("X-Forwarded-Email", email)
            .send({ label: "delete" });
        assert.equal(res.status, 201);
        keys[email] = res.body.key;
    }
    server = startMcpServer(0);
    await new Promise((resolve, reject) => {
        server.on("listening", resolve);
        server.on("error", reject);
    });
    url = `http://127.0.0.1:${server.address().port}/`;
});

after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(uploads, { recursive: true, force: true });
});

// A role with one attachment per filename, all with their own contents.
async function seed(filenames = ["resume.txt"], email = OWNER) {
    const created = await req
        .post("/api/applications")
        .set("X-Forwarded-Email", email)
        .send({ company_name: "Harbour Bank", role_title: "Staff Engineer" });
    assert.equal(created.status, 201);
    const applicationId = created.body.id;
    const ids = [];
    for (const filename of filenames) {
        const res = await req
            .post(`/api/applications/${applicationId}/attachments`)
            .set("X-Forwarded-Email", email)
            .attach("files", Buffer.from(`contents ${ids.length}`), filename);
        assert.equal(res.status, 201);
        ids.push(res.body[0].id);
    }
    db.prepare("UPDATE applications SET updated_at = ? WHERE id = ?").run(
        "2000-01-01T00:00:00.000Z",
        applicationId,
    );
    const args = (i = 0) => ({
        application_id: applicationId,
        attachment_id: ids[i],
    });
    return { applicationId, ids, args };
}

function row(attachmentId) {
    return db
        .prepare("SELECT * FROM attachments WHERE id = ?")
        .get(attachmentId);
}

function audits(applicationId) {
    return db
        .prepare(
            "SELECT * FROM audit_log WHERE application_id = ? AND action = 'delete_attachment'",
        )
        .all(applicationId);
}

function updatedAt(applicationId) {
    return db
        .prepare("SELECT updated_at FROM applications WHERE id = ?")
        .get(applicationId).updated_at;
}

// Asserts that nothing at all happened to the attachment.
function assertUntouched({ applicationId, ids }) {
    for (const id of ids) {
        const stored = row(id);
        assert.ok(stored, "the row is still there");
        assert.ok(
            fs.existsSync(path.join(uploads, stored.stored_filename)),
            "the file is still there",
        );
    }
    assert.equal(audits(applicationId).length, 0);
    assert.equal(updatedAt(applicationId), "2000-01-01T00:00:00.000Z");
}

// One raw tools/call, so a test controls exactly what the client claims and
// sends back.
async function rpc(email, headers, params) {
    const res = await fetch(url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${keys[email]}`,
            "Content-Type": "application/json",
            Accept: "application/json, text/event-stream",
            ...headers,
        },
        body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: { name: "delete_attachment", ...params },
        }),
        signal: AbortSignal.timeout(5000),
    });
    const body = await res.text();
    const data = /^data: (.*)$/m.exec(body);
    return JSON.parse(data ? data[1] : body);
}

function call(args, { email = OWNER, caps = CAN_PROMPT, ...round } = {}) {
    return rpc(
        email,
        {
            "MCP-Protocol-Version": MODERN,
            "Mcp-Method": "tools/call",
            "Mcp-Name": "delete_attachment",
        },
        {
            arguments: args,
            ...round,
            _meta: {
                "io.modelcontextprotocol/protocolVersion": MODERN,
                "io.modelcontextprotocol/clientInfo": {
                    name: "delete-test",
                    version: "1.0",
                },
                "io.modelcontextprotocol/clientCapabilities": caps,
            },
        },
    );
}

async function ask(args, options) {
    const { result } = await call(args, options);
    assert.equal(result.resultType, "input_required", JSON.stringify(result));
    return {
        message: result.inputRequests.confirm.params.message,
        requestState: result.requestState,
    };
}

function approve(args, requestState, options = {}) {
    return call(args, { requestState, inputResponses: YES, ...options });
}

// Either kind of failure will do; what matters is that it is not a success.
function assertRefused(response) {
    assert.ok(
        response.error || response.result?.isError,
        JSON.stringify(response),
    );
}

function errorText(response) {
    assert.equal(response.result?.isError, true, JSON.stringify(response));
    return response.result.content[0].text;
}

describe("delete_attachment: asking first", () => {
    test("the first call describes the file and changes nothing", async () => {
        const seeded = await seed();
        const { message, requestState } = await ask(seeded.args());
        const stored = row(seeded.ids[0]);
        for (const detail of [
            "resume.txt",
            "Harbour Bank",
            "Staff Engineer",
            `${stored.file_size} bytes`,
            stored.created_at,
            `attachment ID ${seeded.ids[0]}`,
        ]) {
            assert.ok(message.includes(detail), `${detail} in: ${message}`);
        }
        assert.ok(requestState);
        assertUntouched(seeded);
    });

    test("an answer sent without request state only gets a prompt", async () => {
        const seeded = await seed();
        const { result } = await call(seeded.args(), { inputResponses: YES });
        assert.equal(result.resultType, "input_required");
        assertUntouched(seeded);
    });

    test("same-named files are told apart and only the approved one goes", async () => {
        const seeded = await seed(["resume.txt", "resume.txt"]);
        const first = await ask(seeded.args(0));
        const second = await ask(seeded.args(1));
        assert.notEqual(first.message, second.message);

        await approve(seeded.args(1), second.requestState);
        assert.ok(row(seeded.ids[0]));
        assert.equal(row(seeded.ids[1]), undefined);
    });
});

describe("delete_attachment: approved", () => {
    test("it removes the row and file, bumps updated_at and audits once", async () => {
        const seeded = await seed();
        const file = path.join(uploads, row(seeded.ids[0]).stored_filename);
        const { requestState } = await ask(seeded.args());

        const { result } = await approve(seeded.args(), requestState);
        assert.equal(result.isError, undefined, JSON.stringify(result));
        assert.deepEqual(JSON.parse(result.content[0].text), {
            success: true,
            attachment_id: seeded.ids[0],
            filename: "resume.txt",
        });
        assert.equal(row(seeded.ids[0]), undefined);
        assert.equal(fs.existsSync(file), false);
        assert.notEqual(
            updatedAt(seeded.applicationId),
            "2000-01-01T00:00:00.000Z",
        );
        const logged = audits(seeded.applicationId);
        assert.equal(logged.length, 1);
        assert.equal(logged[0].source, "mcp");
        assert.equal(logged[0].user_email, OWNER);
        assert.deepEqual(JSON.parse(logged[0].details), {
            attachment_id: seeded.ids[0],
            filename: "resume.txt",
        });

        const replay = await approve(seeded.args(), requestState);
        assert.match(errorText(replay), /404/);
        assert.equal(audits(seeded.applicationId).length, 1);
    });

    test("the official client completes the prompt round trip", async () => {
        const seeded = await seed();
        const client = new Client(
            { name: "delete-test", version: "1.0" },
            {
                capabilities: CAN_PROMPT,
                versionNegotiation: { mode: { pin: MODERN } },
            },
        );
        client.setRequestHandler("elicitation/create", async () => ({
            action: "accept",
            content: { confirm: true },
        }));
        await client.connect(
            new StreamableHTTPClientTransport(new URL(url), {
                requestInit: {
                    headers: { Authorization: `Bearer ${keys[OWNER]}` },
                },
            }),
        );
        const result = await client.callTool({
            name: "delete_attachment",
            arguments: seeded.args(),
        });
        assert.equal(result.isError, undefined, JSON.stringify(result));
        assert.equal(row(seeded.ids[0]), undefined);
        await client.close();
    });
});

describe("delete_attachment: not approved", () => {
    const answers = {
        decline: { confirm: { action: "decline" } },
        cancel: { confirm: { action: "cancel" } },
        "accept with false": {
            confirm: { action: "accept", content: { confirm: false } },
        },
        "accept with the text true": {
            confirm: { action: "accept", content: { confirm: "true" } },
        },
        "decline that still says true": {
            confirm: { action: "decline", content: { confirm: true } },
        },
        "no answer": undefined,
    };

    for (const [label, inputResponses] of Object.entries(answers)) {
        test(`${label} deletes nothing`, async () => {
            const seeded = await seed();
            const { requestState } = await ask(seeded.args());
            const response = await call(seeded.args(), {
                requestState,
                inputResponses,
            });
            assert.match(errorText(response), /Nothing was deleted/);
            assertUntouched(seeded);
        });
    }
});

describe("delete_attachment: request state", () => {
    test("altered state deletes nothing", async () => {
        const seeded = await seed();
        const { requestState } = await ask(seeded.args());
        const middle = Math.floor(requestState.length / 2);
        const altered =
            requestState.slice(0, middle) +
            (requestState[middle] === "A" ? "B" : "A") +
            requestState.slice(middle + 1);
        assertRefused(await approve(seeded.args(), altered));
        assertUntouched(seeded);
    });

    test("state expires after five minutes", async () => {
        const seeded = await seed();
        const { requestState } = await ask(seeded.args());
        mock.timers.enable({ apis: ["Date"], now: Date.now() + 302_000 });
        try {
            assertRefused(await approve(seeded.args(), requestState));
        } finally {
            mock.timers.reset();
        }
        assertUntouched(seeded);
    });

    test("state is bound to the user who was asked", async () => {
        const seeded = await seed();
        const { requestState } = await ask(seeded.args());
        // Hand the record over, so that ownership and IDs both pass and only
        // the binding stands between the new owner and the delete.
        const setOwner = db.prepare(
            "UPDATE applications SET user_email = ? WHERE id = ?",
        );
        setOwner.run(OTHER, seeded.applicationId);
        assertRefused(
            await approve(seeded.args(), requestState, { email: OTHER }),
        );
        setOwner.run(OWNER, seeded.applicationId);
        assertUntouched(seeded);
    });

    test("state for one attachment cannot delete another", async () => {
        const seeded = await seed(["a.txt", "b.txt"]);
        const { requestState } = await ask(seeded.args(0));
        assertRefused(await approve(seeded.args(1), requestState));
        assertUntouched(seeded);
    });
});

describe("delete_attachment: ownership", () => {
    test("another user's record or attachment is not found and not prompted", async () => {
        const mine = await seed();
        const theirs = await seed(["theirs.txt"], OTHER);

        const theirRecord = await call(theirs.args());
        assert.match(errorText(theirRecord), /404: Not found/);

        const theirFile = await call({
            application_id: mine.applicationId,
            attachment_id: theirs.ids[0],
        });
        assert.match(errorText(theirFile), /404: Attachment not found/);

        const { requestState } = await ask(mine.args());
        assertRefused(
            await approve(mine.args(), requestState, { email: OTHER }),
        );
        assertUntouched(mine);
        assertUntouched(theirs);
    });
});

describe("delete_attachment: clients that cannot be asked", () => {
    test("a new-revision client without elicitation gets an error", async () => {
        const seeded = await seed();
        const response = await call(seeded.args(), { caps: {} });
        assert.equal(response.error?.code, -32021, JSON.stringify(response));
        assertUntouched(seeded);
    });

    for (const [label, capabilities] of [
        ["with", CAN_PROMPT],
        ["without", {}],
    ]) {
        test(`a 2025-era client ${label} elicitation is refused promptly`, async () => {
            const seeded = await seed();
            const response = await rpc(
                OWNER,
                { "MCP-Protocol-Version": LEGACY },
                {
                    arguments: seeded.args(),
                    inputResponses: YES,
                    _meta: { clientCapabilities: capabilities },
                },
            );
            assert.match(errorText(response), /2026-07-28.*Nothing was deleted/s);
            assertUntouched(seeded);
        });
    }
});
