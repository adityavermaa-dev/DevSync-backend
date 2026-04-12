const express = require("express");
const app = express()
const cookieParser = require("cookie-parser")
const cors = require("cors")
const http = require("http");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { initializeSocket } = require("./services/socket");
const server = http.createServer(app);
const config = require("./config/index")
const errorHandler = require("./middlewares/errorMiddleware")
const AppError = require("./utils/AppError")
const logger = require("./utils/logger")
const requestLogger = require("./middlewares/requestLogger")
const {
    normalizeOrigin,
    isDevLocalOrigin,
    parseConfiguredOrigins,
} = require("./utils/origin");

const allowedOrigins = [
    "https://devsyncapp.in",
    "https://www.devsyncapp.in",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    config.general.frontendUrl,
].filter(Boolean).map((o) => o.trim().replace(/\/$/, ""));

const allowedHosts = new Set(
    allowedOrigins.map((o) => {
        try { return new URL(o).host.toLowerCase(); } catch { return null; }
    }).filter(Boolean)
);

app.use(cors({
    origin(origin, callback) {
        if (!origin) return callback(null, true); // same-origin/server-to-server

        let host = "";
        try {
            host = new URL(origin).host.toLowerCase();
        } catch {
            logger.warn("CORS invalid origin", { origin });
            return callback(new Error("Not allowed by CORS"));
        }

        if (allowedHosts.has(host)) return callback(null, true);

        logger.warn("CORS blocked request", {
            origin,
            host,
            allowedHosts: [...allowedHosts],
        });
        return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    optionsSuccessStatus: 204,
}));

app.use(requestLogger);

initializeSocket(server);

const connectDb = require("./database/connection")
const authRouter = require("./routes/auth")
const profileRouter = require("./routes/profile")
const requestRouter = require("./routes/request")
const userRouter = require("./routes/user")
const chatRouter = require("./routes/chat")
const messageRouter = require("./routes/message")
const videoRouter = require("./routes/videoRoutes")
const paymentRouter = require('./routes/payment');
const notificationRouter = require('./routes/notification');
const projectRouter = require('./routes/projectRouter');
const taskRouter = require('./routes/taskRouter');
const buildLogRouter = require('./routes/buildLogRouter');
const matchRouter = require('./routes/matchRouter');

require("./utils/cronScheduleEmail");

app.use("/setup", limiter);
app.use("/login", limiter);
app.use("/signup", limiter);
app.use("/forgot-password", limiter);
app.use("/resend-verification", limiter);
app.use("/api/setup", limiter);
app.use("/api/login", limiter);
app.use("/api/signup", limiter);
app.use("/api/forgot-password", limiter);
app.use("/api/resend-verification", limiter);

const routers = [
    authRouter,
    profileRouter,
    requestRouter,
    userRouter,
    chatRouter,
    messageRouter,
    paymentRouter,
    videoRouter,
    notificationRouter,
    projectRouter,
    taskRouter,
    buildLogRouter,
    matchRouter,
];

routers.forEach((router) => {
    app.use(router);
    app.use("/api", router);
});

app.use((req, res, next) => {
    next(new AppError(`Cannot find ${req.originalUrl} on this server`, 404));
});

app.use(errorHandler)
connectDb()
    .then(() => {
        logger.info("Database connection successful")
        server.listen(config.port, () => {
            logger.info("Server listens", { port: config.port });
        });
    })
    .catch((error) => logger.error("Database cannot be connected", { error }))


/*Some important notes
Version number : 4.19.18;
Here 4 represnts = Major
     19 represnts = Minor
     18 represents = Patch

PATCH : means the bug fixes or some interal changes which not break the previous version
MINOR : means the minor changes like adding the new features that are backward compatible
MAJOR : means the major changes in the dependency it may break the previos version

The version should follow the semver
Semantic Versioning is a standard for version numbers using MAJOR.MINOR.PATCH where patch
releases contain bug fixes, minor releases add backward-compatible features, and major releases 
introduce breaking changes.

WHAT DOES ^ AND ~ MEANS IN THE VERSION NUMBER?
    ^ : This is called caret. Caret allows updates do not break the major version.
    ~ : This symbol is called tilda. This will only allows the patch changes;

    But if the version start with 0;
    then npm consider library as unstable library.
    So it think even the minor updates will break the library.
    That's in these case ^ it means it alows only the patch updates.
*/
