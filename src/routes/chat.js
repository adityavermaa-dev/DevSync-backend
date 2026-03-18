const express = require("express");
const chatRouter = express.Router();

chatRouter.post("/create/chat",userAuth,async(req,res) => {
    const { participants } = req.body;

    const chat = await Chat.create({
        participants
    })

    res.json(chat);
})

chatRouter.get("get/chats",userAuth,async(req,res) => {
    const userId = req.user._id;

    const chats = await Chat.find({
        participants: userId
    })
    .populate("lastMessage")
    .populate("participandts","firstName")

    res.json(chats)
})