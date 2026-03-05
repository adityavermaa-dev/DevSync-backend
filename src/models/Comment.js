const mongoose = require("mongoose")

const commentSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    videoId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Video",
        required: true
    },
    text : {
        type : String,
        required : true
    }
},{timestamps : true})


const Comment = mongoose.model("Comment",commentSchema);
module.exports = Comment;