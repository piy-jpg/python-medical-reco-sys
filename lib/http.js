function sendJson(response, statusCode, payload) {
  response.status(statusCode).json(payload);
}

function sendMethodNotAllowed(response) {
  sendJson(response, 405, { error: "Method not allowed" });
}

module.exports = {
  sendJson,
  sendMethodNotAllowed
};
