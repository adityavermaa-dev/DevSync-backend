const config = require("../config/index")
const AppError = require("../utils/AppError")
const logger = require("../utils/logger")

const errorHandler = (err,req,res,next) => {
    if (res.headersSent) {
        return next(err);
    }

    let normalizedError = err;

    // CORS errors
    if (normalizedError?.message === "Not allowed by CORS") {
        normalizedError = new AppError("Not allowed by CORS", 403);
    }

    // Multer errors
    if (normalizedError?.name === "MulterError") {
        normalizedError = new AppError(normalizedError.message, 400);
    }

    // Mongoose: invalid ObjectId
    if (normalizedError?.name === "CastError") {
        normalizedError = new AppError(
            `Invalid ${normalizedError.path}: ${normalizedError.value}`,
            400
        );
    }

    // Mongoose: validation
    if (normalizedError?.name === "ValidationError") {
        const messages = Object.values(normalizedError.errors || {})
            .map((e) => e.message)
            .filter(Boolean);
        normalizedError = new AppError(messages.join(", ") || "Invalid input", 400);
    }

    // Mongo duplicate key
    if (normalizedError?.code === 11000) {
        const fields = normalizedError.keyValue
            ? Object.keys(normalizedError.keyValue).join(", ")
            : "field";
        normalizedError = new AppError(`Duplicate value for ${fields}`, 409);
    }

    // JWT errors
    if (normalizedError?.name === "JsonWebTokenError") {
        normalizedError = new AppError("Invalid token. Please log in again.", 401);
    }
    if (normalizedError?.name === "TokenExpiredError") {
        normalizedError = new AppError("Token expired. Please log in again.", 401);
    }

    const statusCode = normalizedError.statusCode || 500;
    const message = normalizedError.message || "Internal Server Error";

    const logMeta = {
        statusCode,
        method: req.method,
        path: req.originalUrl,
    };

    if (statusCode >= 500) {
        logger.error(message, { ...logMeta, error: normalizedError });
    } else {
        logger.warn(message, { ...logMeta });
    }

    res.status(statusCode).json({
        success: false,
        message,
        error:
            config.deployment.nodeEnv === "development"
                ? normalizedError.stack
                : undefined,
    });
}

module.exports = errorHandler;