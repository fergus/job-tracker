"use strict";

// The 2026-07-28 side of the server, driven by the official v2 client: tools,
// authentication, per-user scoping, the published skills and shutdown.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const uploads = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-skills-"));
process.env.UPLOADS_DIR = uploads;
process.env.DB_PATH = ":memory:";
process.env.RATE_LIMIT_API = "100000";
process.env.RATE_LIMIT_MCP = "100000";

const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const supertest = require("supertest");
const {
    Client,
    StreamableHTTPClientTransport,
} = require("@modelcontextprotocol/client");
const { SkillsClient } = require("@modelcontextprotocol/client/ext/skills");

// Stands in for a slow tool call. Replaced before mcp.js binds the function.
const fetchJd = require("../services/fetch-jd");
let fetchStarted;
fetchJd.fetchJobDescription = async () => {
    fetchStarted();
    await new Promise((resolve) => setTimeout(resolve, 500));
    throw new fetchJd.FetchError("the slow fetch finished");
};

const app = require("../app");
const { startMcpServer, loadSkillCatalog } = require("../mcp");

const req = supertest(app);
const REVISION = "2026-07-28";
const SKILLS = ["actions", "attachments", "notes", "search"];

let server;
let url;
let keys;

async function apiKeyFor(email) {
    const res = await req
        .post("/api/keys")
        .set("X-Forwarded-Email", email)
        .send({ label: "skills" });
    assert.equal(res.status, 201);
    return res.body.key;
}

function listening(httpServer) {
    return new Promise((resolve, reject) => {
        httpServer.on("listening", resolve);
        httpServer.on("error", reject);
    });
}

async function connect(apiKey, target = url) {
    const client = new Client(
        { name: "skills-test", version: "1.0" },
        { versionNegotiation: { mode: { pin: REVISION } } },
    );
    const transport = new StreamableHTTPClientTransport(new URL(target), {
        requestInit: { headers: { Authorization: `Bearer ${apiKey}` } },
    });
    await client.connect(transport);
    return client;
}

async function callJson(client, name, args = {}) {
    const result = await client.callTool({ name, arguments: args });
    assert.equal(result.isError, undefined, result.content?.[0]?.text);
    return JSON.parse(result.content[0].text);
}

async function listSkills(client) {
    const listing = await new SkillsClient(client).list();
    return listing.skills;
}

before(async () => {
    keys = {
        a: await apiKeyFor("skills-a@example.com"),
        b: await apiKeyFor("skills-b@example.com"),
    };
    server = startMcpServer(0);
    await listening(server);
    url = `http://127.0.0.1:${server.address().port}/`;
});

after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(uploads, { recursive: true, force: true });
});

describe("mcp on the 2026-07-28 revision", () => {
    test("a client lists the tools and calls one as its own user", async () => {
        const client = await connect(keys.a);
        assert.equal(client.getNegotiatedProtocolVersion(), REVISION);
        const { tools } = await client.listTools();
        assert.ok(tools.some((t) => t.name === "list_applications"));

        const created = await callJson(client, "create_application", {
            company_name: "Modern Co",
            role_title: "Engineer",
        });
        assert.equal(created.company_name, "Modern Co");
        await client.close();
    });

    test("a missing or wrong key is refused", async () => {
        await assert.rejects(connect("jt_not_a_key"));
        const res = await supertest(server)
            .post("/")
            .set("MCP-Protocol-Version", REVISION)
            .set("Mcp-Method", "server/discover")
            .send({ jsonrpc: "2.0", id: 1, method: "server/discover" });
        assert.equal(res.status, 401);
    });

    test("concurrent calls from two users each see only their own records", async () => {
        const [a, b] = await Promise.all([connect(keys.a), connect(keys.b)]);
        await Promise.all([
            callJson(a, "create_application", {
                company_name: "Only A",
                role_title: "Engineer",
            }),
            callJson(b, "create_application", {
                company_name: "Only B",
                role_title: "Engineer",
            }),
        ]);
        const names = async (client) =>
            (await callJson(client, "list_applications")).items.map(
                (item) => item.company_name,
            );
        const [seenByA, seenByB] = await Promise.all([names(a), names(b)]);
        assert.ok(seenByA.includes("Only A") && !seenByA.includes("Only B"));
        assert.deepEqual(seenByB, ["Only B"]);
        await Promise.all([a.close(), b.close()]);
    });
});

describe("mcp skills", () => {
    test("the published skills are listed and readable", async () => {
        const client = await connect(keys.a);
        const skillsClient = new SkillsClient(client);
        assert.equal(skillsClient.supported, true);
        const { skills } = await skillsClient.list();
        assert.deepEqual(
            skills.map((s) => s.frontmatter.name).sort(),
            [...SKILLS].sort(),
        );
        for (const skill of skills) {
            assert.ok(skill.frontmatter.description);
            const file = await skillsClient.read(skill);
            assert.match(JSON.stringify(file), /# Job tracker/);
        }
        await client.close();
    });

    test("every tool a skill names is one the server offers", async () => {
        const client = await connect(keys.a);
        const skillsClient = new SkillsClient(client);
        const offered = (await client.listTools()).tools.map((t) => t.name);
        // Backticked words that start like a tool name; argument names such
        // as next_action_at do not.
        const verbs = new Set(offered.map((name) => name.split("_")[0]));
        const { skills } = await skillsClient.list();
        for (const skill of skills) {
            const text = JSON.stringify(await skillsClient.read(skill));
            const named = [...text.matchAll(/`([a-z]+(?:_[a-z]+)+)`/g)]
                .map((match) => match[1])
                .filter((word) => verbs.has(word.split("_")[0]));
            assert.ok(named.length, `${skill.frontmatter.name} names a tool`);
            for (const name of named) {
                assert.ok(
                    offered.includes(name),
                    `${skill.frontmatter.name} names unknown tool ${name}`,
                );
            }
        }
        await client.close();
    });

    test("every user gets the same skills", async () => {
        const [a, b] = await Promise.all([connect(keys.a), connect(keys.b)]);
        assert.deepEqual(await listSkills(a), await listSkills(b));
        await Promise.all([a.close(), b.close()]);
    });

    test("a malformed skill fails the load", async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bad-skill-"));
        fs.mkdirSync(path.join(dir, "broken"));
        fs.writeFileSync(
            path.join(dir, "broken", "SKILL.md"),
            "# no frontmatter\n",
        );
        await assert.rejects(loadSkillCatalog(dir));
        fs.rmSync(dir, { recursive: true, force: true });
    });
});

describe("mcp shutdown", () => {
    test("a call already running when the server closes still gets its result", async () => {
        const other = startMcpServer(0);
        await listening(other);
        const client = await connect(
            keys.a,
            `http://127.0.0.1:${other.address().port}/`,
        );
        await client.listen({ toolsListChanged: true });
        const { id } = await callJson(client, "create_application", {
            company_name: "Slow Co",
            role_title: "Engineer",
            job_posting_url: "https://example.com/job",
        });

        const started = new Promise((resolve) => {
            fetchStarted = resolve;
        });
        const call = client.callTool({
            name: "fetch_job_description",
            arguments: { application_id: id },
        });
        await started;
        const closed = new Promise((resolve) => other.close(resolve));

        const result = await call;
        assert.equal(result.content[0].text, "the slow fetch finished");
        // Within the 10 seconds index.js allows, subscription stream and all
        let timer;
        await Promise.race([
            closed,
            new Promise((_, reject) => {
                timer = setTimeout(
                    () => reject(new Error("close did not finish")),
                    8000,
                );
            }),
        ]);
        clearTimeout(timer);
        await client.close();
    });

    test("close finishes promptly while a subscription stream is open", async () => {
        const other = startMcpServer(0);
        await listening(other);
        const client = await connect(
            keys.a,
            `http://127.0.0.1:${other.address().port}/`,
        );
        await client.listen({ toolsListChanged: true });

        const started = Date.now();
        let timer;
        await Promise.race([
            new Promise((resolve) => other.close(resolve)),
            new Promise((_, reject) => {
                timer = setTimeout(
                    () => reject(new Error("close did not finish")),
                    5000,
                );
            }),
        ]);
        clearTimeout(timer);
        assert.ok(Date.now() - started < 5000);
        await client.close();
    });
});
