"use strict";

const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const zlib = require("zlib");

const {
    fetchJobDescription,
    FetchError,
    isPublicAddress,
} = require("../../services/fetch-jd");

const JOB_HTML =
    "<html><body><h1>Senior Engineer</h1><p>" +
    "We are hiring a senior engineer to build reliable systems. ".repeat(3) +
    "</p><script>ignored()</script></body></html>";

// A local server stands in for a job board. It lives on 127.0.0.1, so the
// tests that need to reach it widen the address check to exactly that host.
let server;
let base;
const onlyLoopback = (address) => address === "127.0.0.1";

before(async () => {
    server = http.createServer((req, res) => {
        const port = server.address().port;
        switch (req.url) {
            case "/job":
                res.writeHead(200, { "Content-Type": "text/html" });
                return res.end(JOB_HTML);
            case "/gzip":
                res.writeHead(200, {
                    "Content-Type": "text/html; charset=utf-8",
                    "Content-Encoding": "gzip",
                });
                return res.end(zlib.gzipSync(JOB_HTML));
            case "/hop":
                res.writeHead(302, { Location: "/job" });
                return res.end();
            case "/to-other-loopback":
                res.writeHead(302, {
                    Location: `http://127.0.0.2:${port}/job`,
                });
                return res.end();
            case "/to-localhost":
                res.writeHead(301, { Location: `http://localhost:${port}/job` });
                return res.end();
            case "/loop":
                res.writeHead(302, { Location: "/loop" });
                return res.end();
            case "/json":
                res.writeHead(200, { "Content-Type": "application/json" });
                return res.end("{}");
            default:
                res.writeHead(404);
                return res.end();
        }
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

async function rejectsWith(promise, type) {
    await assert.rejects(promise, (err) => {
        assert.ok(err instanceof FetchError, `expected FetchError, got ${err}`);
        assert.equal(err.type, type);
        return true;
    });
}

describe("isPublicAddress", () => {
    test("allows public IPv4 and IPv6", () => {
        for (const a of ["8.8.8.8", "1.1.1.1", "151.101.1.69", "2606:4700::1111"]) {
            assert.equal(isPublicAddress(a), true, a);
        }
    });

    test("refuses loopback, private, link-local and reserved IPv4", () => {
        for (const a of [
            "127.0.0.1",
            "127.1.2.3",
            "0.0.0.0",
            "10.0.0.5",
            "172.16.0.1",
            "172.31.255.255",
            "192.168.1.1",
            "169.254.169.254",
            "100.64.0.1",
            "198.18.0.1",
            "224.0.0.1",
            "255.255.255.255",
        ]) {
            assert.equal(isPublicAddress(a), false, a);
        }
    });

    test("refuses non-public IPv6, including prefixes that embed IPv4", () => {
        for (const a of [
            "::1",
            "::",
            "fe80::1",
            "febf::1",
            "fc00::1",
            "fd12:3456::1",
            "ff02::1",
            "64:ff9b::7f00:1",
            "64:ff9b:1::a00:1",
            "2002:7f00:1::",
            "2001:0:4136:e378::1",
            "::127.0.0.1",
            "::ffff:0:7f00:1",
        ]) {
            assert.equal(isPublicAddress(a), false, a);
        }
    });

    test("judges IPv4-mapped IPv6 by the IPv4 inside, in either notation", () => {
        assert.equal(isPublicAddress("::ffff:127.0.0.1"), false);
        assert.equal(isPublicAddress("::ffff:7f00:1"), false);
        assert.equal(isPublicAddress("::ffff:a9fe:a9fe"), false);
        assert.equal(isPublicAddress("::FFFF:8.8.8.8"), true);
        assert.equal(isPublicAddress("::ffff:808:808"), true);
    });

    test("refuses anything that is not an IP address", () => {
        assert.equal(isPublicAddress("localhost"), false);
        assert.equal(isPublicAddress(""), false);
    });
});

describe("fetchJobDescription: address guard", () => {
    test("refuses a loopback IP literal", async () => {
        await rejectsWith(fetchJobDescription(`${base}/job`), "blocked");
    });

    test("refuses a bracketed IPv4-mapped IPv6 literal", async () => {
        const port = server.address().port;
        await rejectsWith(
            fetchJobDescription(`http://[::ffff:127.0.0.1]:${port}/job`),
            "blocked",
        );
    });

    test("refuses a hostname that resolves to loopback", async () => {
        const port = server.address().port;
        await rejectsWith(
            fetchJobDescription(`http://localhost:${port}/job`),
            "blocked",
        );
    });

    test("refuses the cloud metadata address", async () => {
        await rejectsWith(
            fetchJobDescription("http://169.254.169.254/latest/meta-data/"),
            "blocked",
        );
    });

    test("re-checks a redirect to a literal address", async () => {
        await rejectsWith(
            fetchJobDescription(`${base}/to-other-loopback`, {
                isAllowed: onlyLoopback,
            }),
            "blocked",
        );
    });

    test("re-checks a redirect to a hostname", async () => {
        // Allow only the first check (the origin's IP literal), so the hop to
        // localhost has to go through the lookup hook and be refused there.
        let checks = 0;
        await rejectsWith(
            fetchJobDescription(`${base}/to-localhost`, {
                isAllowed: () => checks++ === 0,
            }),
            "blocked",
        );
    });

    test("refuses a non-http scheme", async () => {
        await rejectsWith(fetchJobDescription("file:///etc/passwd"), "invalid_url");
    });
});

describe("fetchJobDescription: fetching", () => {
    const opts = { isAllowed: onlyLoopback };

    test("returns the page as text", async () => {
        const text = await fetchJobDescription(`${base}/job`, opts);
        assert.ok(text.startsWith("Senior Engineer We are hiring"));
        assert.ok(!text.includes("ignored()"));
    });

    test("decompresses a gzipped page", async () => {
        const text = await fetchJobDescription(`${base}/gzip`, opts);
        assert.ok(text.startsWith("Senior Engineer"));
    });

    test("follows a relative redirect", async () => {
        const text = await fetchJobDescription(`${base}/hop`, opts);
        assert.ok(text.startsWith("Senior Engineer"));
    });

    test("stops after the redirect limit", async () => {
        await rejectsWith(
            fetchJobDescription(`${base}/loop`, opts),
            "too_many_redirects",
        );
    });

    test("maps a 404", async () => {
        await rejectsWith(fetchJobDescription(`${base}/missing`, opts), "not_found");
    });

    test("refuses a non-HTML response", async () => {
        await rejectsWith(fetchJobDescription(`${base}/json`, opts), "wrong_format");
    });
});
