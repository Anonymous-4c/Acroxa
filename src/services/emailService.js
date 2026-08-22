// src/services/emailService.js
// Email service using nodemailer for SMTP-based email delivery.

const nodemailer = require("nodemailer");

let _transporter = null;

/**
 * Create or re-create the nodemailer transporter from settings.
 * @param {object} emailConfig - { host, port, username, password, encryption, senderName, senderAddress }
 */
function createTransporter(emailConfig) {
  const {
    host,
    port = 587,
    username,
    password,
    encryption = "starttls", // "ssl" | "starttls" | "none"
  } = emailConfig || {};

  if (!host) {
    throw new Error("SMTP host is required");
  }

  const secure = encryption === "ssl";
  const portNum = Number(port) || (secure ? 465 : 587);

  _transporter = nodemailer.createTransport({
    host,
    port: portNum,
    secure,
    auth: username && password ? { user: username, pass: password } : undefined,
    tls: encryption === "none" ? { rejectUnauthorized: false } : undefined,
    connectionTimeout: 10000,
    greetingTimeout: 5000,
  });

  return _transporter;
}

/**
 * Get the current transporter, creating from settings if needed.
 * @param {object} emailConfig - Email settings from the Settings model
 * @returns {object} nodemailer transporter
 */
function getTransporter(emailConfig) {
  if (!_transporter) {
    createTransporter(emailConfig);
  }
  return _transporter;
}

/**
 * Reset the cached transporter (call when settings change).
 */
function resetTransporter() {
  _transporter = null;
}

/**
 * Send an email.
 * @param {object} options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.text - Plain text body
 * @param {string} options.html - HTML body (optional)
 * @param {object} emailConfig - Email settings from the Settings model
 * @returns {object} nodemailer send result
 */
async function sendEmail({ to, subject, text, html }, emailConfig) {
  const transporter = getTransporter(emailConfig);

  const { senderAddress, senderName } = emailConfig || {};

  const from = senderName
    ? `${senderName} <${senderAddress || ""}>`
    : senderAddress || "noreply@acroxa.local";

  const result = await transporter.sendMail({
    from,
    to,
    subject,
    text,
    html: html || text,
  });

  return result;
}

/**
 * Test SMTP connection.
 * @param {object} emailConfig - Email settings
 * @returns {object} { success: boolean, message: string }
 */
async function testConnection(emailConfig) {
  try {
    const transporter = createTransporter(emailConfig);
    await transporter.verify();
    return { success: true, message: "SMTP connection successful" };
  } catch (err) {
    return { success: false, message: err.message || "SMTP connection failed" };
  }
}

/**
 * Send a test email.
 * @param {string} to - Recipient for the test email
 * @param {object} emailConfig - Email settings
 * @returns {object} { success: boolean, message: string }
 */
async function sendTestEmail(to, emailConfig) {
  try {
    const result = await sendEmail(
      {
        to,
        subject: "Acroxa CMS — Test Email",
        text: "This is a test email from your Acroxa CMS installation. If you received this, your email configuration is working correctly.",
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #333;">Acroxa CMS — Test Email</h2>
            <p>This is a test email from your Acroxa CMS installation.</p>
            <p>If you received this, your email configuration is working correctly.</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
            <p style="color: #999; font-size: 12px;">Sent at ${new Date().toISOString()}</p>
          </div>
        `,
      },
      emailConfig
    );
    return { success: true, message: `Test email sent successfully (messageId: ${result.messageId})` };
  } catch (err) {
    return { success: false, message: err.message || "Failed to send test email" };
  }
}

module.exports = {
  createTransporter,
  getTransporter,
  resetTransporter,
  sendEmail,
  testConnection,
  sendTestEmail,
};
