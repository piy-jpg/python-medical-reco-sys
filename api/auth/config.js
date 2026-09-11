const { sendJson, sendMethodNotAllowed } = require("../../lib/http");

module.exports = async function handler(request, response) {
  if (request.method !== "GET") {
    sendMethodNotAllowed(response);
    return;
  }

  sendJson(response, 200, {
    googleClientId: process.env.GOOGLE_CLIENT_ID || ""
  });
};
