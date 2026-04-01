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

const normalizeOrigin = (origin) => {
    if (!origin) return origin;
    try {
        const url = new URL(origin);
        return `${url.protocol}//${url.host}`;
    } catch {
        return origin;
    }
};

const isDevLocalOrigin = (origin) => {
    try {
        const url = new URL(origin);
        const host = url.hostname;
        return (
            (url.protocol === "http:" || url.protocol === "https:") &&
            (host === "localhost" || host === "127.0.0.1" || host === "::1")
        );
    } catch {
        return false;
    }
};

const configuredFrontendOrigins = String(config.general.frontendUrl || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean)
    .map(normalizeOrigin);

const allowedOrigins = [
    "http://localhost:5173",
    ...configuredFrontendOrigins,
]
    .filter(Boolean)
    .map(normalizeOrigin);

const allowedOriginSet = new Set(allowedOrigins);

app.use(helmet());

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 100, 
    message: "Too many requests from this IP, please try again after 15 minutes",
    standardHeaders: true, 
    legacyHeaders: false, 
});

app.use(express.json({ limit: '100mb' }))
app.use(express.urlencoded({ limit: '100mb', extended: true }))
app.use(cookieParser())


app.use(cors({
    origin: function (origin, callback) {
        const normalizedOrigin = normalizeOrigin(origin);
        const isProd = config.deployment.nodeEnv === "production";

        if (!normalizedOrigin) {
            callback(null, true);
            return;
        }

        if (!isProd && isDevLocalOrigin(normalizedOrigin)) {
            callback(null, true);
            return;
        }

        if (allowedOriginSet.has(normalizedOrigin)) {
            callback(null, true);
        } else {
            logger.warn("CORS blocked request", { origin: normalizedOrigin });
            callback(new AppError("Not allowed by CORS", 403));
        }
    },
    credentials: true,
    optionsSuccessStatus: 204,
}))

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


app.use(authRouter);
app.use(profileRouter);
app.use(requestRouter);
app.use(userRouter);
app.use(chatRouter);
app.use(messageRouter);
app.use(paymentRouter);
app.use(videoRouter);
app.use(notificationRouter);
app.use(projectRouter);
app.use(taskRouter);
app.use(buildLogRouter);
app.use(matchRouter);

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
