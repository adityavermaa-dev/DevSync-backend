const mongoose = require("mongoose");

const activitySchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        date: {
            type: Date, // Truncated to YYYY-MM-DD
            required: true,
        },
        count: {
            type: Number,
            default: 1,
        },
    },
    { timestamps: true }
);

// Only one activity record per user per day
activitySchema.index({ userId: 1, date: 1 }, { unique: true });

const Activity = mongoose.model("Activity", activitySchema);
module.exports = Activity;
