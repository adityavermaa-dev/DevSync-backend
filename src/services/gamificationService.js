const User = require("../models/user");
const Activity = require("../models/activity");
const UserBadge = require("../models/userBadge");

const awardBadge = async (userId, badgeType) => {
    try {
        const existingBadge = await UserBadge.findOne({ userId, badgeType });
        if (!existingBadge) {
            await UserBadge.create({ userId, badgeType });
            // Here you could integrate Sockets or Push Notifications
            console.log(`User ${userId} earned badge: ${badgeType}`);
        }
    } catch (error) {
        console.error("Error awarding badge:", error);
    }
};

const trackUserActivity = async (userId) => {
    try {
        const user = await User.findById(userId);
        if (!user) return;

        const now = new Date();
        // Truncate to start of today (YYYY-MM-DD)
        const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
        
        let activity = await Activity.findOne({ userId, date: today });
        if (activity) {
            // Already active today, just increment count
            activity.count += 1;
            await activity.save();
            return user.currentStreak; // Streak already maintained today
        }

        // New activity for today
        await Activity.create({ userId, date: today, count: 1 });

        const yesterday = new Date(today);
        yesterday.setUTCDate(yesterday.getUTCDate() - 1);

        let newStreak = 1;
        if (user.lastActivityAt) {
            const lastActivityDay = new Date(
                Date.UTC(
                    user.lastActivityAt.getUTCFullYear(),
                    user.lastActivityAt.getUTCMonth(),
                    user.lastActivityAt.getUTCDate()
                )
            );

            if (lastActivityDay.getTime() === yesterday.getTime()) {
                newStreak = user.currentStreak + 1;
            } else if (lastActivityDay.getTime() < yesterday.getTime()) {
                newStreak = 1;
            } else {
                newStreak = user.currentStreak;
            }
        }

        user.currentStreak = newStreak;
        if (user.currentStreak > user.longestStreak) {
            user.longestStreak = user.currentStreak;
        }
        user.lastActivityAt = now;
        await user.save();

        // Check gamification milestones
        if (user.currentStreak >= 7) await awardBadge(userId, "7_DAY_STREAK");
        if (user.currentStreak >= 30) await awardBadge(userId, "30_DAY_STREAK");
        if (user.currentStreak >= 100) await awardBadge(userId, "100_DAY_STREAK");

        return newStreak;
    } catch (error) {
        console.error("Failed to track activity:", error);
    }
};

module.exports = { trackUserActivity, awardBadge };
