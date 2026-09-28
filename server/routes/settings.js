"use strict";

const express = require("express");
const svc = require("../services/settings");
const requireOAuth = require("../middleware/requireOAuth");

const router = express.Router();

function handleError(res, e) {
    if (e instanceof svc.ServiceError) {
        return res.status(e.status).json({ error: e.message });
    }
    throw e;
}

// GET /api/me/settings -- the caller's own settings, defaults filled in.
router.get("/me/settings", (req, res) => {
    res.json(svc.getSettings(req.userEmail));
});

// PUT /api/me/settings -- browser only, like the profile: a preference that
// changes what closing a record does is the user's to set, not an agent's.
router.put("/me/settings", requireOAuth, (req, res) => {
    try {
        res.json(svc.updateSettings(req.userEmail, req.body));
    } catch (e) {
        handleError(res, e);
    }
});

module.exports = router;
