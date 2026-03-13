const socket = require("socket.io");

const initializeSocket = (server) => {
    const io = socket(server,{
        cors : {
            origin : "http://localhost:5173"
        }
    })

    io.on("connection",(socket) => {
        socket.on("joinChat",({userId,targetUserId}) => {
            const roomId = [userId,targetUserId].sort().join("A");
            socket.join(roomId);
        })
        socket.on("sendMessage",() => {})
        socket.on("disconnect",() => {})
    })
}

module.exports = initializeSocket;