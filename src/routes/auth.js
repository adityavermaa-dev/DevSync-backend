const express = require("express");
const bcrypt = require("bcryptjs");
const User = require("../models/user");
const { signupValidator, loginValidator } = require("../middlewares/authValidator");
const validator = require("validator");
const { OAuth2Client } = require("google-auth-library");
const crypto = require("crypto");
const axios = require("axios");
const sendEmail = require("../services/emailService");
const UAparser = require("ua-parser-js");
const { escapeHtml } = require("../services/emailTemplates");
const config = require('../config/index')
const AppError = require("../utils/AppError");
const logger = require("../utils/logger");
const { getPrimaryUrl } = require("../utils/origin");

const client = new OAuth2Client(config.oauth.googleClientId);

const authRouter = express.Router();
const frontendUrl = getPrimaryUrl(config.general.frontendUrl);
const backendUrl = getPrimaryUrl(config.general.backendUrl);

const AUTH_COOKIE_NAME = "token";
const OAUTH_STATE_COOKIE_NAME = "devsync_oauth_state";
const AUTH_COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const OAUTH_STATE_COOKIE_MAX_AGE = 10 * 60 * 1000;
const isProduction = config.deployment.nodeEnv === "production";

const assertAbsoluteHttpUrl = (value, name) => {
    try {
        const url = new URL(value);
        if (!["http:", "https:"].includes(url.protocol)) {
            throw new Error();
        }
    } catch {
        throw new Error(`${name} must be an absolute http(s) URL`);
    }
};

assertAbsoluteHttpUrl(frontendUrl, "FRONTEND_URL");
assertAbsoluteHttpUrl(backendUrl, "BACKEND_URL");

const joinPublicUrl = (baseUrl, routePath) => {
    const url = new URL(baseUrl);
    const basePath = url.pathname.replace(/\/+$/, "");
    const normalizedRoutePath = routePath.startsWith("/") ? routePath : `/${routePath}`;

    url.pathname = `${basePath}${normalizedRoutePath}`.replace(/\/{2,}/g, "/");
    url.search = "";
    url.hash = "";

    return url.toString();
};

const getAuthCookieOptions = () => ({
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    maxAge: AUTH_COOKIE_MAX_AGE,
    path: "/",
});

const getCookieClearOptions = () => {
    const { maxAge, ...options } = getAuthCookieOptions();
    return options;
};

const setAuthCookie = (res, token) => {
    return res.cookie(AUTH_COOKIE_NAME, token, getAuthCookieOptions());
};

const getOAuthStateCookieOptions = () => ({
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    maxAge: OAUTH_STATE_COOKIE_MAX_AGE,
    path: "/",
});

const getOAuthStateCookieClearOptions = () => {
    const { maxAge, ...options } = getOAuthStateCookieOptions();
    return options;
};

const hashOAuthState = (state) => {
    return crypto
        .createHmac("sha256", config.auth.jwtSecret)
        .update(state)
        .digest("hex");
};

const safeCompare = (left, right) => {
    const leftBuffer = Buffer.from(String(left || ""));
    const rightBuffer = Buffer.from(String(right || ""));

    return (
        leftBuffer.length === rightBuffer.length &&
        crypto.timingSafeEqual(leftBuffer, rightBuffer)
    );
};

const createOAuthState = () => crypto.randomBytes(32).toString("hex");

const setOAuthStateCookie = (res, state) => {
    res.cookie(OAUTH_STATE_COOKIE_NAME, hashOAuthState(state), getOAuthStateCookieOptions());
};

const clearOAuthStateCookie = (res) => {
    res.clearCookie(OAUTH_STATE_COOKIE_NAME, getOAuthStateCookieClearOptions());
};

const isValidOAuthState = (req, receivedState) => {
    const state = Array.isArray(receivedState) ? receivedState[0] : receivedState;
    const expectedHash = req.cookies?.[OAUTH_STATE_COOKIE_NAME];

    if (!state || !expectedHash) {
        return false;
    }

    return safeCompare(hashOAuthState(state), expectedHash);
};

const getGithubCallbackUrl = () => {
    const configuredCallbackUrl = getPrimaryUrl(config.oauth.githubCallbackUrl);
    if (configuredCallbackUrl) {
        assertAbsoluteHttpUrl(configuredCallbackUrl, "GITHUB_CALLBACK_URL");
        return configuredCallbackUrl;
    }

    return joinPublicUrl(backendUrl, "/auth/github/callback");
};

const buildGithubAuthUrl = (state) => {
    const githubAuthUrl = new URL("https://github.com/login/oauth/authorize");
    githubAuthUrl.searchParams.set("client_id", config.oauth.githubClientId);
    githubAuthUrl.searchParams.set("redirect_uri", getGithubCallbackUrl());
    githubAuthUrl.searchParams.set("scope", "read:user user:email");
    githubAuthUrl.searchParams.set("state", state);

    return githubAuthUrl.toString();
};

const redirectToAuthCallback = (res, provider, params = {}) => {
    const redirectUrl = new URL(joinPublicUrl(frontendUrl, `/auth/${provider}/callback`));

    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") {
            redirectUrl.searchParams.set(key, String(value));
        }
    });

    return res.redirect(redirectUrl.toString());
};

const serializeAuthUser = (user) => ({
    id: user._id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    photoUrl: user.photoUrl,
    githubUsername: user.githubUsername,
    profileCompleted: user.profileCompleted,
});

const getNameParts = (name, fallback) => {
    const source = String(name || fallback || "DevSync User").trim();
    const [firstName, ...rest] = source.split(/\s+/);

    return {
        firstName: firstName || "DevSync",
        lastName: rest.join(" "),
    };
};

const githubRequestHeaders = (accessToken) => ({
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${accessToken}`,
    "User-Agent": "DevSync",
    "X-GitHub-Api-Version": "2022-11-28",
});


authRouter.post("/signup", signupValidator, async (req, res, next) => {
    try {

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
            `${backendUrl}/verify-email/${rawToken}`;

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
            return next(new AppError("Email already exists", 400));
        }
        next(error.statusCode ? error : new AppError(error.message, 400));
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
                `${frontendUrl}/verification-failed`
            );
        }

        user.isVerified = true;
        user.verificationToken = undefined;
        user.verificationTokenExpires = undefined;

        await user.save();

        return res.redirect(
            `${frontendUrl}/email-verified`
        );

    } catch (error) {
        res.redirect(`${frontendUrl}/verification-error`);
    }
});

authRouter.post("/resend-verification", async (req, res, next) => {
    try {
        const email = req.body.email?.toLowerCase();
        if (!email || !validator.isEmail(email)) {
            return next(new AppError("Invalid email", 400));
        }

        const user = await User.findOne({ email });

        if (!user) {
            return next(new AppError("User not found", 404));
        }

        if (user.isVerified) {
            return res.json({ message: "Already verified" });
        }

        if (user.verificationTokenExpires > Date.now() - 120000) {
            return next(new AppError("Please wait before requesting another email", 429));
        }

        const rawToken = crypto.randomBytes(32).toString("hex");
        const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");

        user.verificationToken = hashedToken;
        user.verificationTokenExpires = Date.now() + 3600000;

        await user.save();

        const verifyLink =
            `${backendUrl}/verify-email/${rawToken}`;

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
    } catch (error) {
        next(error);
    }
})

authRouter.post("/login", loginValidator, async (req, res, next) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email: email.toLowerCase() })
            .select("+password");

        if (!user) {
            return next(new AppError("Invalid credentials", 401));
        }
        if (!user.isVerified && user.authProvider === "local") {
            return next(new AppError("Please verify your email first", 403));
        }
        if (!user.password) {
            return next(new AppError(`Please continue with ${user.authProvider} login`, 401));
        }

        const isValid = await user.validateUser(password);
        if (!isValid) {
            return next(new AppError("Invalid credentials", 401));
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

        setAuthCookie(res, token).json(serializeAuthUser(user));

    } catch (error) {
        logger.error("Login error", { error: error?.message || error });
        next(new AppError("Server error", 500));
    }
});

authRouter.post("/forgot-password", async (req, res, next) => {
    try {
        if (!frontendUrl) {
            return next(new AppError("FRONTEND_URL is not configured on the server", 500));
        }

        const email = req.body.email?.toLowerCase();

        if (!email || !validator.isEmail(email)) {
            return next(new AppError("Invalid email", 400));
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
    } catch (error) {
        next(error);
    }
})

authRouter.post("/reset-password/:token", async (req, res, next) => {
    try {
        const hashedToken = crypto.createHash("sha256").update(req.params.token).digest("hex");

        const user = await User.findOne({
            passwordResetToken: hashedToken,
            passwordResetTokenExpires: { $gt: Date.now() }
        });

        if (!user) {
            return next(new AppError("Invalid or expired token", 400));
        }

        const hashed = await bcrypt.hash(req.body.password, 10);

        user.password = hashed
        user.passwordResetToken = undefined
        user.passwordResetTokenExpires = undefined

        await user.save()

        res.json({ message: "Password reset successfully" })
    } catch (error) {
        next(error);
    }
})

authRouter.post("/auth/google/callback", async (req, res, next) => {
    try {
        const { credential } = req.body;
        if (!credential) {
            return next(new AppError("Missing Google credential", 400));
        }

        const ticket = await client.verifyIdToken({
            idToken: credential,
            audience: config.oauth.googleClientId,
        })

        const {
            email,
            email_verified: emailVerified,
            given_name,
            family_name,
            name,
            sub: googleId,
            picture
        } = ticket.getPayload();

        const normalizedEmail = String(email || "").toLowerCase();
        if (!normalizedEmail || !emailVerified) {
            return next(new AppError("Google email is not verified", 400));
        }

        const googleIdString = String(googleId);
        const existingByGoogleId = await User.findOne({ googleId: googleIdString });
        const existingByEmail = await User.findOne({ email: normalizedEmail });

        if (
            existingByGoogleId &&
            existingByEmail &&
            String(existingByGoogleId._id) !== String(existingByEmail._id)
        ) {
            return next(new AppError("This Google account is already linked to another user", 409));
        }

        let user = existingByGoogleId || existingByEmail;

        if (!user) {
            const fallbackName = normalizedEmail.split("@")[0];
            user = new User({
                firstName: given_name || getNameParts(name, fallbackName).firstName,
                lastName: family_name || getNameParts(name, fallbackName).lastName,
                email: normalizedEmail,
                googleId: googleIdString,
                photoUrl: picture,
                authProvider: "google",
                isVerified: true
            })
            await user.save();
        } else {
            if (user.googleId && user.googleId !== googleIdString) {
                return next(new AppError("This email is already linked to another Google account", 409));
            }

            user.googleId = googleIdString;
            user.isVerified = true;

            if (!user.photoUrl && picture) {
                user.photoUrl = picture;
            }

            if (!user.authProvider || user.authProvider === "local") {
                user.authProvider = "google";
            }

            await user.save();
        }

        const token = user.getJWT();

        setAuthCookie(res, token).json({
            message: "Login successfully",
            data: serializeAuthUser(user)
        })
        req.user = user;
    } catch (error) {
        logger.warn("Google authentication failed", { error: error?.message || error });
        next(error.statusCode ? error : new AppError("Invalid Google token", 400));
    }
})

authRouter.get("/auth/github", (req, res) => {
    const state = createOAuthState();
    setOAuthStateCookie(res, state);

    res.redirect(buildGithubAuthUrl(state));
})

authRouter.get("/auth/github/url", (req, res) => {
    const state = createOAuthState();
    setOAuthStateCookie(res, state);

    res.json({ url: buildGithubAuthUrl(state) });
})

authRouter.get("/auth/github/callback", async (req, res) => {
    try {
        const { code, state } = req.query;
        const githubCallbackUrl = getGithubCallbackUrl();

        clearOAuthStateCookie(res);

        if (!isValidOAuthState(req, state)) {
            logger.warn("GitHub OAuth state validation failed");
            return redirectToAuthCallback(res, "github", { error: "oauth_state" });
        }

        if (!code) {
            return redirectToAuthCallback(res, "github", { error: "missing_code" });
        }

        const tokenResponse = await axios.post(
            "https://github.com/login/oauth/access_token",
            {
                client_id: config.oauth.githubClientId,
                client_secret: config.oauth.githubClientSecret,
                code,
                redirect_uri: githubCallbackUrl,
            },
            {
                headers: {
                    Accept: "application/json",
                    "User-Agent": "DevSync",
                },
                timeout: 10000,
            }
        )

        if (tokenResponse.data?.error) {
            throw new AppError(tokenResponse.data.error_description || "GitHub token exchange failed", 400);
        }

        const accessToken = tokenResponse.data.access_token;
        if (!accessToken) {
            throw new AppError("GitHub did not return an access token", 400);
        }

        const userResponse = await axios.get("https://api.github.com/user", {
            headers: githubRequestHeaders(accessToken),
            timeout: 10000,
        })

        const emailResponse = await axios.get("https://api.github.com/user/emails", {
            headers: githubRequestHeaders(accessToken),
            timeout: 10000,
        })

        const primaryEmail = emailResponse.data.find(
            (email) => email.primary && email.verified
        )?.email || emailResponse.data.find((email) => email.verified)?.email;

        if (!primaryEmail) {
            throw new AppError("No verified GitHub email found", 400);
        }

        const normalizedEmail = primaryEmail.toLowerCase();
        const githubId = String(userResponse.data.id);
        const githubUsername = userResponse.data.login || "";

        const existingByGithubId = await User.findOne({ githubId });
        const existingByEmail = await User.findOne({ email: normalizedEmail });

        if (
            existingByGithubId &&
            existingByEmail &&
            String(existingByGithubId._id) !== String(existingByEmail._id)
        ) {
            throw new AppError("This GitHub email is already linked to another account", 409);
        }

        let user = existingByGithubId || existingByEmail;

        if (!user) {
            const { firstName, lastName } = getNameParts(userResponse.data.name, githubUsername);
            user = new User({
                email: normalizedEmail,
                firstName,
                lastName,
                githubId,
                githubUsername,
                photoUrl: userResponse.data.avatar_url,
                authProvider: "github",
                isVerified: true
            })
            await user.save();
        } else {
            if (user.githubId && user.githubId !== githubId) {
                throw new AppError("This email is already linked to another GitHub account", 409);
            }

            user.githubId = githubId;

            if (githubUsername) {
                user.githubUsername = githubUsername;
            }

            if (!user.authProvider || user.authProvider === "local") {
                user.authProvider = "github";
            }

            if (!user.photoUrl && userResponse.data.avatar_url) {
                user.photoUrl = userResponse.data.avatar_url;
            }

            user.isVerified = true;
            await user.save();
        }

        const token = user.getJWT();

        setAuthCookie(res, token);

        return redirectToAuthCallback(res, "github");

    } catch (error) {
        logger.error("GitHub authentication failed", { error: error?.message || error });
        return redirectToAuthCallback(res, "github", { error: "github_oauth_failed" });
    }
})

authRouter.post("/logout", (req, res) => {
    res.clearCookie(AUTH_COOKIE_NAME, getCookieClearOptions());

    res.json({ message: "Logout successfully" })
})

module.exports = authRouter;
