const multer = require("multer")
const Video = require("../models/Video")
const Like = require("../models/Like")
const Comment = require("../models/Comment")
const cloudinary = require("../config/cloudinary");

const storage = multer.diskStorage({});
const upload = multer({storage});

exports.uploadVideo = async(req,res) => {
    try {
        const file = req.file;
        const result = await cloudinary.uploader.upload(file.path,{
            resource_type : "video",
            folder : "reels"
        })

        const video = new Video({
            userId : req.body.userId,
            caption : req.body.caption,
            videoUrl : result.secure_url,
            thumbnail : result.secure_url.replace(".mp4",".jpg")
        })

        res.json(video);

    } catch (error) {
        res.status(500).json({message: error.message});
    }
}