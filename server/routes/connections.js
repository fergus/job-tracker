"use strict";

const express = require("express");
const svc = require("../services/connections");

const router = express.Router();

function handleError(res, e) {
    if (e instanceof svc.ServiceError) {
        return res.status(e.status).json({ error: e.message });
    }
    throw e;
}

// A LinkedIn export is a few hundred KB of CSV, past the app-wide JSON limit,
// so this route reads the body as text with its own ceiling.
const csvBody = express.text({
    type: ["text/csv", "text/plain"],
    limit: "5mb",
});

// Own data only: there is no admin view of someone else's network.
router.get("/", (req, res) => {
    try {
        res.json(
            svc.listConnections(req.userEmail, {
                company: req.query.company,
                query: req.query.query,
                limit: req.query.limit,
                offset: req.query.offset,
            }),
        );
    } catch (e) {
        handleError(res, e);
    }
});

router.get("/for-application/:id", (req, res) => {
    try {
        res.json(svc.connectionsForApplication(req.userEmail, req.params.id));
    } catch (e) {
        handleError(res, e);
    }
});

router.post("/import", csvBody, (req, res) => {
    try {
        res.json(svc.importConnections(req.userEmail, req.body));
    } catch (e) {
        handleError(res, e);
    }
});

router.post("/:id/promote", (req, res) => {
    try {
        res.status(201).json(
            svc.promoteConnection(req.userEmail, req.params.id, {
                application_id: req.body?.application_id ?? null,
                relation: req.body?.relation ?? null,
            }),
        );
    } catch (e) {
        handleError(res, e);
    }
});

router.delete("/", (req, res) => {
    try {
        res.json(svc.clearConnections(req.userEmail));
    } catch (e) {
        handleError(res, e);
    }
});

module.exports = router;
