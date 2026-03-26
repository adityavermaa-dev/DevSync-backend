const express = require("express");
const bcrypt = require("bcryptjs");
const { validateSignup } = require("../utils/validate");
const User = require("../models/user");
const validator = require("validator");
const { OAuth2Client } = require("google-auth-library");
const crypto = require("crypto");
const axios = require("axios");
const sendEmail = require("../services/emailService");
const UAparser = require("ua-parser-js");
const { escapeHtml } = require("../services/emailTemplates");

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const authRouter = express.Router();


authRouter.post("/signup", async (req, res) => {
    try {
        validateSignup(req.body);

        const { firstName, lastName, email, password } = req.body;
        const rawToken = crypto.randomBytes(32).toString("hex");
        const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");
        const passwordHash = await bcrypt.hash(password, 10);

        const user = new User({
            firstName,
            lastName,
            email: email.toLowerCase(),
            password: passwordHash,
            verificationToken: hashedToken,
            authProvider: "local",
            isVerified: false,
            verificationTokenExpires: Date.now() + 3600000
        });

        const savedUser = await user.save();

        const verifyLink =
            `${process.env.BACKEND_URL}/verify-email/${rawToken}`;

        await sendEmail({
            to: savedUser.email,
            subject: "Verify your DevSync account",
            preheader: "Confirm your email address to finish setting up your account.",
            html:
                `
            <h2 style="margin:0 0 8px;">Welcome to DevSync, ${escapeHtml(savedUser.firstName)}</h2>
            <p style="margin:0 0 12px;">Please confirm your email address to activate your account.</p>
            <p style="margin:0 0 12px;"><a href="${verifyLink}">${verifyLink}</a></p>
            <p style="margin:0;">If you didn’t create this account, you can ignore this email.</p>
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
        const hashedToken = crypto.createHash("sha256").update(req.params.token).digest("hex");

        const user = await User.findOne({
            verificationToken: hashedToken,
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
    const rawToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");
    
    user.verificationToken = hashedToken;
    user.verificationTokenExpires = Date.now() + 3600000;

    await user.save();

    const verifyLink =
        `${process.env.BACKEND_URL}/verify-email/${rawToken}`;

    await sendEmail({
        to: user.email,
        subject: "Verify your DevSync account",
        preheader: "Your new verification link is inside.",
        html:
            `
            <h2 style="margin:0 0 8px;">Hi ${escapeHtml(user.firstName)},</h2>
            <p style="margin:0 0 12px;">Here’s your new email verification link:</p>
            <p style="margin:0 0 12px;"><a href="${verifyLink}">${verifyLink}</a></p>
            <p style="margin:0;">If you didn’t request this, you can ignore this email.</p>
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

        const ua = new UAparser(req.headers["user-agent"]);
        const deviceInfo = ua.getResult();

        const deviceName =
            `${deviceInfo.browser.name || "Unknown"} on ${deviceInfo.os.name || "Unknown"}`;

        const ip =
            req.headers["x-forwarded-for"]?.split(",")[0] ||
            req.socket.remoteAddress;
        const existingDevice = user.devices.find(
            d => d.device === deviceName
        );

        if (!existingDevice) {

            user.devices.push({
                device: deviceName,
                ip,
                lastLogin: new Date()
            });

            await user.save();

            await sendEmail({
                to: user.email,
                subject: "New login detected on DevSync",
                                preheader: "We noticed a login from a new device.",
                html: `
        <h3 style="margin:0 0 8px;">New login detected</h3>
        <p style="margin:0 0 12px;">We noticed a login to your DevSync account from a new device.</p>
        <div style="margin:0 0 12px;">
            <div><b>Device:</b> ${escapeHtml(deviceName)}</div>
            <div><b>IP:</b> ${escapeHtml(ip)}</div>
            <div><b>Time:</b> ${escapeHtml(new Date().toLocaleString())}</div>
        </div>
        <p style="margin:0;">If this wasn’t you, please reset your password immediately.</p>
    `
            });

        }

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

authRouter.post("/forgot-password", async (req, res) => {
    const frontendUrl = process.env.FRONTEND_URL?.trim();
    if (!frontendUrl) {
        return res.status(500).json({
            message: "FRONTEND_URL is not configured on the server"
        });
    }

    const email = req.body.email?.toLowerCase();
    
    if (!email || !validator.isEmail(email)) {
        return res.status(400).json({ message: "Invalid email" });
    }

    const user = await User.findOne({ email });

    if (!user) {
        return res.json({ message: "If the account exists, a reset email has been sent" });
    }

    const rawToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");
    
    user.passwordResetToken = hashedToken;
    user.passwordResetTokenExpires = Date.now() + 3600000;

    await user.save();

    const resetLink =
        `${frontendUrl.replace(/\/$/, "")}/reset-password/${rawToken}`;

    await sendEmail({
        to: user.email,
        subject: "Reset your DevSync password",
                preheader: "Use this link to reset your password (valid for 1 hour).",
                html: `
                    <p style="margin:0 0 12px;">We received a request to reset your DevSync password.</p>
                    <p style="margin:0 0 12px;">Reset your password using this link (valid for 1 hour):</p>
                    <p style="margin:0 0 12px;"><a href="${resetLink}">${resetLink}</a></p>
                    <p style="margin:0;">If you didn’t request this, you can safely ignore this email.</p>
                `
    });

    res.json({ message: "If the account exists, a reset email has been sent" });
})

authRouter.post("/reset-password/:token", async (req, res) => {
    const hashedToken = crypto.createHash("sha256").update(req.params.token).digest("hex");

    const user = await User.findOne({
        passwordResetToken: hashedToken,
        passwordResetTokenExpires: { $gt: Date.now() }
    });

    if (!user) {
        return res.status(400).json({ message: "Invalid or expired token" })
    }

    const hashed = await bcrypt.hash(req.body.password, 10);

    user.password = hashed
    user.passwordResetToken = undefined
    user.passwordResetTokenExpires = undefined

    await user.save()

    res.json({ message: "Password reset successfully" })
})

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

    res.send("Logout Successfully")
})

module.exports = authRouter;