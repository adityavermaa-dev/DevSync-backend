const express = require("express");
const { userAuth } = require("../middlewares/auth")
const { validateProfileEditData } = require("../utils/validate")
const validator = require("validator")
const bcrypt = require("bcryptjs");
const cloudinary = require("cloudinary").v2;
const multer = require("multer")
const fs = require("fs");
const AppError = require("../utils/AppError");
const logger = require("../utils/logger");

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
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

const profileRouter = express.Router();

const handleProfileImageUpload = async (req, res, next) => {
    try {
        // Handle profile image upload
        if (req.files?.profileImage?.[0]) {
            const file = req.files.profileImage[0];
            const uploadRes = await cloudinary.uploader.upload(file.path);

            try {
                fs.unlinkSync(file.path);
            } catch (e) {
                logger.warn("Error deleting local file", { error: e?.message || e });
            }

            req.body.photoUrl = uploadRes.secure_url;
        }

        // Handle cover photo upload
        if (req.files?.coverPhoto?.[0]) {
            const file = req.files.coverPhoto[0];
            const uploadRes = await cloudinary.uploader.upload(file.path);

            try {
                fs.unlinkSync(file.path);
            } catch (e) {
                logger.warn("Error deleting local file", { error: e?.message || e });
            }

            req.body.coverPhotoUrl = uploadRes.secure_url;
        }

        next();
    } catch (error) {
        next(new AppError("Image upload failed: " + error.message, 400));
    }
}

profileRouter.get("/profile/view", userAuth, async (req, res, next) => {
    try {
        const user = req.user;
        logger.debug("Profile view", { userId: user?._id });
        res.send(user);
    } catch (error) {
        next(new AppError(error.message, 400));
    }
});

profileRouter.patch("/profile/edit", userAuth, upload.fields([
    { name: "profileImage", maxCount: 1 },
    { name: "coverPhoto", maxCount: 1 }
]), handleProfileImageUpload, async (req, res, next) => {
    try {
        if (req.body.age) {
            req.body.age = Number(req.body.age);
        }
        if (typeof req.body.skills === "string") {
            try {
                req.body.skills = JSON.parse(req.body.skills);
            } catch (e) {
                // Ignore parsing errors, let validator catch it
            }
        }

        validateProfileEditData(req.body);

        const user = req.user;

        Object.keys(req.body).forEach((key) => {
            user[key] = req.body[key];
        });

        await user.save();

        res.status(200).json({
            message: "Profile updated successfully",
            user
        });

    } catch (error) {
        next(new AppError(error.message, 400));
    }
});

profileRouter.post("/profile/password", userAuth, async (req, res, next) => {
    try {
        const loggesInUser = req.user;

        const { oldPass } = req.body;

        const isOldPassValid = await loggesInUser.validateUser(oldPass);

        if (isOldPassValid) {
            const { newPass } = req.body;
            const isStrongNewPass = await validator.isStrongPassword(newPass);
            if (isStrongNewPass) {
                const newPassHash = await bcrypt.hash(newPass, 10);
                loggesInUser.password = newPassHash;

                await loggesInUser.save();
                res.send("Password updated successfully")
            } else {
                throw new Error("Please enter strong password")
            }
        }
        else {
            throw new Error("Please enter correct password")
        }
    } catch (error) {
            next(new AppError(error.message, 400))
    }
})

module.exports = profileRouter;