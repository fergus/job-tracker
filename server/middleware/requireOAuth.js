function requireOAuth(req, res, next) {
    if (req.authMethod !== "oauth") {
        return res.status(403).json({
            error: "This action requires browser authentication",
        });
    }
    next();
}

module.exports = requireOAuth;
