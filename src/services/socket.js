const socket = require("socket.io");
const Chat = require("../models/chat");
const jwt = require("jsonwebtoken");
const Message = require("../models/message");
const config = require("../config/index")
const logger = require("../utils/logger");

let ioInstance = null;

const initializeSocket = (server) => {
    const allowedOrigins = [
        "http://localhost:5173",
        config.general.frontendUrl,
    ].filter(Boolean);

    const io = socket(server, {
        cors: {
            origin: allowedOrigins,
            credentials: true
        }
    });

    ioInstance = io;

    io.use((socketClient, next) => {
        try {
            let token = socketClient.handshake.auth?.token;
            const cookieStr = socketClient.handshake.headers?.cookie;

            if (!token && cookieStr) {
                const match = cookieStr.match(/(?:^|;\s*)token=([^;]*)/);
                if (match) {
                    token = decodeURIComponent(match[1]);
                }
            }

            if (!token) {
                logger.warn("Socket auth failed: token missing");
                return next(new Error("Authentication error: Token missing"));
            }

            const user = jwt.verify(token, config.auth.jwtSecret);
            socketClient.user = user;
            next();
        } catch (error) {
            logger.warn("Socket auth failed", { error: error?.message || error });
            next(new Error("Authentication error"));
        }
    });

    io.on("connection", (socketClient) => {
        socketClient.on("joinChat", (chatId) => {
            socketClient.join(chatId);
        });

        socketClient.on("sendMessage", async ({ chatId, text }) => {
            try {
                const userId = socketClient.user._id;
                const chat = await Chat.findById(chatId);

                if (!chat) {
                    return;
                }

                const isParticipant = chat.participants.some(
                    (participantId) => participantId.toString() === userId.toString()
                );

                if (!isParticipant) {
                    return;
                }

                const message = await Message.create({
                    chatId,
                    senderId: userId,
                    text
                });

                await Chat.findByIdAndUpdate(chatId, {
                    lastMessage: message._id
                });

                io.to(chatId).emit("messageReceived", message);
            } catch (error) {
                logger.error("Socket sendMessage failed", { error: error?.message || error });
            }
        });

        socketClient.on("typing", (chatId) => {
            socketClient.to(chatId).emit("typing", {
                userId: socketClient.user._id
            });
        });

        socketClient.on("stopTyping", (chatId) => {
            socketClient.to(chatId).emit("stopTyping", {
                userId: socketClient.user._id
            });
        });

        socketClient.on("markSeen", async ({ chatId }) => {
            const userId = socketClient.user._id;

            await Message.updateMany(
                {
                    chatId,
                    readBy: { $ne: userId }
                },
                {
                    $addToSet: { readBy: userId }
                }
            );

            io.to(chatId).emit("messagesSeen", {
                userId
            });
        });

        socketClient.on("disconnect", () => { });
    });
};

const getIO = () => ioInstance;

module.exports = { initializeSocket, getIO };
