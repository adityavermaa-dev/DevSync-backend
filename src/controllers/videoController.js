const Video = require("../models/Video")
const Like = require("../models/Like")
const Comment = require("../models/Comment")
const cloudinary = require("../integrations/cloudinary");
const fs = require('fs');const config = require("../config/index")
const logger = require("../utils/logger")
const AppError = require("../utils/AppError")


exports.uploadVideo = async (req, res, next) => {
    try {
        const file = req.file;

        const result = await cloudinary.uploader.upload(file.path, {
            resource_type: "video",
            folder: "reels",
            cloud_name: config.storage.cloudinaryCloudName,
            api_key: config.storage.cloudinaryApiKey,
            api_secret: config.storage.cloudinaryApiSecret
        })

        const video = await Video.create({
            userId: req.user._id,
            caption: req.body.caption,
            videoUrl: result.secure_url,
            thumbnail: result.secure_url.replace(".mp4", ".jpg")
        })

        fs.unlinkSync(file.path);

        res.json(video);

    } catch (error) {
        next(error);
    }
}


exports.addView = async (req, res, next) => {
    try {
        const video = await Video.findByIdAndUpdate(
            req.params.id,
            { $inc: { views: 1 } },
            { new: true }
        );

        if (!video) return next(new AppError("Video not found", 404));

        res.json(video);
    } catch (error) {
        next(error);
    }
};

exports.toggleLike = async (req, res, next) => {
    try {
        const { videoId } = req.body;
        const userId = req.user._id;

        if (!userId || !videoId) {
            return next(new AppError("userId and videoId are required", 400));
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
        next(error);
    }
};

exports.addComment = async (req, res, next) => {
    try {
        const { videoId, text } = req.body;
        const userId = req.user._id;

        if (!userId || !videoId || !text) {
            return next(new AppError("userId, videoId and text are required", 400));
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
        next(error);
    }
};

exports.getComments = async (req, res, next) => {
    try {
        const { videoId } = req.params;

        if (!videoId) {
            return next(new AppError("videoId is required", 400));
        }

        const comments = await Comment.find({ videoId })
            .populate("userId", "firstName lastName photoUrl")
            .sort({ createdAt: -1 });

        res.json(comments);
    } catch (error) {
        next(error);
    }
};


exports.getFeed = async (req, res, next) => {
    try {
        const loggedInUserId = req.user._id;

        const videos = await Video.find().populate("userId", "firstName lastName photoUrl coverPhotoUrl")
            .sort({ createdAt: -1 })
            .limit(20)
            .lean();

        const videoIds = videos.map(v => v._id);
        const userLikes = await Like.find({
            userId: loggedInUserId,
            videoId: { $in: videoIds }
        });

        const likedVideoIds = new Set(userLikes.map(like => like.videoId.toString()));

        const videosWithLikedStatus = videos.map(video => ({
            ...video,
            isLiked: likedVideoIds.has(video._id.toString())
        }));

        res.json(videosWithLikedStatus);
    } catch (error) {
        next(error);
    }
};

exports.deleteVideo = async (req, res, next) => {
    try {
        const { id: videoId } = req.params;
        const userId = req.user._id;

        if (!videoId) {
            return next(new AppError("Video ID is required", 400));
        }

        const video = await Video.findById(videoId);

        if (!video) {
            return next(new AppError("Video not found", 404));
        }

        if (video.userId.toString() !== userId.toString()) {
            return next(new AppError("You can only delete your own videos", 403));
        }

        const videoPublicId = video.videoUrl.split('/').pop().split('.')[0];
        const thumbnailPublicId = video.thumbnail.split('/').pop().split('.')[0];


        try {
            await cloudinary.uploader.destroy(`reels/${videoPublicId}`, { resource_type: "video" });
            await cloudinary.uploader.destroy(`reels/${thumbnailPublicId}`, { resource_type: "image" });
        } catch (cloudinaryError) {
            logger.warn("Error deleting from Cloudinary", { error: cloudinaryError?.message || cloudinaryError });
        }

        await Like.deleteMany({ videoId });
        await Comment.deleteMany({ videoId });
        await Video.findByIdAndDelete(videoId);

        res.json({ message: "Video deleted successfully" });

    } catch (error) {
        next(error);
    }
};

exports.getMyVideos = async (req, res, next) => {
    try {
        const userId = req.user._id;

        const videos = await Video.find({ userId })
            .populate("userId", "firstName lastName photoUrl coverPhotoUrl")
            .sort({ createdAt: -1 })
            .lean();

        // Check if liked
        const videoIds = videos.map(v => v._id);
        const userLikes = await Like.find({
            userId: userId,
            videoId: { $in: videoIds }
        });

        const likedVideoIds = new Set(userLikes.map(like => like.videoId.toString()));

        const videosWithLikedStatus = videos.map(video => ({
            ...video,
            isLiked: likedVideoIds.has(video._id.toString())
        }));

        res.json(videosWithLikedStatus);
    } catch (error) {
        next(error);
    }
};

exports.getLikedVideos = async (req, res, next) => {
    try {
        const userId = req.user._id;

        const userLikes = await Like.find({ userId }).populate({
            path: 'videoId',
            populate: {
                path: 'userId',
                select: 'firstName lastName photoUrl coverPhotoUrl'
            }
        }).sort({ createdAt: -1 }).lean();

        const likedVideos = userLikes
            .map(like => like.videoId)
            .filter(video => video != null) // in case video was deleted
            .map(video => ({
                ...video,
                isLiked: true // since these are liked videos
            }));

        res.json(likedVideos);
    } catch (error) {
        next(error);
    }
};