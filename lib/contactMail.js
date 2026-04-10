const nodemailer = require("nodemailer");

async function sendContactEmail({ firstName, lastName, email, subject, message }) {
  const contactToEmail = process.env.CONTACT_TO_EMAIL || "piyushverma730929@gmail.com";
  const smtpHost = process.env.SMTP_HOST || "smtp.gmail.com";
  const smtpPort = Number(process.env.SMTP_PORT || 587);
  const smtpUsername = process.env.SMTP_USERNAME || "";
  const smtpPassword = process.env.SMTP_PASSWORD || "";
  const smtpUseTls = String(process.env.SMTP_USE_TLS || "true").toLowerCase() === "true";

  if (!smtpUsername || !smtpPassword) {
    throw new Error(
      "SMTP credentials are missing. Add SMTP_USERNAME and SMTP_PASSWORD in your environment settings."
    );
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: {
      user: smtpUsername,
      pass: smtpPassword
    },
    requireTLS: smtpUseTls
  });

  await transporter.sendMail({
    from: `"MedRecSys Contact" <${smtpUsername}>`,
    to: contactToEmail,
    replyTo: email,
    subject: `MedRecSys contact: ${subject}`,
    text: [
      "You received a new contact form message.",
      "",
      `First Name: ${firstName}`,
      `Last Name: ${lastName}`,
      `Email Address: ${email}`,
      `Subject: ${subject}`,
      "",
      "Message:",
      message
    ].join("\n")
  });

  return contactToEmail;
}

module.exports = {
  sendContactEmail
};
