const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const config = require("../config/index")

const userSchema = new mongoose.Schema(
    {
        firstName: {
            type: String,
            required: true,
            trim: true,
        },
        lastName: {
            type: String,
            trim: true,
        },
        about: {
            type: String,
            trim: true,
        },
        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
        },
        skills: {
            type: [String],
        },
        password: {
            type: String,
            required: function () {
                return !this.googleId && !this.githubId;
            },
            minlength: 6,
            select: false,
        },
        googleId: {
            type: String,
            unique: true,
            sparse: true,
        },
        githubId: {
            type: String,
            unique: true,
            sparse: true,
        },
        githubUsername: {
            type: String,
            trim: true,
        },
        photoUrl: {
            type: String,
        },
        age: {
            type: Number,
            min: 18,
        },
        gender: {
            type: String,
            enum: ["male", "female", "other"],
        },
        isVerified : {
            type : Boolean,
            default : false
        },
        authProvider : {
            type : String,
            enum : ["local","google","github"],
            default : "local"
        },
        verificationToken : {
            type : String,
        },
        verificationTokenExpires : Date,
        passwordResetToken : String,
        passwordResetTokenExpires : Date,

        currentStreak: {
            type: Number,
            default: 0,
        },
        longestStreak: {
            type: Number,
            default: 0,
        },
        lastActivityAt: {
            type: Date,
        },

        devices : [
            {
                device : String,
                ip : String,
                lastLogin : Date
            }
        ]
    },
    { timestamps: true }
);

// JWT
userSchema.methods.getJWT = function () {
    return jwt.sign(
        { _id: this._id },
        config.auth.jwtSecret,
        { expiresIn: "7d" }
    );
};

// Password compare
userSchema.methods.validateUser = async function (passwordInput) {
    return await bcrypt.compare(passwordInput, this.password);
};

const User = mongoose.model("User", userSchema);
module.exports = User;