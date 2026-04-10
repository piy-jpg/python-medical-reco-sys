const { store } = require("../lib/medicalStore");
const { sendJson, sendMethodNotAllowed } = require("../lib/http");

module.exports = function handler(request, response) {
  if (request.method !== "GET") {
    sendMethodNotAllowed(response);
    return;
  }

  sendJson(response, 200, { symptoms: store.symptomSuggestions });
};
