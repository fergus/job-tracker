const { createHmac } = require("node:crypto");
const db = require("../db");

let apiKeySecret;
if (process.env.NODE_ENV === "production") {
    if (!process.env.SERVER_API_KEY_SECRET) {
        throw new Error(
            "SERVER_API_KEY_SECRET environment variable is required in production",
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

function resolveApiKey(rawToken) {
    const keyHash = createHmac("sha256", apiKeySecret)
        .update(rawToken)
        .digest("hex");
    const row = db.getApiKeyByHash.get(keyHash);
    if (!row) return null;
    Promise.resolve()
        .then(() => db.updateApiKeyLastUsed.run(row.id))
        .catch(() => {});
    return row.user_email;
}

module.exports = { apiKeySecret, resolveApiKey };
