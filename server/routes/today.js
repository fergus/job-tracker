"use strict";

const express = require("express");
const { listToday } = require("../services/today");

const router = express.Router();

// Read-only. Snoozing a row writes through the application or contact update
// endpoints, so nothing here mutates.
router.get("/", (req, res) => {
    res.json(
        listToday(req.userEmail, {
            all: req.query.all,
            isAdmin: req.isAdmin,
        }),
    );
});

module.exports = router;
