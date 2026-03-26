const nodemailer = require('nodemailer');
const { wrapEmail } = require("./emailTemplates");


const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: false,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

const sendEmail = async ({ to, subject, html, preheader }) => {
    await transporter.sendMail({
        from: `DevSync <${process.env.EMAIL_FROM}>`,
        to,
        subject,
        html: wrapEmail({ subject, preheader, contentHtml: html })
    });
};
module.exports = sendEmail;