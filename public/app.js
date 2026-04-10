const PREDICTION_STORAGE_KEY = "medrecsys:lastPrediction";

const form = document.getElementById("prediction-form");
const textarea = document.getElementById("symptoms");
const helperText = document.getElementById("helper-text");
const statusPill = document.getElementById("status-pill");
const emptyState = document.getElementById("empty-state");
const results = document.getElementById("results");
const symptomList = document.getElementById("symptom-list");
const symptomSearch = document.getElementById("symptom-search");
const contactForm = document.getElementById("contact-form");
const contactHelperText = document.getElementById("contact-helper-text");
const contactStatusPill = document.getElementById("contact-status-pill");
const contactSubmitButton = document.getElementById("contact-submit");

const predictedDisease = document.getElementById("predicted-disease");
const predictedDescription = document.getElementById("predicted-description");
const confidenceScore = document.getElementById("confidence-score");
const matchedSymptoms = document.getElementById("matched-symptoms");
const unknownSymptoms = document.getElementById("unknown-symptoms");
const precautionsList = document.getElementById("precautions-list");
const medicationsList = document.getElementById("medications-list");
const dietsList = document.getElementById("diets-list");
const workoutsList = document.getElementById("workouts-list");
const alternativesList = document.getElementById("alternatives-list");
const resultSummary = document.getElementById("result-summary");
const resultTimestamp = document.getElementById("result-timestamp");
const resultCta = document.getElementById("result-cta");

let cachedSymptoms = [];

function createListItems(container, items, fallback) {
  if (!container) {
    return;
  }

  container.innerHTML = "";
  const values = items && items.length ? items : [fallback];
  values.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    container.appendChild(li);
  });
}

function setLoadingState(isLoading) {
  if (!form || !statusPill) {
    return;
  }

  const submitButton = form.querySelector("button[type='submit']");
  if (submitButton) {
    submitButton.disabled = isLoading;
    submitButton.textContent = isLoading ? "Analyzing..." : "Analyze symptoms";
  }

  statusPill.textContent = isLoading ? "Analyzing" : "Ready";
}

function showError(message) {
  if (helperText) {
    helperText.textContent = message;
  }
  if (statusPill) {
    statusPill.textContent = "Needs attention";
  }
}

function setContactLoadingState(isLoading) {
  if (!contactSubmitButton) {
    return;
  }

  contactSubmitButton.disabled = isLoading;
  contactSubmitButton.textContent = isLoading ? "Sending..." : "Send message";
  if (contactStatusPill) {
    contactStatusPill.textContent = isLoading ? "Sending" : "Ready to send";
  }
}

function showContactMessage(message, isError = false) {
  if (!contactHelperText) {
    return;
  }

  contactHelperText.textContent = message;
  contactHelperText.classList.toggle("error-text", isError);
  contactHelperText.classList.toggle("success-text", !isError);

  if (contactStatusPill) {
    contactStatusPill.textContent = isError ? "Delivery failed" : "Message sent";
  }
}

function formatTimestamp(timestamp) {
  return new Date(timestamp).toLocaleString();
}

function renderResults(data) {
  if (!predictedDisease || !predictedDescription || !confidenceScore) {
    return;
  }

  predictedDisease.textContent = data.prediction.disease;
  predictedDescription.textContent = data.recommendation.description;
  confidenceScore.textContent = `${data.prediction.confidence}%`;

  if (matchedSymptoms) {
    matchedSymptoms.textContent = data.matchedSymptoms.join(", ");
  }

  if (unknownSymptoms) {
    unknownSymptoms.textContent = data.unknownSymptoms.length
      ? data.unknownSymptoms.join(", ")
      : "None";
  }

  createListItems(precautionsList, data.recommendation.precautions, "No precautions listed.");
  createListItems(medicationsList, data.recommendation.medications, "No medications listed.");
  createListItems(dietsList, data.recommendation.diets, "No diet suggestions listed.");
  createListItems(workoutsList, data.recommendation.workouts, "No workout suggestions listed.");

  if (alternativesList) {
    alternativesList.innerHTML = "";
    const alternatives = data.alternatives.length
      ? data.alternatives
      : [{ disease: "No close alternatives", confidence: 0 }];

    alternatives.forEach((item) => {
      const chip = document.createElement("div");
      chip.className = "alternative-item";
      chip.textContent = `${item.disease} · ${item.confidence}%`;
      alternativesList.appendChild(chip);
    });
  }

  if (resultSummary) {
    resultSummary.textContent = `Best match based on ${data.matchedSymptoms.length} matched symptom${data.matchedSymptoms.length === 1 ? "" : "s"}.`;
  }

  if (resultTimestamp && data.generatedAt) {
    resultTimestamp.textContent = `Generated on ${formatTimestamp(data.generatedAt)}`;
  }

  if (resultCta) {
    resultCta.classList.remove("hidden");
  }

  if (statusPill) {
    statusPill.textContent = "Analysis complete";
  }

  if (emptyState) {
    emptyState.classList.add("hidden");
  }

  if (results) {
    results.classList.remove("hidden");
  }
}

function savePrediction(data) {
  sessionStorage.setItem(
    PREDICTION_STORAGE_KEY,
    JSON.stringify({
      ...data,
      generatedAt: new Date().toISOString()
    })
  );
}

function getSavedPrediction() {
  const saved = sessionStorage.getItem(PREDICTION_STORAGE_KEY);
  return saved ? JSON.parse(saved) : null;
}

async function loadSymptoms() {
  if (!symptomList) {
    return;
  }

  const response = await fetch("/api/symptoms");
  const data = await response.json();
  cachedSymptoms = data.symptoms || [];
  renderSymptoms(cachedSymptoms);
}

function appendSymptom(value) {
  if (!textarea) {
    return;
  }

  const current = textarea.value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (!current.includes(value)) {
    current.push(value);
  }
  textarea.value = current.join(", ");
}

function renderSymptoms(items) {
  if (!symptomList) {
    return;
  }

  symptomList.innerHTML = "";
  items.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "symptom-token";
    button.textContent = item.label;
    button.addEventListener("click", () => appendSymptom(item.label));
    symptomList.appendChild(button);
  });
}

document.querySelectorAll("[data-example]").forEach((button) => {
  button.addEventListener("click", () => {
    if (!textarea) {
      window.location.href = `/predict?example=${encodeURIComponent(button.dataset.example)}`;
      return;
    }

    textarea.value = button.dataset.example;
    textarea.focus();
  });
});

if (textarea) {
  const params = new URLSearchParams(window.location.search);
  const example = params.get("example");
  if (example) {
    textarea.value = example;
  }
}

symptomSearch?.addEventListener("input", () => {
  const term = symptomSearch.value.trim().toLowerCase();
  const filtered = !term
    ? cachedSymptoms
    : cachedSymptoms.filter((item) => item.label.toLowerCase().includes(term));
  renderSymptoms(filtered);
});

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setLoadingState(true);

  try {
    const response = await fetch("/api/predict", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ symptoms: textarea.value })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Prediction failed.");
    }

    savePrediction(data);
    window.location.href = "/results";
  } catch (error) {
    showError(error.message);
  } finally {
    setLoadingState(false);
  }
});

contactForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setContactLoadingState(true);

  const payload = {
    firstName: document.getElementById("contact-first-name").value.trim(),
    lastName: document.getElementById("contact-last-name").value.trim(),
    email: document.getElementById("contact-email").value.trim(),
    subject: document.getElementById("contact-subject").value.trim(),
    message: document.getElementById("contact-message").value.trim()
  };

  try {
    const response = await fetch("/api/contact", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Message could not be sent.");
    }

    contactForm.reset();
    showContactMessage(data.message || "Message sent successfully.");
  } catch (error) {
    showContactMessage(error.message, true);
  } finally {
    setContactLoadingState(false);
  }
});

if (results) {
  const savedPrediction = getSavedPrediction();
  if (savedPrediction) {
    renderResults(savedPrediction);
  } else if (statusPill) {
    statusPill.textContent = "Waiting for prediction";
  }
}

loadSymptoms().catch(() => {
  if (helperText) {
    helperText.textContent = "The symptom catalog could not be loaded.";
  }
});
