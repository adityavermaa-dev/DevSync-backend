const express = require("express");
const { userAuth } = require("../middlewares/auth")
const ConnectionRequest = require("../models/connectionRequest");
const User = require("../models/user");
const sendMail = require("../utils/sendEmail");

const requestRouter = express.Router();

requestRouter.post("/request/send/:status/:toUserId", userAuth, async (req, res) => {
    try {
        const fromUserId = req.user._id;
        const toUserId = req.params.toUserId;
        const status = req.params.status;
        const toUserEmail = await User.findOne({ _id: toUserId });
        const allowedStatus = ["interested", "ignored"];

        if (!allowedStatus.includes(status.toLowerCase())) {
            return res.status(400).json({ message: `${status} is not allowed here` })
        }

        const isValidToUser = await User.findById(toUserId);

        if (!isValidToUser) {
            return res.status(400).json({ message: "User not found" })
        }

        const existedRequest = await ConnectionRequest.findOne({
            $or: [
                { fromUserId, toUserId },
                { fromUserId: toUserId, toUserId: fromUserId }
            ]
        })

        if (existedRequest) {
            return res.status(400).json({ message: `Request already exist` })
        }

        const request = new ConnectionRequest({
            fromUserId,
            toUserId,
            status
        })

        await request.save();


        await sendMail(
            toUserEmail,
            "Connection Request",
            `${req.user.firstName} sent you a connection request`,
            `<h1>Welcome</h1>
   <p>${req.user.firstName} sent you a connection request</p>`
        );
        res.status(200).send("Connection request send successfully")

    } catch (error) {
        res.status(400).send("Err : " + error.message)
    }
})

requestRouter.post("/request/review/:status/:requestId", userAuth, async (req, res) => {
    const loggedInUser = req.user;
    const { status, requestId } = req.params;

    const allowedStatus = ["accepted", "rejected"];
    if (!allowedStatus.includes(status.toLowerCase())) {
        return res.status(400).json({ message: "Status is nor valid" });
    }

    const connectionRequest = await ConnectionRequest.findOne({
        _id: requestId,
        toUserId: loggedInUser,
        status: "interested"
    })

    if (!connectionRequest) {
        return res.status(400).json({ message: "Connection request not find" });
    }

    connectionRequest.status = status;
    const data = await connectionRequest.save();

    res.json({ message: "Connection request " + status, data });
})

module.exports = requestRouter;