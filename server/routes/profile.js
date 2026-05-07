const express = require("express");
const db = require("../db");
const { isValidUrl } = require("../lib/validation");
const requireOAuth = require("../middleware/requireOAuth");

const router = express.Router();

const ALLOWED_FIELDS = [
    "full_name",
    "location_city",
    "location_country",
    "target_roles",
    "compensation_currency",
    "compensation_target_range",
    "linkedin_url",
    "portfolio_url",
    "agent_tone",
    "agent_emphasize",
    "agent_avoid",
    "cv_markdown",
    "career_narrative",
    "agent_instructions",
];

// GET /api/me/profile — return own profile
router.get("/me/profile", (req, res) => {
    const profile = db
        .prepare("SELECT * FROM user_profiles WHERE user_email = ?")
        .get(req.userEmail);
    if (!profile) {
        return res.status(404).json({ error: "Profile not found" });
    }
    res.json(profile);
});

// PUT /api/me/profile — update own profile (OAuth only, partial updates)
router.put("/me/profile", requireOAuth, (req, res) => {
    const updates = [];
    const values = [];

    for (const field of ALLOWED_FIELDS) {
        if (req.body[field] !== undefined) {
            if (
                (field === "linkedin_url" || field === "portfolio_url") &&
                !isValidUrl(req.body[field])
            ) {
                return res
                    .status(400)
                    .json({
                        error: `${field} must be a valid http or https URL`,
                    });
            }
            updates.push(`${field} = ?`);
            values.push(req.body[field]);
        }
    }

    if (updates.length === 0) {
        return res.status(400).json({ error: "No valid fields to update" });
    }

    updates.push("updated_at = ?");
    values.push(new Date().toISOString());
    values.push(req.userEmail);

    db.prepare(
        `UPDATE user_profiles SET ${updates.join(", ")} WHERE user_email = ?`,
    ).run(...values);

    const profile = db
        .prepare("SELECT * FROM user_profiles WHERE user_email = ?")
        .get(req.userEmail);
    res.json(profile);
});

// GET /api/users/:email/profile — admin read-only
router.get("/users/:email/profile", (req, res) => {
    if (!req.isAdmin) {
        return res.status(403).json({ error: "Admin access required" });
    }

    const email = req.params.email.toLowerCase();
    const profile = db
        .prepare("SELECT * FROM user_profiles WHERE user_email = ?")
        .get(email);
    if (!profile) {
        return res.status(404).json({ error: "Profile not found" });
    }

    console.info("[admin] %s viewed profile for %s", req.userEmail, email);
    res.json(profile);
});

module.exports = router;
