const mongoose = require("mongoose");

const userBadgeSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        badgeType: {
            type: String, // e.g., "100_DAY_STREAK", "FIRST_BLOOD"
            required: true,
        },
        earnedAt: {
            type: Date,
            default: Date.now,
        },
    },
    { timestamps: true }
);

// Prevent user from earning the exact same badge multiple times if needed (optional)
userBadgeSchema.index({ userId: 1, badgeType: 1 }, { unique: true });

const UserBadge = mongoose.model("UserBadge", userBadgeSchema);
module.exports = UserBadge;
