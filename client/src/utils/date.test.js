import { test, describe } from "node:test"
import assert from "node:assert"
import {
    MS_PER_DAY,
    RECENT_CLOSED_DAYS,
    formatDate,
    formatShortDate,
    formatDateTime,
    formatRelativeDate,
    formatTimeAgo,
    daysSince,
    isoFromDateInput,
} from "./date.js"

describe("date constants", () => {
    test("MS_PER_DAY is 86400000", () => {
        assert.strictEqual(MS_PER_DAY, 86_400_000)
    })

    test("RECENT_CLOSED_DAYS is 14", () => {
        assert.strictEqual(RECENT_CLOSED_DAYS, 14)
    })
})

describe("formatDate", () => {
    test("returns locale date for valid ISO", () => {
        const result = formatDate("2026-05-06T00:00:00Z")
        assert.strictEqual(typeof result, "string")
        assert.ok(result.length > 0)
        assert.notStrictEqual(result, "-")
    })

    test("returns '-' for falsy values", () => {
        assert.strictEqual(formatDate(null), "-")
        assert.strictEqual(formatDate(undefined), "-")
        assert.strictEqual(formatDate(""), "-")
    })
})

describe("formatShortDate", () => {
    test("returns short month and day", () => {
        const result = formatShortDate("2026-05-06T00:00:00Z")
        assert.ok(result.includes("May") || result.includes("6"))
    })

    test("returns empty string for falsy values", () => {
        assert.strictEqual(formatShortDate(null), "")
        assert.strictEqual(formatShortDate(""), "")
    })
})

describe("formatDateTime", () => {
    test("returns date and time", () => {
        const result = formatDateTime("2026-05-06T14:30:00Z")
        assert.ok(result.includes("14") || result.includes("2"))
    })

    test("returns empty string for falsy values", () => {
        assert.strictEqual(formatDateTime(null), "")
    })
})

describe("formatRelativeDate", () => {
    test("returns 'today' for current date", () => {
        const today = new Date().toISOString()
        assert.strictEqual(formatRelativeDate(today), "today")
    })

    test("returns days ago for recent past", () => {
        const d = new Date(Date.now() - 2 * MS_PER_DAY).toISOString()
        const result = formatRelativeDate(d)
        assert.ok(result.includes("2") || result.includes("day"))
    })

    test("returns weeks ago for older dates", () => {
        const d = new Date(Date.now() - 14 * MS_PER_DAY).toISOString()
        const result = formatRelativeDate(d)
        assert.ok(result.includes("week") || result.includes("2"))
    })

    test("returns months ago for old dates", () => {
        const d = new Date(Date.now() - 90 * MS_PER_DAY).toISOString()
        const result = formatRelativeDate(d)
        assert.ok(result.includes("month") || result.includes("3"))
    })

    test("returns empty string for falsy values", () => {
        assert.strictEqual(formatRelativeDate(null), "")
    })
})

describe("formatTimeAgo", () => {
    test("returns 'just now' for very recent", () => {
        const now = new Date().toISOString()
        assert.strictEqual(formatTimeAgo(now), "just now")
    })

    test("returns minutes ago", () => {
        const d = new Date(Date.now() - 5 * 60000).toISOString()
        assert.strictEqual(formatTimeAgo(d), "5m ago")
    })

    test("returns hours ago", () => {
        const d = new Date(Date.now() - 3 * 60 * 60000).toISOString()
        assert.strictEqual(formatTimeAgo(d), "3h ago")
    })

    test("returns days ago", () => {
        const d = new Date(Date.now() - 2 * MS_PER_DAY).toISOString()
        assert.strictEqual(formatTimeAgo(d), "2d ago")
    })

    test("returns empty string for falsy values", () => {
        assert.strictEqual(formatTimeAgo(null), "")
    })
})

describe("daysSince", () => {
    test("returns 0 for today", () => {
        const today = new Date().toISOString()
        assert.strictEqual(daysSince(today), 0)
    })

    test("returns Infinity for missing date", () => {
        assert.strictEqual(daysSince(null), Infinity)
        assert.strictEqual(daysSince(""), Infinity)
    })
})

describe("isoFromDateInput", () => {
    test("converts date input value to ISO", () => {
        const result = isoFromDateInput("2026-05-06")
        assert.ok(result.startsWith("2026-05-06"))
        assert.ok(result.includes("T"))
    })

    test("returns null for falsy values", () => {
        assert.strictEqual(isoFromDateInput(null), null)
        assert.strictEqual(isoFromDateInput(""), null)
    })
})
