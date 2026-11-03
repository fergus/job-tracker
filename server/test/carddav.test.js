"use strict";

process.env.DB_PATH = ":memory:";
process.env.RATE_LIMIT_API = "100000";
process.env.RATE_LIMIT_UPLOADS = "100000";
process.env.RATE_LIMIT_CARDDAV = "100000";
process.env.PUBLIC_URL = "https://jobs.example.com";

const { test, describe, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const supertest = require("supertest");
const app = require("../app");
const db = require("../db");
const contactsSvc = require("../services/contacts");

const req = supertest(app);
const OWNER = "carddav-owner@example.com";
const OTHER = "carddav-other@example.com";

const BOOK = "/carddav/home/contacts/";

async function makeKey(email, scope = "contacts") {
    const res = await req
        .post("/api/keys")
        .set("X-Forwarded-Email", email)
        .send({ label: "phone", scope });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    return res.body;
}

function basic(key, username = "iphone") {
    return "Basic " + Buffer.from(`${username}:${key}`).toString("base64");
}

function dav(method, urlPath, key, { depth, body, username } = {}) {
    let r = req[method.toLowerCase()](urlPath);
    if (key) r = r.set("Authorization", basic(key, username));
    if (depth !== undefined) r = r.set("Depth", String(depth));
    if (body !== undefined) r = r.set("Content-Type", "application/xml").send(body);
    return r;
}

function person(email, over = {}) {
    return contactsSvc.createContact(email, {
        name: "Jane Doe",
        email: "jane@example.com",
        ...over,
    });
}

const PROPFIND_CURRENT_PRINCIPAL = `<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/><d:resourcetype/></d:prop></d:propfind>`;
const PROPFIND_HOME = `<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:carddav"><d:prop><c:addressbook-home-set/></d:prop></d:propfind>`;
const PROPFIND_BOOK = `<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:cs="http://calendarserver.org/ns/"><d:prop><d:resourcetype/><d:displayname/><cs:getctag/><d:supported-report-set/></d:prop></d:propfind>`;
const PROPFIND_ETAGS = `<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:getetag/><d:getcontenttype/></d:prop></d:propfind>`;
const QUERY = `<?xml version="1.0"?><c:addressbook-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:carddav"><d:prop><d:getetag/><c:address-data/></d:prop></c:addressbook-query>`;

function multiget(...hrefs) {
    return `<?xml version="1.0"?><c:addressbook-multiget xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:carddav"><d:prop><d:getetag/><c:address-data/></d:prop>${hrefs
        .map((h) => `<d:href>${h}</d:href>`)
        .join("")}</c:addressbook-multiget>`;
}

beforeEach(() => {
    db.exec("DELETE FROM contact_links");
    db.exec("DELETE FROM contacts");
    db.exec("DELETE FROM api_keys");
});

describe("discovery, replayed the way a phone walks it", () => {
    test("redirects the well-known address without a credential", async () => {
        const res = await req.get("/.well-known/carddav");
        assert.ok([301, 308].includes(res.status), `status ${res.status}`);
        assert.equal(res.headers.location, "/carddav/");
    });

    test("a phone-only key finds the principal, the home, the address book and its cards", async () => {
        const { key } = await makeKey(OWNER);
        const a = person(OWNER, { name: "Jane Doe" });
        const b = person(OWNER, { name: "Phone Only", email: undefined, phone: "0400 000 000" });
        person(OWNER, { name: "Neither", email: undefined });

        const root = await dav("PROPFIND", "/carddav/", key, { depth: 0, body: PROPFIND_CURRENT_PRINCIPAL });
        assert.equal(root.status, 207);
        assert.match(root.text, /current-user-principal/);
        assert.match(root.text, /\/carddav\/principal\//);

        const principal = await dav("PROPFIND", "/carddav/principal/", key, { depth: 0, body: PROPFIND_HOME });
        assert.equal(principal.status, 207);
        assert.match(principal.text, /addressbook-home-set/);
        assert.match(principal.text, /\/carddav\/home\//);

        const book = await dav("PROPFIND", BOOK, key, { depth: 0, body: PROPFIND_BOOK });
        assert.equal(book.status, 207);
        assert.match(book.text, /<[\w:]*addressbook\s*\/>/);
        assert.match(book.text, /getctag>[0-9a-f]{32}</);
        assert.match(book.text, /addressbook-multiget/);

        const listing = await dav("PROPFIND", BOOK, key, { depth: 1, body: PROPFIND_ETAGS });
        assert.equal(listing.status, 207);
        assert.match(listing.text, new RegExp(`${BOOK}${a.id}\\.vcf`));
        assert.match(listing.text, new RegExp(`${BOOK}${b.id}\\.vcf`));
        assert.equal((listing.text.match(/\.vcf</g) || []).length, 2, "the person with no email or phone is absent");
        assert.match(listing.text, /getetag>"[0-9a-f]{32}"</);

        const q = await dav("REPORT", BOOK, key, { depth: 1, body: QUERY });
        assert.equal(q.status, 207);
        assert.match(q.text, /BEGIN:VCARD/);
        assert.match(q.text, /FN:Jane Doe/);

        const mg = await dav("REPORT", BOOK, key, { body: multiget(`${BOOK}${a.id}.vcf`) });
        assert.equal(mg.status, 207);
        assert.match(mg.text, /FN:Jane Doe/);
        assert.doesNotMatch(mg.text, /Phone Only/);

        const card = await dav("GET", `${BOOK}${a.id}.vcf`, key);
        assert.equal(card.status, 200);
        assert.match(card.headers["content-type"], /text\/vcard/);
        assert.match(card.text, /^BEGIN:VCARD/);
        assert.match(card.text, new RegExp(`https://jobs\\.example\\.com/\\?contact=${a.id}`));
        assert.match(card.headers.etag, /^"[0-9a-f]{32}"$/);
    });

    test("a multiget naming three addresses returns exactly those cards", async () => {
        const { key } = await makeKey(OWNER);
        const ids = [1, 2, 3].map((n) => person(OWNER, { name: `P${n} Test`, email: `p${n}@example.com` }).id);
        person(OWNER, { name: "Extra Fourth", email: "x@example.com" });
        const res = await dav("REPORT", BOOK, key, { body: multiget(...ids.map((id) => `${BOOK}${id}.vcf`)) });
        assert.equal(res.status, 207);
        assert.equal((res.text.match(/BEGIN:VCARD/g) || []).length, 3);
        assert.doesNotMatch(res.text, /Extra Fourth/);
    });

    test("the username is ignored", async () => {
        const { key } = await makeKey(OWNER);
        person(OWNER);
        const a = await dav("PROPFIND", BOOK, key, { depth: 1, body: PROPFIND_ETAGS, username: "anything" });
        const b = await dav("PROPFIND", BOOK, key, { depth: 1, body: PROPFIND_ETAGS, username: "someone-else" });
        assert.equal(a.status, 207);
        assert.equal(a.text, b.text);
    });

    test("OPTIONS names the capabilities a contacts client looks for", async () => {
        const res = await req.options("/carddav/");
        assert.equal(res.status, 200);
        assert.match(res.headers.dav, /addressbook/);
        assert.match(res.headers.allow, /PROPFIND/);
    });

    test("an unknown method is 405 with an Allow header", async () => {
        const { key } = await makeKey(OWNER);
        const res = await dav("PATCH", BOOK, key);
        assert.equal(res.status, 405);
        assert.match(res.headers.allow, /PROPFIND/);
    });
});

describe("the address book follows the People list", () => {
    test("clearing a person's last email and phone drops the card and changes the tag", async () => {
        const { key } = await makeKey(OWNER);
        const c = person(OWNER, { name: "Phone Only", email: undefined, phone: "0400 000 000" });
        const before = await dav("PROPFIND", BOOK, key, { depth: 0, body: PROPFIND_BOOK });
        const tag0 = before.text.match(/getctag>([0-9a-f]{32})</)[1];
        assert.equal(
            (await dav("PROPFIND", BOOK, key, { depth: 1, body: PROPFIND_ETAGS })).text.includes(`${c.id}.vcf`),
            true,
        );

        contactsSvc.updateContact(OWNER, c.id, { phone: null });

        const after = await dav("PROPFIND", BOOK, key, { depth: 0, body: PROPFIND_BOOK });
        const tag1 = after.text.match(/getctag>([0-9a-f]{32})</)[1];
        assert.notEqual(tag0, tag1);
        const listing = await dav("PROPFIND", BOOK, key, { depth: 1, body: PROPFIND_ETAGS });
        assert.doesNotMatch(listing.text, new RegExp(`${c.id}\\.vcf`));
        const gone = await dav("GET", `${BOOK}${c.id}.vcf`, key);
        assert.equal(gone.status, 404);
    });
});

describe("the phone cannot change the tracker", () => {
    test("PUT, DELETE and PROPPATCH on a card are refused and change nothing", async () => {
        const { key } = await makeKey(OWNER);
        const c = person(OWNER);
        const href = `${BOOK}${c.id}.vcf`;
        for (const method of ["PUT", "DELETE", "PROPPATCH", "MKCOL", "COPY", "MOVE"]) {
            const res = await dav(method, href, key, {
                body: method === "PUT" ? "BEGIN:VCARD\r\nFN:Hacked\r\nEND:VCARD\r\n" : undefined,
            });
            assert.equal(res.status, 403, method);
        }
        const after = contactsSvc.getContact(OWNER, c.id);
        assert.equal(after.name, "Jane Doe");
    });
});

describe("credentials", () => {
    test("a missing, wrong, full-access or revoked key is a 401 with a Basic challenge", async () => {
        const phone = await makeKey(OWNER);
        const full = await makeKey(OWNER, null);
        person(OWNER);

        const cases = {
            missing: undefined,
            wrong: "not-a-real-key",
            "full-access": full.key,
        };
        for (const [label, key] of Object.entries(cases)) {
            const res = await dav("PROPFIND", "/carddav/", key, { depth: 0, body: PROPFIND_CURRENT_PRINCIPAL });
            assert.equal(res.status, 401, label);
            assert.match(res.headers["www-authenticate"], /^Basic realm=/, label);
        }

        const ok = await dav("PROPFIND", "/carddav/", phone.key, { depth: 0, body: PROPFIND_CURRENT_PRINCIPAL });
        assert.equal(ok.status, 207);

        const del = await req.delete(`/api/keys/${phone.id}`).set("X-Forwarded-Email", OWNER);
        assert.equal(del.status, 204);
        const revoked = await dav("PROPFIND", "/carddav/", phone.key, { depth: 0, body: PROPFIND_CURRENT_PRINCIPAL });
        assert.equal(revoked.status, 401, "revoked");
    });

    test("a card that belongs to another user is not found, and leaks nothing", async () => {
        const mine = await makeKey(OWNER);
        const theirs = person(OTHER, { name: "Secret Person", email: "s@example.com" });
        const href = `${BOOK}${theirs.id}.vcf`;

        const get = await dav("GET", href, mine.key);
        assert.equal(get.status, 404);
        assert.doesNotMatch(get.text, /Secret/);

        const mg = await dav("REPORT", BOOK, mine.key, { body: multiget(href) });
        assert.equal(mg.status, 207);
        assert.match(mg.text, /404/);
        assert.doesNotMatch(mg.text, /Secret Person/);
        assert.doesNotMatch(mg.text, /BEGIN:VCARD/);
    });

    test("each user sees only their own people in the listing", async () => {
        const mine = await makeKey(OWNER);
        person(OWNER, { name: "Mine Only", email: "m@example.com" });
        person(OTHER, { name: "Theirs Only", email: "t@example.com" });
        const q = await dav("REPORT", BOOK, mine.key, { depth: 1, body: QUERY });
        assert.match(q.text, /Mine Only/);
        assert.doesNotMatch(q.text, /Theirs Only/);
    });
});

describe("the proxy skip list lets the address book reach the app", () => {
    function skipPattern() {
        const compose = fs.readFileSync(path.join(__dirname, "..", "..", "docker-compose.yml"), "utf8");
        const line = compose.split("\n").find((l) => l.includes("OAUTH2_PROXY_SKIP_AUTH_ROUTES"));
        assert.ok(line, "skip-list line not found");
        return new RegExp(line.slice(line.indexOf("=") + 1).trim());
    }

    test("every address-book path matches, and nothing near them does", () => {
        const re = skipPattern();
        for (const p of [
            "/carddav",
            "/carddav/",
            "/carddav/principal/",
            "/carddav/home/contacts/12.vcf",
            "/.well-known/carddav",
        ]) {
            assert.ok(re.test(p), `should match ${p}`);
        }
        for (const p of ["/carddavx", "/api/contacts", "/api/carddav/", "/.well-known/carddavx", "/x/carddav/"]) {
            assert.ok(!re.test(p), `should not match ${p}`);
        }
    });

    test("the existing skip-list entries still match", () => {
        const re = skipPattern();
        assert.ok(re.test("/upload/abc123"));
        assert.ok(re.test("/site.webmanifest"));
        assert.ok(re.test("/.well-known/oauth-authorization-server"));
    });
});
