const fs = require("fs");
const path = require("path");
const { createLogger, format, transports } = require("winston");

const logsDir = path.resolve(process.cwd(), "logs");
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

const nodeEnv = process.env.NODE_ENV || "development";

const logger = createLogger({
    level: nodeEnv === "development" ? "debug" : "info",
    format: format.combine(
        format.timestamp(),
        format.errors({ stack: true }),
        format.json()
    ),
    transports: [
        new transports.File({ filename: path.join(logsDir, "error.log"), level: "error" }),
        new transports.File({ filename: path.join(logsDir, "combined.log") }),
        ...(nodeEnv === "development"
            ? [
                new transports.Console({
                    format: format.combine(
                        format.colorize(),
                        format.timestamp(),
                        format.printf(({ level, message, timestamp, ...meta }) => {
                            const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
                            return `${timestamp} ${level}: ${message}${metaStr}`;
                        })
                    ),
                }),
            ]
            : []),
    ],
});

module.exports = logger;