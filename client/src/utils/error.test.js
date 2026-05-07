import { test, describe } from "node:test"
import assert from "node:assert"
import { getErrorMessage, getErrorType, isNotFound } from "./error.js"

describe("getErrorMessage", () => {
    test("extracts server error from response", () => {
        const err = { response: { data: { error: "Bad request" } } }
        assert.strictEqual(getErrorMessage(err), "Bad request")
    })

    test("falls back to err.message", () => {
        const err = { message: "Network failure" }
        assert.strictEqual(getErrorMessage(err), "Network failure")
    })

    test("falls back to provided fallback", () => {
        assert.strictEqual(getErrorMessage(null, "It broke"), "It broke")
        assert.strictEqual(getErrorMessage({}, "It broke"), "It broke")
    })

    test("prefers server error over message", () => {
        const err = { response: { data: { error: "Server says no" } }, message: "Client says no" }
        assert.strictEqual(getErrorMessage(err), "Server says no")
    })
})

describe("getErrorType", () => {
    test("extracts type from response", () => {
        const err = { response: { data: { type: "timeout" } } }
        assert.strictEqual(getErrorType(err), "timeout")
    })

    test("returns undefined when no type", () => {
        assert.strictEqual(getErrorType(null), undefined)
        assert.strictEqual(getErrorType({ message: "oops" }), undefined)
    })
})

describe("isNotFound", () => {
    test("returns true for 404", () => {
        const err = { response: { status: 404 } }
        assert.strictEqual(isNotFound(err), true)
    })

    test("returns false for other statuses", () => {
        const err = { response: { status: 500 } }
        assert.strictEqual(isNotFound(err), false)
    })

    test("returns false for missing response", () => {
        assert.strictEqual(isNotFound(null), false)
        assert.strictEqual(isNotFound({}), false)
    })
})
