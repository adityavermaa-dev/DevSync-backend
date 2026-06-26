const dotenv = require('dotenv');

dotenv.config();

const requiredEnv = [
    "JWT_SECRET",
    "NODE_ENV",
    "GOOGLE_CLIENT_ID",
    "MONGO_URI",
    "PORT",
    "GITHUB_CLIENT_ID",
    "GITHUB_CLIENT_SECRET",
    "AWS_ACCESS_KEY",
    "AWS_SECRET_KEY",
    "CLOUDINARY_CLOUD_NAME",
    "CLOUDINARY_API_KEY",
    "CLOUDINARY_API_SECRET",
    "RAZORPAY_KEYID",
    "RAZORPAY_KEY_SECRET",
    "RAZORPAY_WEBHOOK_SECRET",
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_USER",
    "SMTP_PASS",
    "EMAIL_FROM",
    "BACKEND_URL",
    "FRONTEND_URL"
]

requiredEnv.forEach((key) => {
    if (!process.env[key]) {
        throw new Error(`Missing environment variable: ${key}`);
    }
});

const config = {
    port : process.env.PORT,
    dbUrl : process.env.MONGO_URI,

    auth : {
        jwtSecret : process.env.JWT_SECRET
    },

    oauth : {
        googleClientId : process.env.GOOGLE_CLIENT_ID,
        githubClientId : process.env.GITHUB_CLIENT_ID,
        githubClientSecret : process.env.GITHUB_CLIENT_SECRET,
        githubCallbackUrl : process.env.GITHUB_CALLBACK_URL
    },

    email : {
        smtpHost : process.env.SMTP_HOST,
        smtpPort : process.env.SMTP_PORT,
        smtpUser : process.env.SMTP_USER,
        smtpPass : process.env.SMTP_PASS,
        fromEmail : process.env.EMAIL_FROM
    },

    finance : {
        razorpayKeyId : process.env.RAZORPAY_KEYID,
        razorpayKeySecret : process.env.RAZORPAY_KEY_SECRET,
        razorpayWebhookSecret : process.env.RAZORPAY_WEBHOOK_SECRET
    },

    storage : {
        cloudinaryCloudName : process.env.CLOUDINARY_CLOUD_NAME,
        cloudinaryApiKey : process.env.CLOUDINARY_API_KEY,
        cloudinaryApiSecret : process.env.CLOUDINARY_API_SECRET
    },

    deployment : {
        nodeEnv : process.env.NODE_ENV,
        awsAccessKey : process.env.AWS_ACCESS_KEY,
        awsSecretKey : process.env.AWS_SECRET_KEY
    },

    general : {
        backendUrl : process.env.BACKEND_URL,
        frontendUrl : process.env.FRONTEND_URL
    }
}

module.exports = config;
