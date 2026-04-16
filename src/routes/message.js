const { userAuth } = require("../middlewares/auth");
const Chat = require("../models/chat");
const Message = require("../models/message");
const { getIO } = require("../services/socket");
const AppError = require("../utils/AppError");
const { trackUserActivity } = require("../services/gamificationService");

const express = require("express");

const messageRouter = express.Router();

messageRouter.get("/messages/:chatId", userAuth, async (req, res, next) => {
    try {
        const { chatId } = req.params;
        const page = Number(req.query.page) || 1;
        const limit = Number(req.query.limit) || 20;
        const userId = req.user._id;

        const chat = await Chat.findOne({ _id: chatId, participants: userId });
        if (!chat) {
            return next(new AppError("Not allowed", 403));
        }

        const messages = await Message.find({ chatId })
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit);

        res.json(messages);
    } catch (error) {
        next(new AppError(error.message, 400));
    }
});

messageRouter.post("/send/message", userAuth, async (req, res, next) => {
    try {
        const { chatId, text } = req.body;
        const senderId = req.user._id;

        if (!chatId) {
            return next(new AppError("chatId is required", 400));
        }
        if (!text) {
            return next(new AppError("Message is required", 400));
        }

        const chat = await Chat.findOne({ _id: chatId, participants: senderId });
        if (!chat) {
            return next(new AppError("Not allowed", 403));
        }

        const message = await Message.create({
            chatId,
            senderId,
            text
        });

        await Chat.findByIdAndUpdate(chatId, {
            lastMessage: message._id
        });

        await trackUserActivity(req.user._id);

        const io = getIO();
        if (io) {
            io.to(chatId.toString()).emit("messageReceived", message);
        }

        res.json({ message });
    } catch (error) {
        next(new AppError(error.message, 400));
    }
});

messageRouter.put("/edit/message/:messageId", userAuth, async (req, res, next) => {
    try {
        const { messageId } = req.params;
        const userId = req.user._id;
        const { text } = req.body;

        if (!text) {
            return next(new AppError("Message is required", 400));
        }

        const message = await Message.findOneAndUpdate(
            { _id: messageId, senderId: userId, isDeleted: false },
            { text, isEdited: true },
            { new: true }
        );

        if (!message) {
            return next(new AppError("Not allowed", 403));
        }

        res.json({ message });
    } catch (error) {
        next(new AppError(error.message, 400));
    }
});

messageRouter.delete("/delete/message/:messageId", userAuth, async (req, res, next) => {
    try {
        const { messageId } = req.params;

        const message = await Message.findOneAndUpdate(
            { _id: messageId, senderId: req.user._id },
            { text: "", isDeleted: true },
            { new: true }
        );

        if (!message) {
            return next(new AppError("Not allowed", 403));
        }

        res.json({ message });
    } catch (error) {
        next(new AppError(error.message, 400));
    }
});

module.exports = messageRouter;

