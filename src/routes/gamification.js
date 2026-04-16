const express = require("express");
const { userAuth } = require("../middlewares/auth"); // Assuming this exists
const Activity = require("../models/activity");
const UserBadge = require("../models/userBadge");
const { trackUserActivity } = require("../services/gamificationService");

const gamificationRouter = express.Router();

/**
 * Route to manually hit and log user activity (e.g. from frontend once a day or on login/event)
 */
gamificationRouter.post("/activity", userAuth, async (req, res) => {
    try {
        const streak = await trackUserActivity(req.user._id);
        res.json({ message: "Activity logged out", currentStreak: streak });
    } catch (error) {
        res.status(500).json({ error: "Failed to sync activity" });
    }
});

/**
 * Route to get 365 day activity matrix for the contribution graph
 */
gamificationRouter.get("/activity", userAuth, async (req, res) => {
    try {
        const pastYear = new Date();
        pastYear.setUTCDate(pastYear.getUTCDate() - 365);
        
        const activities = await Activity.find({
            userId: req.user._id,
            date: { $gte: pastYear }
        }).sort({ date: 1 });

        // Retrieve streak stats from user
        const { currentStreak, longestStreak } = req.user;

        // Retrieve badges
        const badges = await UserBadge.find({ userId: req.user._id });

        res.json({
            activities,
            currentStreak,
            longestStreak,
            badges
        });
    } catch (error) {
        res.status(500).json({ error: "Failed to retrieve activity stats" });
    }
});

module.exports = gamificationRouter;
