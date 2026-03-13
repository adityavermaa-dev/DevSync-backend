const express = require("express");
const app = express()
const cookieParser = require("cookie-parser")
const cors = require("cors")
const dotenv = require("dotenv")
const http = require("http");

const server = http.createServer(app);

dotenv.config();
app.use(express.json({ limit: '100mb' }))
app.use(express.urlencoded({ limit: '100mb', extended: true }))
app.use(express.raw({ limit: '100mb' }))
app.use(cookieParser())
app.use(cors({
    origin: "http://localhost:5173",
    credentials: true
}))

initializeSocket(server);

const connectDb = require("./config.js/database")
const authRouter = require("./routes/auth")
const profileRouter = require("./routes/profile")
const requestRouter = require("./routes/request")
const userRouter = require("./routes/user")
const videoRouter = require("./routes/videoRoutes")
const paymentRouter = require('./routes/payment');
const initializeSocket = require("./config.js/socket");
require("./utils/cronScheduleEmail");


app.use(authRouter);
app.use(profileRouter);
app.use(requestRouter);
app.use(userRouter);
app.use(paymentRouter);
app.use(videoRouter);

connectDb()
    .then(() => {
        console.log("Database connection successful")
        server.listen(process.env.PORT, () => {
            console.log("Server listens");
        });
    })
    .catch((error) => console.log("database cannot be connected", error))


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
