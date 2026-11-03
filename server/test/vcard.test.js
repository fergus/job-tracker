"use strict";

process.env.DB_PATH = ":memory:";
process.env.RATE_LIMIT_API = "100000";

const { test, describe, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const db = require("../db");
const contactsSvc = require("../services/contacts");
const { renderVCard, etagFor, collectionTag } = require("../lib/vcard");

const USER = "vcard@example.com";
const OTHER = "vcard-other@example.com";

beforeEach(() => {
    db.exec("DELETE FROM contact_links");
    db.exec("DELETE FROM contacts");
    db.exec("DELETE FROM connections");
});

// Undo line folding and read the properties back, so the tests assert what a
// phone would see rather than the exact wire formatting.
function unfold(text) {
    return text.replace(/\r\n[ \t]/g, "");
}

function lines(card) {
    return unfold(card).split("\r\n").filter(Boolean);
}

function unescapeText(v) {
    return v.replace(/\\([nN,;\\])/g, (_, c) => (c === "n" || c === "N" ? "\n" : c));
}

function prop(card, name) {
    const hit = lines(card).find((l) => l.toUpperCase().startsWith(`${name}:`) || l.toUpperCase().startsWith(`${name};`));
    return hit ? hit.slice(hit.indexOf(":") + 1) : undefined;
}

function person(over = {}) {
    return contactsSvc.createContact(USER, { name: "Jane Doe", email: "jane@example.com", ...over });
}

describe("who gets a card", () => {
    test("a person with only a phone is eligible; one with neither is not", () => {
        person({ name: "Phone Only", email: undefined, phone: "0400 000 000" });
        person({ name: "Email Only", email: "e@example.com" });
        person({ name: "Neither", email: undefined });
        const names = contactsSvc.listPhoneContacts(USER).map((c) => c.name);
        assert.deepEqual(names.sort(), ["Email Only", "Phone Only"]);
    });

    test("whitespace-only email and phone do not count", () => {
        const c = person({ name: "Blank", email: undefined });
        db.prepare("UPDATE contacts SET email = '   ', phone = ' ' WHERE id = ?").run(c.id);
        assert.deepEqual(contactsSvc.listPhoneContacts(USER), []);
    });

    test("only the owner's people are listed", () => {
        person({ name: "Mine" });
        contactsSvc.createContact(OTHER, { name: "Theirs", email: "t@example.com" });
        assert.deepEqual(
            contactsSvc.listPhoneContacts(USER).map((c) => c.name),
            ["Mine"],
        );
    });

    test("an imported connection that has not been promoted never appears", () => {
        db.prepare(
            "INSERT INTO connections (user_email, first_name, last_name, url, email, company_key) VALUES (?, 'Con', 'Nection', 'https://www.linkedin.com/in/con', 'con@example.com', 'acme')",
        ).run(USER);
        assert.deepEqual(contactsSvc.listPhoneContacts(USER), []);
    });
});

describe("the card", () => {
    test("carries name, role, employer, email, phone, LinkedIn and the tracker link", () => {
        const c = person({
            contact_role: "Recruiter",
            employer: "Acme",
            phone: "0400 111 222",
            linkedin_url: "https://www.linkedin.com/in/jane",
        });
        const card = renderVCard(contactsSvc.getContact(USER, c.id), {
            baseUrl: "https://jobs.example.com",
        });
        assert.match(card, /^BEGIN:VCARD\r\nVERSION:3\.0\r\n/);
        assert.match(card, /END:VCARD\r\n$/);
        assert.equal(prop(card, "FN"), "Jane Doe");
        assert.equal(prop(card, "N"), "Doe;Jane;;;");
        assert.equal(prop(card, "ORG"), "Acme");
        assert.equal(prop(card, "TITLE"), "Recruiter");
        assert.equal(prop(card, "EMAIL"), "jane@example.com");
        assert.equal(prop(card, "TEL"), "0400 111 222");
        const urls = lines(card).filter((l) => /\.?URL:/i.test(l));
        assert.ok(urls.some((l) => l.endsWith("https://www.linkedin.com/in/jane")));
        assert.ok(urls.some((l) => l.endsWith(`https://jobs.example.com/?contact=${c.id}`)));
    });

    test("notes and follow-up details never appear on the card", () => {
        const c = person({ notes: "SECRET-NOTE", next_action: "SECRET-ACTION" });
        const card = renderVCard(contactsSvc.getContact(USER, c.id), { baseUrl: "https://x.example" });
        assert.doesNotMatch(card, /SECRET/);
    });

    test("a name with a comma, a semicolon and a non-ASCII letter round-trips", () => {
        const name = "Zoë, O'Brien; Jr";
        const c = person({ name });
        const card = renderVCard(contactsSvc.getContact(USER, c.id), {});
        assert.equal(unescapeText(prop(card, "FN")), name);
    });

    test("a semicolon and a comma are escaped on the wire, and a name keeps five N components", () => {
        const c = person({ name: "Jo; Anne, Smith" });
        const card = renderVCard(contactsSvc.getContact(USER, c.id), {});
        const fn = lines(card).find((l) => l.startsWith("FN:"));
        assert.equal(fn, "FN:Jo\\; Anne\\, Smith");
        const n = lines(card).find((l) => l.startsWith("N:")).slice(2);
        // Split on semicolons that are not escaped: exactly five components.
        assert.equal(n.split(/(?<!\\);/).length, 5, n);
    });

    test("a stored address holding a line break cannot add properties to the card", () => {
        const c = person();
        db.prepare("UPDATE contacts SET linkedin_url = ? WHERE id = ?").run(
            "https://a.example/x\r\nTEL:999",
            c.id,
        );
        const card = renderVCard(contactsSvc.getContact(USER, c.id), {});
        assert.equal(card.match(/BEGIN:VCARD/g).length, 1);
        assert.equal(lines(card).filter((l) => /^TEL/.test(l)).length, 0);
    });

    test("a value longer than 75 octets is folded and unfolds to the original", () => {
        const employer = "Ünïcödé ".repeat(20).trim();
        const c = person({ employer });
        const card = renderVCard(contactsSvc.getContact(USER, c.id), {});
        for (const physical of card.split("\r\n")) {
            assert.ok(Buffer.byteLength(physical) <= 75, `line too long: ${physical.length}`);
        }
        assert.equal(unescapeText(prop(card, "ORG")), employer);
    });

    test("the tracker link follows the base it is given, and is left off without one", () => {
        const c = person();
        const full = contactsSvc.getContact(USER, c.id);
        assert.match(renderVCard(full, { baseUrl: "https://a.example/" }), /https:\/\/a\.example\/\?contact=\d+/);
        assert.doesNotMatch(renderVCard(full, {}), /\?contact=/);
    });

    test("a person with only a single-word name still has a valid name", () => {
        const c = person({ name: "Madonna" });
        const card = renderVCard(contactsSvc.getContact(USER, c.id), {});
        assert.equal(prop(card, "FN"), "Madonna");
        assert.equal(prop(card, "N"), "Madonna;;;;");
    });

    test("the card has a stable UID per person and no revision stamp", () => {
        const c = person();
        const a = renderVCard(contactsSvc.getContact(USER, c.id), {});
        const b = renderVCard(contactsSvc.getContact(USER, c.id), {});
        assert.equal(prop(a, "UID"), prop(b, "UID"));
        assert.match(prop(a, "UID"), new RegExp(`${c.id}`));
        assert.doesNotMatch(a, /^REV:/m);
    });
});

describe("change detection", () => {
    function tagFor() {
        return collectionTag(
            contactsSvc.listPhoneContacts(USER).map((p) => ({
                id: p.id,
                etag: etagFor(renderVCard(p, {})),
            })),
        );
    }

    test("the same person renders the same ETag twice; editing a shown field changes it", () => {
        const c = person();
        const before = etagFor(renderVCard(contactsSvc.getContact(USER, c.id), {}));
        assert.equal(before, etagFor(renderVCard(contactsSvc.getContact(USER, c.id), {})));
        contactsSvc.updateContact(USER, c.id, { employer: "New Employer" });
        assert.notEqual(before, etagFor(renderVCard(contactsSvc.getContact(USER, c.id), {})));
    });

    test("editing only notes or the follow-up leaves the ETag and the collection tag alone", () => {
        const c = person();
        const etag = etagFor(renderVCard(contactsSvc.getContact(USER, c.id), {}));
        const tag = tagFor();
        contactsSvc.updateContact(USER, c.id, {
            notes: "something private",
            next_action_at: "2026-12-01",
            next_action: "call",
        });
        assert.equal(etagFor(renderVCard(contactsSvc.getContact(USER, c.id), {})), etag);
        assert.equal(tagFor(), tag);
    });

    test("the collection tag changes on an add, an edit and a delete", () => {
        const a = person({ name: "A One" });
        const t0 = tagFor();
        const b = person({ name: "B Two" });
        const t1 = tagFor();
        assert.notEqual(t0, t1, "add");
        contactsSvc.updateContact(USER, a.id, { phone: "0400 999 999" });
        const t2 = tagFor();
        assert.notEqual(t1, t2, "edit");
        contactsSvc.deleteContact(USER, b.id);
        assert.notEqual(t2, tagFor(), "delete");
    });

    test("clearing a person's last email and phone changes the collection tag", () => {
        const c = person({ name: "Only Email" });
        const t0 = tagFor();
        contactsSvc.updateContact(USER, c.id, { email: null });
        assert.notEqual(t0, tagFor());
        assert.deepEqual(contactsSvc.listPhoneContacts(USER), []);
    });
});
