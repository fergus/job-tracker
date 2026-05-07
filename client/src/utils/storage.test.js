import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";
import {
    storageGet,
    storageSet,
    storageGetBool,
    storageGetString,
} from "./storage.js";

const TEST_KEY = "__test_storage_key__";

const store = new Map();

globalThis.localStorage = {
    getItem(key) {
        return store.get(key) ?? null;
    },
    setItem(key, val) {
        store.set(key, String(val));
    },
    removeItem(key) {
        store.delete(key);
    },
};

describe("storage", () => {
    beforeEach(() => {
        store.clear();
    });

    test("storageGet returns stored string", () => {
        localStorage.setItem(TEST_KEY, "hello");
        assert.strictEqual(storageGet(TEST_KEY), "hello");
    });

    test("storageGet returns null for missing key", () => {
        assert.strictEqual(storageGet("__missing__"), null);
    });

    test("storageSet stores a value", () => {
        storageSet(TEST_KEY, "world");
        assert.strictEqual(localStorage.getItem(TEST_KEY), "world");
    });

    test("storageGetBool returns true for 'true' string", () => {
        localStorage.setItem(TEST_KEY, "true");
        assert.strictEqual(storageGetBool(TEST_KEY, false), true);
    });

    test("storageGetBool returns false for 'false' string", () => {
        localStorage.setItem(TEST_KEY, "false");
        assert.strictEqual(storageGetBool(TEST_KEY, true), false);
    });

    test("storageGetBool returns default when key missing", () => {
        assert.strictEqual(storageGetBool("__missing__", true), true);
        assert.strictEqual(storageGetBool("__missing__", false), false);
    });

    test("storageGetString returns stored value", () => {
        localStorage.setItem(TEST_KEY, "updated");
        assert.strictEqual(storageGetString(TEST_KEY, "default"), "updated");
    });

    test("storageGetString returns default when key missing", () => {
        assert.strictEqual(
            storageGetString("__missing__", "fallback"),
            "fallback",
        );
    });
});
