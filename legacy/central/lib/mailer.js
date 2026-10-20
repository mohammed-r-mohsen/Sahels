const nodemailer = require('nodemailer');

const transporter = process.env.SMTP_USER ? nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
}) : null;

async function sendEmail({ to, subject, html, attachments }) {
    if (!transporter) {
        console.log('[EMAIL MOCK]', { to, subject });
        return;
    }
    await transporter.sendMail({
        from: process.env.SMTP_USER,
        to, subject, html, attachments
    });
}

module.exports = { sendEmail };