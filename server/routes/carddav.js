"use strict";

// A read-only CardDAV address book: the part of the protocol a phone needs to
// discover the book, list it and read its cards, and nothing that writes.
// iOS can add a third-party contacts account only this way, which is also what
// keeps these people apart from the user's Outlook and iCloud contacts.
//
// The routes sit in front of the browser sign-in (see app.js and the proxy
// skip list), so they authenticate themselves: HTTP Basic, username ignored,
// the password a phone-only key. Nothing else opens them.

const express = require("express");
const rateLimit = require("express-rate-limit");
const db = require("../db");
const { resolveApiKeyWithScope } = require("../lib/apiKeySecret");
const { renderVCard, etagFor, collectionTag } = require("../lib/vcard");
const contactsSvc = require("../services/contacts");

const BASE = "/carddav/";
const PRINCIPAL = "/carddav/principal/";
const HOME = "/carddav/home/";
const BOOK = "/carddav/home/contacts/";
const CARD_RE = /^\/carddav\/home\/contacts\/(\d+)\.vcf$/;

const ALLOW = "OPTIONS, GET, HEAD, PROPFIND, REPORT";
const DAV_HEADER = "1, 3, addressbook";
const REFUSED_WRITES = new Set([
    "PUT",
    "DELETE",
    "PROPPATCH",
    "MKCOL",
    "MKCALENDAR",
    "COPY",
    "MOVE",
    "LOCK",
    "UNLOCK",
    "POST",
]);

const NS =
    'xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav" xmlns:cs="http://calendarserver.org/ns/"';

function xmlEscape(text) {
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function challenge(res) {
    res.set("WWW-Authenticate", 'Basic realm="Job Tracker people", charset="UTF-8"');
    return res.status(401).end();
}

// The password is everything after the first colon; the username is whatever
// the phone was told to type and carries no meaning.
function credentialFrom(req) {
    const header = req.headers.authorization;
    if (!header || !/^Basic /i.test(header)) return null;
    const decoded = Buffer.from(header.slice(6).trim(), "base64").toString("utf8");
    const colon = decoded.indexOf(":");
    return colon === -1 ? null : decoded.slice(colon + 1);
}

function authenticate(req, res, next) {
    const password = credentialFrom(req);
    const key = password ? resolveApiKeyWithScope(password) : null;
    if (!key || key.scope !== "contacts") {
        if (password) console.warn("[carddav] rejected credential from %s", req.ip);
        return challenge(res);
    }
    req.userEmail = key.user_email;
    next();
}

// The base the cards link back to: the configured public address, else the
// address this request came in on, which is where the phone reaches the tracker.
function baseUrl(req) {
    return process.env.PUBLIC_URL || `${req.protocol}://${req.get("host")}`;
}

function cardsFor(req) {
    const base = baseUrl(req);
    return contactsSvc.listPhoneContacts(req.userEmail).map((c) => {
        const vcard = renderVCard(c, { baseUrl: base });
        return { id: c.id, vcard, etag: etagFor(vcard) };
    });
}

function ctagOf(cards) {
    return collectionTag(cards.map((c) => ({ id: c.id, etag: c.etag })));
}

// --- Request body: just enough to answer what was asked --------------------

function requestedProps(body) {
    if (!body || /allprop/.test(body) || !/prop[\s>/]/.test(body)) return null;
    const block = body.match(/<(?:[\w-]+:)?prop\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?prop>/);
    if (!block) return null;
    const names = [];
    for (const m of block[1].matchAll(/<(?:[\w-]+:)?([\w-]+)\b[^>]*?\/?>/g)) {
        names.push(m[1]);
    }
    return names;
}

function requestedHrefs(body) {
    const hrefs = [];
    for (const m of String(body || "").matchAll(/<(?:[\w-]+:)?href\b[^>]*>([^<]+)</g)) {
        try {
            hrefs.push(decodeURI(m[1].trim()));
        } catch {
            hrefs.push(m[1].trim());
        }
    }
    return hrefs;
}

function reportKind(body) {
    if (/addressbook-multiget/.test(body || "")) return "multiget";
    if (/addressbook-query/.test(body || "")) return "query";
    return null;
}

// --- Resources and their properties ---------------------------------------

function propertiesFor(resource) {
    switch (resource.kind) {
        case "root":
            return {
                resourcetype: "<d:collection/>",
                displayname: "Job Tracker",
                "current-user-principal": `<d:href>${PRINCIPAL}</d:href>`,
            };
        case "principal":
            return {
                resourcetype: "<d:collection/><d:principal/>",
                displayname: "Job Tracker people",
                "current-user-principal": `<d:href>${PRINCIPAL}</d:href>`,
                "principal-URL": `<d:href>${PRINCIPAL}</d:href>`,
                "addressbook-home-set": `<d:href>${HOME}</d:href>`,
            };
        case "home":
            return {
                resourcetype: "<d:collection/>",
                displayname: "Job Tracker",
                "current-user-principal": `<d:href>${PRINCIPAL}</d:href>`,
            };
        case "book":
            return {
                resourcetype: "<d:collection/><card:addressbook/>",
                displayname: "Job Tracker people",
                getctag: resource.ctag,
                "supported-report-set":
                    "<d:supported-report><d:report><card:addressbook-multiget/></d:report></d:supported-report>" +
                    "<d:supported-report><d:report><card:addressbook-query/></d:report></d:supported-report>",
                "supported-address-data":
                    '<card:address-data-type content-type="text/vcard" version="3.0"/>',
                "current-user-privilege-set":
                    "<d:privilege><d:read/></d:privilege>",
                "current-user-principal": `<d:href>${PRINCIPAL}</d:href>`,
            };
        case "card":
            return {
                resourcetype: "",
                getetag: resource.card.etag,
                getcontenttype: "text/vcard; charset=utf-8",
                "address-data": xmlEscape(resource.card.vcard),
            };
        default:
            return {};
    }
}

// Which prefix each property is declared under in the response.
const PROP_PREFIX = {
    getctag: "cs",
    "addressbook-home-set": "card",
    "supported-address-data": "card",
    "address-data": "card",
};

function propXml(name, value) {
    const prefix = PROP_PREFIX[name] || "d";
    return value === "" ? `<${prefix}:${name}/>` : `<${prefix}:${name}>${value}</${prefix}:${name}>`;
}

function responseXml(resource, wanted) {
    const props = propertiesFor(resource);
    const names = wanted || Object.keys(props).filter((n) => n !== "address-data");
    const found = [];
    const missing = [];
    for (const n of names) {
        if (Object.prototype.hasOwnProperty.call(props, n)) found.push(propXml(n, props[n]));
        else missing.push(`<d:${n}/>`);
    }
    let out = `<d:response><d:href>${resource.href}</d:href>`;
    if (found.length) {
        out += `<d:propstat><d:prop>${found.join("")}</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat>`;
    }
    if (missing.length) {
        out += `<d:propstat><d:prop>${missing.join("")}</d:prop><d:status>HTTP/1.1 404 Not Found</d:status></d:propstat>`;
    }
    return out + "</d:response>";
}

function notFoundXml(href) {
    return `<d:response><d:href>${xmlEscape(href)}</d:href><d:status>HTTP/1.1 404 Not Found</d:status></d:response>`;
}

function multistatus(res, responses) {
    res.status(207)
        .type("application/xml; charset=utf-8")
        .send(`<?xml version="1.0" encoding="utf-8"?><d:multistatus ${NS}>${responses.join("")}</d:multistatus>`);
}

// The router is mounted at /carddav, so req.path has lost its prefix; the
// resources are addressed by their full path.
function fullPath(req) {
    const p = req.originalUrl.split("?")[0];
    return p === "/carddav" ? BASE : p;
}

function resolveResource(req, forced) {
    const p = forced || fullPath(req);
    if (p === BASE) return { kind: "root", href: BASE };
    if (p === PRINCIPAL) return { kind: "principal", href: PRINCIPAL };
    if (p === HOME) return { kind: "home", href: HOME };
    if (p === BOOK) {
        const cards = cardsFor(req);
        return { kind: "book", href: BOOK, cards, ctag: ctagOf(cards) };
    }
    const m = p.match(CARD_RE);
    if (m) {
        const card = cardsFor(req).find((c) => c.id === Number(m[1]));
        return card ? { kind: "card", href: p, card } : null;
    }
    return null;
}

function cardResource(card) {
    return { kind: "card", href: `${BOOK}${card.id}.vcf`, card };
}

// --- Handlers --------------------------------------------------------------

function propfind(req, res) {
    const resource = resolveResource(req);
    if (!resource) return res.status(404).end();
    const wanted = requestedProps(req.body);
    const depth = req.headers.depth === "0" ? 0 : 1;
    const responses = [responseXml(resource, wanted)];
    if (depth === 1 && resource.kind === "book") {
        for (const card of resource.cards) {
            responses.push(responseXml(cardResource(card), wanted));
        }
    } else if (depth === 1 && resource.kind === "root") {
        responses.push(responseXml({ kind: "principal", href: PRINCIPAL }, wanted));
    } else if (depth === 1 && resource.kind === "principal") {
        responses.push(responseXml({ kind: "home", href: HOME }, wanted));
    } else if (depth === 1 && resource.kind === "home") {
        responses.push(
            responseXml(resolveResource(req, BOOK), wanted),
        );
    }
    multistatus(res, responses);
}

function report(req, res) {
    if (fullPath(req) !== BOOK) return res.status(404).end();
    const kind = reportKind(req.body);
    if (!kind) {
        return res
            .status(403)
            .type("application/xml; charset=utf-8")
            .send(`<?xml version="1.0"?><d:error ${NS}><d:supported-report/></d:error>`);
    }
    const wanted = requestedProps(req.body) || ["getetag", "address-data"];
    const cards = cardsFor(req);
    if (kind === "query") {
        return multistatus(
            res,
            cards.map((c) => responseXml(cardResource(c), wanted)),
        );
    }
    const responses = [];
    for (const href of requestedHrefs(req.body)) {
        const m = href.match(CARD_RE);
        const card = m && cards.find((c) => c.id === Number(m[1]));
        responses.push(card ? responseXml(cardResource(card), wanted) : notFoundXml(href));
    }
    multistatus(res, responses);
}

function getCard(req, res) {
    const resource = resolveResource(req);
    if (!resource || resource.kind !== "card") return res.status(404).end();
    res.set("ETag", resource.card.etag);
    res.type("text/vcard; charset=utf-8");
    res.send(req.method === "HEAD" ? undefined : resource.card.vcard);
}

// --- Router ----------------------------------------------------------------

const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_CARDDAV ?? "300", 10),
    standardHeaders: true,
    legacyHeaders: false,
});

const router = express.Router();
router.use(limiter);
router.use(express.text({ type: ["application/xml", "text/xml", "*/xml"], limit: "100kb" }));

router.use((req, res, next) => {
    if (req.method === "OPTIONS") {
        res.set({ DAV: DAV_HEADER, Allow: ALLOW });
        return res.status(200).end();
    }
    authenticate(req, res, next);
});

router.use((req, res) => {
    const method = req.method.toUpperCase();
    if (REFUSED_WRITES.has(method)) {
        return res.status(403).type("text/plain").send("This address book is read-only");
    }
    switch (method) {
        case "PROPFIND":
            return propfind(req, res);
        case "REPORT":
            return report(req, res);
        case "GET":
        case "HEAD":
            return getCard(req, res);
        default:
            res.set("Allow", ALLOW);
            return res.status(405).end();
    }
});

// Phones probe this address first to find the book (RFC 6764). It carries no
// data, so it needs no credential.
function wellKnown(req, res) {
    res.redirect(301, BASE);
}

module.exports = { router, wellKnown };
