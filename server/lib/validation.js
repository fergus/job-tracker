function isValidUrl(url) {
    if (!url) return true;
    try {
        const parsed = new URL(url);
        return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
        return false;
    }
}

module.exports = { isValidUrl };
