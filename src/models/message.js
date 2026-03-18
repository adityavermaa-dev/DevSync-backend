const mongoose = require("mongoose")

const messageSchema = new mongoose.Schema({
    chatId : {
        type : mongoose.Schema.Types.ObjectId,
        required : true,
        ref : "Chat",
        index : true,
    },
    senderId : {
        type : mongoose.Schema.Types.ObjectId,
        ref : "User",
        required : true
    },
    text : {
        type : String,
        required : true
    },
    isEdited : {
        type : Boolean,
        default : false
    },
    isDeleted : {
        type : Boolean,
        default : false
    }
},{timestamps : true})

const Message = mongoose.model("Message",messageSchema);

module.exports = Message;
