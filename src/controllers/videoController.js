const Video = require("../models/Video")
const Like = require("../models/Like")
const Comment = require("../models/Comment")
const cloudinary = require("../config.js/cloudinary");

// upload a new video and store it on Cloudinary
exports.uploadVideo = async(req,res) => {
    try {
        const file = req.file;
        
        const result = await cloudinary.uploader.upload(file.buffer,{
            resource_type : "video",
            folder : "reels"
        })

        const video = await Video.create({
            userId : req.user._id,
            caption : req.body.caption,
            videoUrl : result.secure_url,
            thumbnail : result.secure_url.replace(".mp4",".jpg")
        })

        file.buffer = null;
        
        res.json(video);

    } catch (error) {
        res.status(500).json({message: error.message});
    }
}


exports.addView = async (req, res) => {
    try {
        const video = await Video.findByIdAndUpdate(
            req.params.id,
            { $inc: { views: 1 } },
            { new: true }
        );

        if (!video) return res.status(404).json({ message: "Video not found" });

        res.json(video);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.toggleLike = async (req, res) => {
    try {
        const { userId, videoId } = req.body;

        if (!userId || !videoId) {
            return res.status(400).json({ message: "userId and videoId are required" });
        }

        const existing = await Like.findOne({ userId, videoId });

        if (existing) {
            await existing.deleteOne();
            await Video.findByIdAndUpdate(videoId, {
                $inc: { likesCount: -1 }
            });
            return res.json({ liked: false });
        }

        await Like.create({ userId, videoId });
        await Video.findByIdAndUpdate(videoId, {
            $inc: { likesCount: 1 }
        });

        res.json({ liked: true });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.addComment = async (req, res) => {
    try {
        const { userId, videoId, text } = req.body;

        if (!userId || !videoId || !text) {
            return res.status(400).json({ message: "userId, videoId and text are required" });
        }

        const comment = await Comment.create({
            userId,
            videoId,
            text
        });

        await Video.findByIdAndUpdate(videoId, {
            $inc: { commentsCount: 1 }
        });

        res.json(comment);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};


exports.getFeed = async (req, res) => {
    try {
        const videos = await Video.find()
            .sort({ createdAt: -1 })
            .limit(20);

        res.json(videos);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.deleteVideo = async (req, res) => {
    try {
        const { id: videoId } = req.params;
        const userId = req.user._id;

        if (!videoId) {
            return res.status(400).json({ message: "Video ID is required" });
        }

        const video = await Video.findById(videoId);
        
        if (!video) {
            return res.status(404).json({ message: "Video not found" });
        }

        if (video.userId.toString() !== userId.toString()) {
            return res.status(403).json({ message: "You can only delete your own videos" });
        }

        const videoPublicId = video.videoUrl.split('/').pop().split('.')[0];
        const thumbnailPublicId = video.thumbnail.split('/').pop().split('.')[0];


        try {
            await cloudinary.uploader.destroy(`reels/${videoPublicId}`, { resource_type: "video" });
            await cloudinary.uploader.destroy(`reels/${thumbnailPublicId}`, { resource_type: "image" });
        } catch (cloudinaryError) {
            console.error("Error deleting from Cloudinary:", cloudinaryError);
        }

        await Like.deleteMany({ videoId });
        await Comment.deleteMany({ videoId });
        await Video.findByIdAndDelete(videoId);

        res.json({ message: "Video deleted successfully" });

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};