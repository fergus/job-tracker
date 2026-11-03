const { createHmac } = require("node:crypto");
const db = require("../db");

let apiKeySecret;
if (process.env.NODE_ENV === "production") {
    if (!process.env.SERVER_API_KEY_SECRET) {
        throw new Error(
            "SERVER_API_KEY_SECRET environment variable is required in production. " +
                "Add SERVER_API_KEY_SECRET=<value> to your .env file (generate one with: openssl rand -hex 32), then restart.",
        );
    }
    apiKeySecret = process.env.SERVER_API_KEY_SECRET;
} else {
    if (!process.env.SERVER_API_KEY_SECRET) {
        console.warn(
            "[auth] SERVER_API_KEY_SECRET not set — using static dev fallback. Set this in production.",
        );
    }
    apiKeySecret =
        process.env.SERVER_API_KEY_SECRET ||
        "dev-fallback-secret-do-not-use-in-production";
}

// Look a raw token up and say who it belongs to and what it may open. Both
// Bearer REST auth and the phone address book go through here, so the scope
// check cannot be forgotten in one of them.
function resolveApiKeyWithScope(rawToken) {
    const keyHash = createHmac("sha256", apiKeySecret)
        .update(rawToken)
        .digest("hex");
    const row = db.getApiKeyByHash.get(keyHash);
    if (!row) return null;
    Promise.resolve()
        .then(() => db.updateApiKeyLastUsed.run(row.id))
        .catch(() => {});
    return { user_email: row.user_email, scope: row.scope ?? null };
}

// A general-purpose key only: a scoped key (the phone's) opens nothing here,
// and is indistinguishable from an unknown one to the caller.
function resolveApiKey(rawToken) {
    const key = resolveApiKeyWithScope(rawToken);
    if (!key || key.scope !== null) return null;
    return key.user_email;
}

module.exports = { apiKeySecret, resolveApiKey, resolveApiKeyWithScope };
