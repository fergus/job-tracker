const fs = require("fs");
const fsPromises = require("fs").promises;
const path = require("path");

// Overridable so a test (or an operator) can point the app -- and the
// destructive orphaned-file sweep in db.js -- at a scratch directory
// instead of the real one.
const uploadsDir = path.resolve(
    process.env.UPLOADS_DIR || path.join(__dirname, "..", "..", "uploads"),
);

function safePath(base, filename) {
    const resolved = path.resolve(base, filename);
    if (!resolved.startsWith(base + path.sep) && resolved !== base) {
        return null;
    }
    return resolved;
}

async function safeDeleteFile(filePath) {
    try {
        if (fs.existsSync(filePath)) {
            await fsPromises.unlink(filePath);
        }
    } catch (err) {
        console.error(
            "[cleanup] Failed to delete file:",
            filePath,
            err.message,
        );
    }
}

module.exports = { uploadsDir, safePath, safeDeleteFile };
