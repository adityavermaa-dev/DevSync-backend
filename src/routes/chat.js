const Chat = require("../models/chat");

const express = require(express)

const chatRouter = express.router();

chatRouter.get("/chats/:targetUserId",userAuth,async(req,res) => {
    const targetUserId = req.params;
    const userId = req.user._id;

    try {
        let chat = await Chat.findOne({
            participants : {$all : [userId,targetUserId]}
        });

        if(!chat){
            chat = new Chat({
                participants : [userId,targetUserId],
                messages : []
            })
        }

        await chat.save();
        res.json({chat});
    } catch (error) {
        res.status(404).json({message : error.message})
    }
})


chatRouter.patch("/edit/message/:messageId",userAuth,(req,res) => {
    try {
        const messageId = req.params;
        
    } catch (error) {
        
    }
})