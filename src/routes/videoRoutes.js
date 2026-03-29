const express = require("express")
const videoRouter = express.Router();

const videoController = require("../controllers/videoController")
const { userAuth } = require("../middlewares/auth")
const multer = require("multer");
const fs = require("fs");

const uploadDir = './uploads/';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } });


videoRouter.post("/upload", userAuth, upload.single("video"), videoController.uploadVideo);

videoRouter.delete("/:id", userAuth, videoController.deleteVideo);

videoRouter.patch("/:id/view",userAuth, videoController.addView);

videoRouter.post("/like", userAuth, videoController.toggleLike);

videoRouter.post("/comment", userAuth, videoController.addComment);

videoRouter.get("/comments/:videoId", userAuth, videoController.getComments);

videoRouter.get("/feed", userAuth, videoController.getFeed);

videoRouter.get("/my-videos", userAuth, videoController.getMyVideos);

videoRouter.get("/liked-videos", userAuth, videoController.getLikedVideos);

module.exports = videoRouter;