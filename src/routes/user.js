const express = require('express');
const { userAuth } = require('../middlewares/auth');
const ConnectionRequest = require('../models/connectionRequest');
const userRouter = express.Router();
const User = require("../models/user")
const AppError = require("../utils/AppError")
const { validateObjectId } = require("../middlewares/validation");
const redisClient = require('../utils/redis');
const MAX_FEED_LIMIT = 50;

const addGithubProfile = (user) => {
    if (!user) {
        return user;
    }

    const plainUser = typeof user.toObject === 'function' ? user.toObject() : { ...user };

    return {
        ...plainUser,
        githubUrl: plainUser.githubUsername ? `https://github.com/${plainUser.githubUsername}` : null
    };
};

const getPublicUserProfile = async (req, res, next) => {
    try {
        const user = await User.findById(req.params.userId)
            .select("firstName lastName age gender photoUrl coverPhotoUrl about skills githubUsername githubId")
            .lean();

        if (!user) {
            return next(new AppError("User not found", 404));
        }

        res.json({ user: addGithubProfile(user) });
    } catch (error) {
        next(new AppError(error.message, 400));
    }
};

userRouter.get("/user/request/received",userAuth,async(req,res,next) => {
    try {
        const loggedInUser = req.user;
        const connectionRequests = await ConnectionRequest.find({
            toUserId : loggedInUser._id,
            status : "interested"
        }).populate("fromUserId","firstName lastName age gender photoUrl coverPhotoUrl about skills").lean();

        res.json({message : "Fetched received requests successfully",connectionRequests});
    } catch (error) {
        next(new AppError(error.message, 400));
    }
})


userRouter.get("/user/connections",userAuth,async(req,res,next) => {
    try {
        const loggedInUser = req.user;
        const cacheKey = `connections:${loggedInUser._id}`;
        const cachedConnections = await redisClient.get(cacheKey).catch(() => null);

        if (cachedConnections) {
            return res.json({
                message: "Connections fetched successfully (cached)",
                data: JSON.parse(cachedConnections)
            });
        }

        const connections = await ConnectionRequest.find({
            $or:[{toUserId : loggedInUser._id},{fromUserId : loggedInUser._id}],
            status : "accepted"
        })
        .populate("fromUserId","firstName lastName age gender photoUrl coverPhotoUrl about skills")
        .populate("toUserId","firstName lastName age gender photoUrl coverPhotoUrl about skills")
        .lean();

        const data = connections.reduce((acc, row) => {
            const fromUser = row.fromUserId;
            const toUser = row.toUserId;

            if (!fromUser || !toUser) {
                return acc;
            }

            if (fromUser._id.equals(loggedInUser._id)) {
                acc.push(toUser);
                return acc;
            }

            acc.push(fromUser);
            return acc;
        }, []);

        await redisClient.setEx(cacheKey, 300, JSON.stringify(data)).catch(() => {});

        res.json({message : "Connections fetched successfully",data})

    } catch (error) {
        next(new AppError(error.message, 400))
    }

    
})

userRouter.get("/user/feed", userAuth, async(req,res,next) => {
    try {
        const loggedInUser = req.user;
        const rawPage = req.query.page ?? "1";
        const rawLimit = req.query.limit ?? "10";
        const page = Number.parseInt(rawPage, 10);
        const limit = Number.parseInt(rawLimit, 10);

        if (!Number.isInteger(page) || page < 1) {
            return next(new AppError("Page must be a positive integer", 400));
        }

        if (!Number.isInteger(limit) || limit < 1) {
            return next(new AppError("Limit must be a positive integer", 400));
        }

        const cappedLimit = Math.min(limit, MAX_FEED_LIMIT);
        const skip = (page - 1) * cappedLimit;

        const cacheKey = `feed:${loggedInUser._id}:${page}:${cappedLimit}`;
        const cachedFeed = await redisClient.get(cacheKey).catch(() => null);

        if (cachedFeed) {
            return res.json({
                message: "This is your feed (cached)",
                feed: JSON.parse(cachedFeed)
            });
        }

        const connectionRequests = await ConnectionRequest.find({
            $or : [{ fromUserId : loggedInUser._id }, { toUserId : loggedInUser._id }]
        }).select("fromUserId toUserId").lean();

        const hiddenUsersFromFeed = new Set();
        connectionRequests.forEach((request) => {
            hiddenUsersFromFeed.add(request.fromUserId.toString());
            hiddenUsersFromFeed.add(request.toUserId.toString());
        });

        const feed = await User.find({
            $and : [
                { _id : { $nin : Array.from(hiddenUsersFromFeed) } },
                { _id : { $ne : loggedInUser._id } }
            ]
        })
            .select("firstName lastName age gender photoUrl coverPhotoUrl about skills")
            .skip(skip)
            .limit(cappedLimit)
            .lean();

        await redisClient.setEx(cacheKey, 60, JSON.stringify(feed)).catch(() => {});

        res.json({
            message : "This is your feed",
            feed
        });
    } catch (error) {
        next(new AppError(error.message, 400));
    }
});

userRouter.get("/user/:userId", validateObjectId('userId'), getPublicUserProfile);
userRouter.get("/user/view/:userId", validateObjectId('userId'), getPublicUserProfile);
userRouter.get("/user/profile/:userId", validateObjectId('userId'), getPublicUserProfile);
userRouter.get("/user/public/:userId", validateObjectId('userId'), getPublicUserProfile);
userRouter.get("/users/:userId", validateObjectId('userId'), getPublicUserProfile);
userRouter.get("/users/view/:userId", validateObjectId('userId'), getPublicUserProfile);
userRouter.get("/users/profile/:userId", validateObjectId('userId'), getPublicUserProfile);

module.exports = userRouter;


