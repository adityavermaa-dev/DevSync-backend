const express = require("express");
const { userAuth } = require("../middlewares/auth")
const ConnectionRequest = require("../models/connectionRequest");
const User = require("../models/user");
const AppError = require("../utils/AppError");
const logger = require("../utils/logger");


const requestRouter = express.Router();

requestRouter.post("/request/send/:status/:toUserId", userAuth, async (req, res, next) => {
    try {
        const fromUserId = req.user._id;
        const toUserId = req.params.toUserId;
        const status = req.params.status;
        const toUserEmail = await User.findOne({ _id: toUserId });
        const allowedStatus = ["interested", "ignored"];

        if (!allowedStatus.includes(status.toLowerCase())) {
            return next(new AppError(`${status} is not allowed here`, 400));
        }

        const isValidToUser = await User.findById(toUserId);

        if (!isValidToUser) {
            return next(new AppError("User not found", 400));
        }

        const existedRequest = await ConnectionRequest.findOne({
            $or: [
                { fromUserId, toUserId },
                { fromUserId: toUserId, toUserId: fromUserId }
            ]
        })

        if (existedRequest) {
            return next(new AppError("Request already exist", 400));
        }

        const request = new ConnectionRequest({
            fromUserId,
            toUserId,
            status
        })

        await request.save();
        logger.info("Connection request created", {
            fromUserId,
            toUserId,
            status,
        });

//         await sendMail(
//             toUserEmail.email,
//             "Connection Request",
//             `${req.user.firstName} sent you a connection request`,
//             `<h1>Welcome</h1>
//    <p>${req.user.firstName} sent you a connection request</p>`
//         );
//         res.status(200).send("Connection request send successfully")

    } catch (error) {
        next(new AppError(error.message, 400))
    }
})

requestRouter.post("/request/review/:status/:requestId", userAuth, async (req, res, next) => {
    try {
        const loggedInUser = req.user;
        const { status, requestId } = req.params;

        const allowedStatus = ["accepted", "rejected"];
        if (!allowedStatus.includes(status.toLowerCase())) {
            return next(new AppError("Status is nor valid", 400));
        }

        const connectionRequest = await ConnectionRequest.findOne({
            _id: requestId,
            toUserId: loggedInUser,
            status: "interested"
        })

        if (!connectionRequest) {
            return next(new AppError("Connection request not find", 400));
        }

        connectionRequest.status = status;
        const data = await connectionRequest.save();

        res.json({ message: "Connection request " + status, data });
    } catch (error) {
        next(error);
    }
})

module.exports = requestRouter;