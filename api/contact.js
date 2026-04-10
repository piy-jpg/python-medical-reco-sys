const { sendContactEmail } = require("../lib/contactMail");
const { sendJson, sendMethodNotAllowed } = require("../lib/http");

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    sendMethodNotAllowed(response);
    return;
  }

  try {
    const payload = request.body || {};
    const formData = {
      firstName: String(payload.firstName || "").trim(),
      lastName: String(payload.lastName || "").trim(),
      email: String(payload.email || "").trim(),
      subject: String(payload.subject || "").trim(),
      message: String(payload.message || "").trim()
    };

    const missingField = Object.entries(formData).find(([, value]) => !value);
    if (missingField) {
      sendJson(response, 400, {
        error: "Please fill in first name, last name, email, subject, and message."
      });
      return;
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(formData.email)) {
      sendJson(response, 400, { error: "Please enter a valid email address." });
      return;
    }

    const contactToEmail = await sendContactEmail(formData);
    sendJson(response, 200, {
      message: `Message sent successfully to ${contactToEmail}.`
    });
  } catch (error) {
    sendJson(response, 500, {
      error: error.message || "Message could not be sent right now."
    });
  }
};
