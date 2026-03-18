const { userAuth } = require("../middlewares/auth");
const Chat = require("../models/chat");
const Message = require("../models/message");

const express = require(express)

const messageRouter = express.router();

messageRouter.get("/messages/:chatId",async(req,res) => {
    const chatId = req.params;
    const { page = 1, limit = 20} = req.query;

    const messages = Message.find({chatId})
    .sort({createdAt : -1})
    .skip((page -1) * limit)
    .limit(Number(limit));

    res.json(messages);
})

messageRouter.post("/send/message", userAuth, async (req, res) => {
    const { chatId, text } = req.body;
    const senderId = req.user._id;

    if (!text) {
        return res.status(400).json({ message: "Message is required" })
    }

    const message = await Message.create({
        chatId,
        senderId,
        text
    })

    await Chat.findByIdAndUpdate(chatId, {
        lastMessage: message._id
    })

    res.json({ message });
})

messageRouter.put("/edit/message/:messageId", userAuth, async (req, res) => {
    const messageId = req.params;
    const userId = req.user._id;
    const text = req.body;

    const message = Message.findOneAndUpdate(
        { _id: messageId, senderId: userId },
        {text : text,isEdited : true},
        {new : true}
    )

    if(!message){
        return res.json(403).json({message : "Not allowed"})
    }

    res.json({message})
})

messageRouter.delete("/delete/message/:messageId",async(req,res) => {
    const messageId = req.params;

    const message =await Message.findOneAndUpdate(
        {_id : messageId , senderId : req.user._id},
        {text : "",isDeleted : true},
        {new : true}
    )
    
    res.json({message});
})

