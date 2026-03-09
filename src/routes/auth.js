const express = require("express");
const bcrypt = require("bcryptjs");
const { validateSignup } = require("../utils/validate");
const User = require("../models/user");
const validator = require("validator");
const { OAuth2Client } = require("google-auth-library");
const crypto = require("crypto");
const axios = require("axios");
const sendEmail = require("../services/emailService");

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const authRouter = express.Router();


authRouter.post("/signup", async (req, res) => {
    try {
        validateSignup(req.body);

        const { firstName, lastName, email, password } = req.body;
        const verificationToken = crypto.randomBytes(32).toString("hex");
        const passwordHash = await bcrypt.hash(password, 10);

        const user = new User({
            firstName,
            lastName,
            email: email.toLowerCase(),
            password: passwordHash,
            verificationToken,
            authProvider: "local",
            isVerified: false,
            verificationTokenExpires: Date.now() + 3600000
        });

        const savedUser = await user.save();

        const verifyLink =
            `${process.env.BACKEND_URL}/auth/verify-email/${verificationToken}`;

        await sendEmail({
            to: savedUser.email,
            subject: "Verify you DevSync account",
            html:
                `
            <h2>Welcome to DevSync, ${savedUser.firstName}</h2>
            <p>Please verify your email.</p>
            <a href="${verifyLink}">Verify Email</a>
            `
        })

        res.status(201).json({
            message:
                "Account created successfully. Please check your email to verify your account."
        });

    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ message: "Email already exists" });
        }

        res.status(400).json({ message: error.message });
    }
});

authRouter.get("/verify-email/:token", async (req, res) => {
    try {

        const user = await User.findOne({
            verificationToken: req.params.token,
            verificationTokenExpires: { $gt: Date.now() }
        });

        if (!user) {
            return res.redirect(
                `${process.env.FRONTEND_URL}/verification-failed`
            );
        }

        user.isVerified = true;
        user.verificationToken = undefined;
        user.verificationTokenExpires = undefined;

        await user.save();

        return res.redirect(
            `${process.env.FRONTEND_URL}/email-verified`
        );

    } catch (error) {
        res.redirect(`${process.env.FRONTEND_URL}/verification-error`);
    }
});

authRouter.post("/resend-verification", async (req, res) => {
    const user = await User.findOne({
        email: req.body.email.toLowerCase()
    });

    if (!user) {
        return res.status(404).json({ message: "User not found" });
    }

    if (user.isVerified) {
        return res.json({ message: "Already verified" });
    }

    if (user.verificationTokenExpires > Date.now() - 120000) {
        return res.status(429).json({
            message: "Please wait before requesting another email"
        });
    }
    const token = crypto.randomBytes(32).toString("hex");
    user.verificationToken = token
    user.verificationTokenExpires = Date.now() + 3600000;

    await user.save();

    const verifyLink =
        `${process.env.BACKEND_URL}/auth/verify-email/${token}`;

    await sendEmail({
        to: user.email,
        subject: "Verify you DevSync account",
        html:
            `
            <h2>Welcome to DevSync, ${user.firstName}</h2>
            <p>Please verify your email.</p>
            <a href="${verifyLink}">Verify Email</a>
            `
    })

    res.json({ message: "Email sent" })
})

authRouter.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !validator.isEmail(email)) {
            return res.status(400).json({ message: "Invalid email" });
        }
        if (!password) {
            return res.status(400).json({ message: "Password required" });
        }

        const user = await User.findOne({ email: email.toLowerCase() })
            .select("+password");

        if (!user) {
            return res.status(401).json({ message: "Invalid credentials" });
        }
        if (!user.isVerified && user.authProvider === "local") {
            return res.status(403).json({ message: "Please verify your email first" });
        }

        const isValid = await user.validateUser(password);
        if (!isValid) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        const token = user.getJWT();

        res
            .cookie("token", token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite:
                    process.env.NODE_ENV === "production" ? "none" : "lax",
                maxAge: 7 * 24 * 60 * 60 * 1000,
            })
            .json({
                id: user._id,
                firstName: user.firstName,
                email: user.email,
            });

    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({ message: "Server error" });
    }
});

authRouter.post("/auth/google/callback", async (req, res) => {
    try {
        const { credential } = req.body;

        const ticket = await client.verifyIdToken({
            idToken: credential,
            audience: process.env.GOOGLE_CLIENT_ID,
        })

        const { email, given_name, family_name, sub: googleId, picture } = ticket.getPayload();

        let user = await User.findOne({ email: email });

        if (!user) {
            user = new User({
                firstName: given_name,
                lastName: family_name,
                email: email,
                googleId: googleId,
                photoUrl: picture,
                authProvider: "google",
                isVerified: true
            })
            await user.save();

        }

        const token = await user.getJWT();

        res.cookie("token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
            maxAge: 7 * 24 * 60 * 60 * 1000,
        })
            .json({
                message: "Login Successfully",
                data: user
            })
        req.user = user;
    } catch (error) {
        res.status(400).json({ message: "Invalid Google Token" })
    }
})

authRouter.get("/auth/github", (req, res) => {
    const githubAuthURL =
        `https://github.com/login/oauth/authorize?` +
        `client_id=${process.env.GITHUB_CLIENT_ID}&` +
        `scope=user:email`;

    res.redirect(githubAuthURL);
})

authRouter.get("/auth/github/callback", async (req, res) => {
    try {
        const { code } = req.query;

        if (!code) {
            return res.status(400).json({ message: "Code not provides" })
        }

        const tokenResponse = await axios.post(
            "https://github.com/login/oauth/access_token",
            {
                client_id: process.env.GITHUB_CLIENT_ID,
                client_secret: process.env.GITHUB_CLIENT_SECRET,
                code,
            },
            {
                headers: { Accept: "application/json" },
            }
        )

        const accessToken = tokenResponse.data.access_token;

        const userResponse = await axios.get("https://api.github.com/user", {
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        })

        const emailResponse = await axios.get("https://api.github.com/user/emails", {
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        })

        const primaryEmail = emailResponse.data.find(
            (email) => email.primary && email.verified
        )?.email;

        if (!primaryEmail) {
            return res.status(400).json({ message: "No verified email found" })
        }

        let user = await User.findOne({ email: primaryEmail })

        if (!user) {
            user = new User({
                email: primaryEmail,
                firstName: userResponse.data.name || userResponse.data.login,
                lastName: "",
                githubId: userResponse.data.id,
                photoUrl: userResponse.data.avatar_url,
                authProvider: "github",
                isVerified: true
            })
            await user.save();
        }

        const token = await user.getJWT();

        res.cookie("token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
            maxAge: 7 * 24 * 60 * 60 * 1000,
        })
            .redirect("https://devsyncapp.in")

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "GitHub authentication failed" });
    }
})

authRouter.post("/logout", (req, res) => {
    res.clearCookie("token");

    res.send("Logut Successfully")
})

module.exports = authRouter;