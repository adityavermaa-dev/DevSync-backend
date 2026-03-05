const mongoose = require("mongoose")

const videoSchema = new mongoose.Schema({
    userId : {
        type : mongoose.Schema.Types.ObjectId,
        ref : "User",
        required : true
    },
    caption : {
        type : String,
    },
    videoUrl : {
        type : String,
        required : true
    },
    thumbnail : {
        type : String,
    },
    views : {
        type : Number,
        default : 0
    },
    likesCount : {
        type : Number,
        defualt : 0
    },
    commentsCount : {
        type : Number,
        default : 0
    }
},{timestamps : true})

const Video = mongoose.model("Video",videoSchema);
module.exports = Video;