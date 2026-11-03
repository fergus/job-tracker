"use strict";

// The phone's view of a person: a vCard 3.0 card, plus the two fingerprints a
// contacts client uses to decide what to re-read. Pure functions of what the
// card shows -- no timestamps -- so an edit to a field that is not on the card
// moves neither fingerprint.

const crypto = require("crypto");

const CRLF = "\r\n";
const MAX_OCTETS = 75;

// Text values: backslash, comma, semicolon and newline are structural in a
// vCard, so a name like "O'Brien, Jr; Esq" would otherwise split into fields.
function escapeText(value) {
    return String(value)
        .replace(/\\/g, "\\\\")
        .replace(/;/g, "\;")
        .replace(/,/g, "\\,")
        .replace(/\r\n|\r|\n/g, "\\n");
}

// Fold a logical line to physical lines of at most 75 octets, continuing each
// with a single space, without cutting a multi-byte character in half.
function fold(line) {
    if (Buffer.byteLength(line) <= MAX_OCTETS) return line;
    const out = [];
    let current = "";
    let size = 0;
    let limit = MAX_OCTETS;
    for (const ch of line) {
        const w = Buffer.byteLength(ch);
        if (size + w > limit) {
            out.push(current);
            current = " ";
            size = 1;
            limit = MAX_OCTETS;
        }
        current += ch;
        size += w;
    }
    out.push(current);
    return out.join(CRLF);
}

// "Jane Q Doe" -> family "Doe", given "Jane Q". A single word is the family
// name, which is how a phone sorts it.
function splitName(name) {
    const parts = String(name).trim().split(/\s+/);
    const family = parts.pop() || "";
    return { family, given: parts.join(" ") };
}

function trackerLink(baseUrl, id) {
    return `${String(baseUrl).replace(/\/+$/, "")}/?contact=${id}`;
}

// `contact` is a row from the contacts table. `baseUrl` is the address the
// tracker is reached on; without one the card carries no link back.
function renderVCard(contact, { baseUrl } = {}) {
    const { family, given } = splitName(contact.name);
    const rows = [
        "BEGIN:VCARD",
        "VERSION:3.0",
        `UID:contact-${contact.id}@job-tracker`,
        `FN:${escapeText(contact.name)}`,
        `N:${escapeText(family)};${escapeText(given)};;;`,
    ];
    if (contact.employer) rows.push(`ORG:${escapeText(contact.employer)}`);
    if (contact.contact_role) rows.push(`TITLE:${escapeText(contact.contact_role)}`);
    if (contact.email && contact.email.trim()) {
        rows.push(`EMAIL;TYPE=INTERNET:${escapeText(contact.email.trim())}`);
    }
    if (contact.phone && contact.phone.trim()) {
        rows.push(`TEL;TYPE=VOICE:${escapeText(contact.phone.trim())}`);
    }
    // Grouped URL + label is how Apple's Contacts shows a named link.
    let item = 0;
    if (contact.linkedin_url) {
        item += 1;
        rows.push(`item${item}.URL:${contact.linkedin_url}`);
        rows.push(`item${item}.X-ABLabel:LinkedIn`);
    }
    if (baseUrl) {
        item += 1;
        rows.push(`item${item}.URL:${trackerLink(baseUrl, contact.id)}`);
        rows.push(`item${item}.X-ABLabel:Job Tracker`);
    }
    rows.push("END:VCARD");
    return rows.map(fold).join(CRLF) + CRLF;
}

function sha(text) {
    return crypto.createHash("sha256").update(text).digest("hex").slice(0, 32);
}

// A card's version: changes exactly when the rendered card does.
function etagFor(card) {
    return `"${sha(card)}"`;
}

// The address book's version, from every card's id and ETag: it changes on an
// add, an edit that shows, a delete, or a person dropping out of eligibility.
function collectionTag(entries) {
    const ordered = [...entries].sort((a, b) => a.id - b.id);
    return sha(ordered.map((e) => `${e.id}:${e.etag}`).join("|"));
}

module.exports = { renderVCard, etagFor, collectionTag, escapeText };
