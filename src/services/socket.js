const socket = require("socket.io");
const Chat = require("../models/chat");
const jwt = require("jsonwebtoken");
const Message = require("../models/message");
const config = require("../config/index")
const logger = require("../utils/logger");

let ioInstance = null;

// In-memory presence (online/offline) tracking.
// NOTE: This resets when the server restarts. Good enough for MVP presence.
const onlineUsers = new Map(); // userId -> Set(socketId)
const socketToUser = new Map(); // socketId -> userId

const normalizeId = (id) => (id === undefined || id === null ? "" : String(id));

const isUserOnline = (userId) => {
    const key = normalizeId(userId);
    const sockets = onlineUsers.get(key);
    return Boolean(sockets && sockets.size > 0);
};

const upsertOnlineSocket = (userId, socketId) => {
    const userKey = normalizeId(userId);
    const socketKey = normalizeId(socketId);
    if (!userKey || !socketKey) return { becameOnline: false };

    const wasOnline = isUserOnline(userKey);
    const sockets = onlineUsers.get(userKey) || new Set();
    sockets.add(socketKey);
    onlineUsers.set(userKey, sockets);
    socketToUser.set(socketKey, userKey);
    return { becameOnline: !wasOnline };
};

const removeOnlineSocket = (socketId) => {
    const socketKey = normalizeId(socketId);
    const userKey = socketToUser.get(socketKey);
    if (!userKey) return { userId: null, becameOffline: false };

    socketToUser.delete(socketKey);
    const sockets = onlineUsers.get(userKey);
    if (!sockets) return { userId: userKey, becameOffline: false };

    sockets.delete(socketKey);
    if (sockets.size === 0) {
        onlineUsers.delete(userKey);
        return { userId: userKey, becameOffline: true };
    }

    onlineUsers.set(userKey, sockets);
    return { userId: userKey, becameOffline: false };
};

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
        const currentUserId = normalizeId(socketClient.user?._id);

        // Join a per-user room for targeted emits (handy for notifications).
        if (currentUserId) {
            socketClient.join(`user:${currentUserId}`);
        }

        // Presence: mark online and notify watchers.
        const { becameOnline } = upsertOnlineSocket(currentUserId, socketClient.id);
        if (becameOnline) {
            io.to(`watch:${currentUserId}`).emit("presence:update", {
                userId: currentUserId,
                online: true
            });
        }

        // Allows the client to watch another user's presence.
        // Recommended flow: when user opens a 1-1 chat, call watchUser({ userId: otherUserId }).
        socketClient.on("watchUser", async ({ userId: targetUserId } = {}, ack) => {
            try {
                const watcherId = normalizeId(socketClient.user?._id);
                const targetId = normalizeId(targetUserId);

                if (!targetId) {
                    if (typeof ack === "function") ack({ ok: false, message: "userId is required" });
                    return;
                }

                // Basic authorization: only allow watching users you share a chat with (or yourself).
                if (watcherId !== targetId) {
                    const hasChat = await Chat.exists({ participants: { $all: [watcherId, targetId] } });
                    if (!hasChat) {
                        if (typeof ack === "function") ack({ ok: false, message: "Not allowed" });
                        return;
                    }
                }

                socketClient.join(`watch:${targetId}`);

                if (typeof ack === "function") {
                    ack({ ok: true, userId: targetId, online: isUserOnline(targetId) });
                } else {
                    socketClient.emit("presence:list", [{ userId: targetId, online: isUserOnline(targetId) }]);
                }
            } catch (error) {
                logger.error("Socket watchUser failed", { error: error?.message || error });
                if (typeof ack === "function") ack({ ok: false, message: "Internal error" });
            }
        });

        socketClient.on("unwatchUser", ({ userId: targetUserId } = {}, ack) => {
            const targetId = normalizeId(targetUserId);
            if (targetId) {
                socketClient.leave(`watch:${targetId}`);
            }
            if (typeof ack === "function") ack({ ok: true });
        });

        // Convenience: get online statuses for a list of users.
        socketClient.on("presence:get", ({ userIds } = {}, ack) => {
            const ids = Array.isArray(userIds) ? userIds.map(normalizeId).filter(Boolean) : [];
            const payload = ids.map((id) => ({ userId: id, online: isUserOnline(id) }));
            if (typeof ack === "function") ack({ ok: true, users: payload });
            else socketClient.emit("presence:list", payload);
        });

        socketClient.on("joinChat", async (chatId, ack) => {
            try {
                const userId = normalizeId(socketClient.user?._id);
                const chat = await Chat.findById(chatId);

                if (!chat) {
                    if (typeof ack === "function") ack({ ok: false, message: "Chat not found" });
                    return;
                }

                const isParticipant = chat.participants.some(
                    (participantId) => participantId.toString() === userId.toString()
                );

                if (!isParticipant) {
                    if (typeof ack === "function") ack({ ok: false, message: "Not allowed" });
                    return;
                }

                socketClient.join(chatId);

                // Auto-watch and push presence list for other chat participants.
                const otherUserIds = chat.participants
                    .map((p) => normalizeId(p))
                    .filter((id) => id && id !== userId);

                for (const otherId of otherUserIds) {
                    socketClient.join(`watch:${otherId}`);
                }

                const presence = otherUserIds.map((id) => ({ userId: id, online: isUserOnline(id) }));
                socketClient.emit("presence:list", presence);

                if (typeof ack === "function") ack({ ok: true });
            } catch (error) {
                logger.error("Socket joinChat failed", { error: error?.message || error });
                if (typeof ack === "function") ack({ ok: false, message: "Internal error" });
            }
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

        socketClient.on("disconnect", () => {
            const { userId, becameOffline } = removeOnlineSocket(socketClient.id);
            if (becameOffline && userId) {
                io.to(`watch:${userId}`).emit("presence:update", {
                    userId,
                    online: false
                });
            }
        });
    });
};

const getIO = () => ioInstance;

module.exports = { initializeSocket, getIO, isUserOnline };
