// Lint gate for the server, mirroring client/eslint.config.js: the recommended
// set, measured first and cleared rather than silenced. No stylistic rules.
const js = require("@eslint/js");
const globals = require("globals");

module.exports = [
    {
        ignores: ["node_modules/**"],
    },
    js.configs.recommended,
    {
        files: ["**/*.js"],
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "commonjs",
            globals: { ...globals.node },
        },
        rules: {
            // `_` marks a parameter kept for its position: Express only treats
            // a handler as an error handler when it declares all four.
            "no-unused-vars": [
                "error",
                { argsIgnorePattern: "^_", ignoreRestSiblings: true },
            ],
            // Best-effort cleanup (unlinking a temp file, closing a session)
            // is allowed to fail silently.
            "no-empty": ["error", { allowEmptyCatch: true }],
            // An async IIFE run as a bare statement is work nobody awaits and
            // whose failure nobody sees. The attachment-text backfill in db.js
            // ran this way at every startup, alongside the server it delayed
            // nothing for. Await it, or move it to a script.
            "no-restricted-syntax": [
                "error",
                {
                    selector:
                        "ExpressionStatement > CallExpression[callee.async=true]",
                    message:
                        "Floating async IIFE: await it or move the work to a script.",
                },
            ],
        },
    },
]
