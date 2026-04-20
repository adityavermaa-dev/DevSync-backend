const express = require('express');
const { userAuth } = require('../middlewares/auth');
const ConnectionRequest = require('../models/connectionRequest');
const userRouter = express.Router();
const User = require("../models/user")
const AppError = require("../utils/AppError")

userRouter.get("/user/request/received",userAuth,async(req,res,next) => {
    try {
        const loggedInUser = req.user;
        const connectionRequests = await ConnectionRequest.find({
            toUserId : loggedInUser._id,
            status : "interested"
        }).populate("fromUserId","firstName lastName age gender photoUrl coverPhotoUrl about skills")

        res.json({message : "Fetched received requests successfully",connectionRequests});
    } catch (error) {
        next(new AppError(error.message, 400));
    }
})


userRouter.get("/user/connections",userAuth,async(req,res,next) => {
    try {
        const loggedInUser = req.user;
        const connections = await ConnectionRequest.find({
            $or:[{toUserId : loggedInUser._id},{fromUserId : loggedInUser._id}],
            status : "accepted"
        })
        .populate("fromUserId","firstName lastName age gender photoUrl coverPhotoUrl about skills")
        .populate("toUserId","firstName lastName age gender photoUrl coverPhotoUrl about skills")

        const data = connections.map(row => {
            if(row.fromUserId._id.equals(loggedInUser._id)){
                return row.toUserId;
            }
            return row.fromUserId;
        })


        res.json({message : "Connections fetched successfully",data})

    } catch (error) {
        next(new AppError(error.message, 400))
    }

    
})

userRouter.get("/user/feed", userAuth, async(req,res,next) => {
    try {
        const loggedInUser = req.user;
        const page = Number.parseInt(req.query.page, 10) || 1;
        const limit = Number.parseInt(req.query.limit, 10) || 10;
        const skip = (page - 1) * limit;

        const connectionRequests = await ConnectionRequest.find({
            $or : [{ fromUserId : loggedInUser._id }, { toUserId : loggedInUser._id }]
        }).select("fromUserId toUserId");

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
            .limit(limit);

        res.json({
            message : "This is your feed",
            feed
        });
    } catch (error) {
        next(new AppError(error.message, 400));
    }
});

module.exports = userRouter;


