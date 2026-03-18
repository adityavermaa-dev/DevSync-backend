const socket = require("socket.io");
const Chat = require("../models/chat");

const initializeSocket = (server) => {
    const io = socket(server, {
        cors: {
            origin: "http://localhost:5173"
        }
    })

    io.on("connection", (socket) => {
        socket.on("joinChat", (chatId) => {
            socket.join(chatId);
        })
        socket.on("sendMessage", async ({ firstName, userId, targetUserId, text }) => {
            try {
                const roomId = [userId, targetUserId].sort().join("A");

                let chat = await Chat.findOne({
                    participants : {$all : [userId,targetUserId]}
                })

                if(!chat){
                    chat = new Chat({
                        participants : [userId,targetUserId],
                        messages : []
                    })
                }

                chat.messages.push({
                    senderId : userId,
                    text
                })

                await chat.save();
                io.to(roomId).emit("messageReceived", { firstName, text });
            } catch (error) {
                console.log(error.message)
            }
        })
        socket.on("disconnect", () => { })
    })
}

module.exports = initializeSocket;