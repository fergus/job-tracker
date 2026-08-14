"use strict";

const express = require("express");
const svc = require("../services/contacts");

const router = express.Router();

function handleError(res, e) {
    if (e instanceof svc.ServiceError) {
        return res.status(e.status).json({ error: e.message });
    }
    throw e;
}

// Admins may read any user's contacts but never write them, matching the
// existing read-only admin model for applications.
function denyAdminWrite(req, res) {
    if (req.isAdmin && req.query.all === "true") {
        res.status(403).json({ error: "Admins cannot modify other users' data" });
        return true;
    }
    return false;
}

router.get("/", (req, res) => {
    try {
        res.json(
            svc.listContacts(req.userEmail, {
                all: req.query.all,
                isAdmin: req.isAdmin,
            }),
        );
    } catch (e) {
        handleError(res, e);
    }
});

router.get("/:id", (req, res) => {
    try {
        res.json(
            svc.getContact(req.userEmail, req.params.id, {
                isAdmin: req.isAdmin && req.query.all === "true",
            }),
        );
    } catch (e) {
        handleError(res, e);
    }
});

router.post("/", (req, res) => {
    try {
        if (denyAdminWrite(req, res)) return;
        res.status(201).json(svc.createContact(req.userEmail, req.body));
    } catch (e) {
        handleError(res, e);
    }
});

router.put("/:id", (req, res) => {
    try {
        res.json(svc.updateContact(req.userEmail, req.params.id, req.body));
    } catch (e) {
        handleError(res, e);
    }
});

router.delete("/:id", (req, res) => {
    try {
        res.json(svc.deleteContact(req.userEmail, req.params.id));
    } catch (e) {
        handleError(res, e);
    }
});

router.post("/:id/links", (req, res) => {
    try {
        res.status(201).json(
            svc.linkContact(
                req.userEmail,
                req.params.id,
                req.body.application_id,
                req.body.relation,
            ),
        );
    } catch (e) {
        handleError(res, e);
    }
});

router.delete("/:id/links/:applicationId", (req, res) => {
    try {
        res.json(
            svc.unlinkContact(
                req.userEmail,
                req.params.id,
                req.params.applicationId,
            ),
        );
    } catch (e) {
        handleError(res, e);
    }
});

module.exports = router;
