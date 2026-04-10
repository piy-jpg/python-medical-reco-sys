const {
  resolveSymptoms,
  predictDisease,
  buildRecommendation,
  store
} = require("../lib/medicalStore");
const { sendJson, sendMethodNotAllowed } = require("../lib/http");

module.exports = function handler(request, response) {
  if (request.method !== "POST") {
    sendMethodNotAllowed(response);
    return;
  }

  try {
    const payload = request.body || {};
    const submittedSymptoms = Array.isArray(payload.symptoms)
      ? payload.symptoms
      : String(payload.symptoms || "")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean);

    if (!submittedSymptoms.length) {
      sendJson(response, 400, {
        error: "Please enter at least one symptom."
      });
      return;
    }

    const { resolved, unknown } = resolveSymptoms(submittedSymptoms);
    if (!resolved.length) {
      sendJson(response, 400, {
        error: "None of the submitted symptoms matched the dataset.",
        unknown,
        suggestions: store.symptomSuggestions.slice(0, 12)
      });
      return;
    }

    const ranked = predictDisease(resolved);
    if (!ranked.length) {
      sendJson(response, 404, {
        error: "No disease match could be calculated from these symptoms."
      });
      return;
    }

    const bestMatch = ranked[0];
    const recommendation = buildRecommendation(bestMatch.disease);

    sendJson(response, 200, {
      submittedSymptoms,
      matchedSymptoms: resolved,
      unknownSymptoms: unknown,
      prediction: {
        disease: bestMatch.disease,
        confidence: Number((bestMatch.confidence * 100).toFixed(1))
      },
      recommendation,
      alternatives: ranked.slice(1, 4).map((item) => ({
        disease: item.disease,
        confidence: Number((item.confidence * 100).toFixed(1))
      }))
    });
  } catch (error) {
    sendJson(response, 500, {
      error: "The request could not be processed.",
      details: error.message
    });
  }
};
