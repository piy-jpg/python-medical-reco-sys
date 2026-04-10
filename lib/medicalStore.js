const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(process.cwd(), "datasets", "archive");

function readFile(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        i += 1;
      }
      row.push(cell);
      cell = "";
      if (row.some((value) => value !== "")) {
        rows.push(row);
      }
      row = [];
      continue;
    }

    cell += char;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

function loadCsv(fileName) {
  const rows = parseCsv(readFile(path.join(DATA_DIR, fileName)));
  const headers = rows[0];
  return rows.slice(1).map((row) => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = row[index] ?? "";
    });
    return record;
  });
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_\s-]+/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function parseListString(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return [];
  }

  if (raw.startsWith("[") && raw.endsWith("]")) {
    return raw
      .slice(1, -1)
      .split(",")
      .map((item) => item.trim().replace(/^['"]|['"]$/g, ""))
      .filter(Boolean);
  }

  return [raw];
}

function dedupe(values) {
  return [...new Set(values.filter(Boolean))];
}

function loadDataStore() {
  const trainingRows = loadCsv("Training.csv");
  const descriptions = loadCsv("description.csv");
  const precautions = loadCsv("precautions_df.csv");
  const medications = loadCsv("medications.csv");
  const diets = loadCsv("diets.csv");
  const workouts = loadCsv("workout_df.csv");

  const symptomHeaders = Object.keys(trainingRows[0]).filter((key) => key !== "prognosis");
  const symptomLookup = new Map();

  symptomHeaders.forEach((symptom) => {
    symptomLookup.set(normalizeText(symptom), symptom);
  });

  const diseaseProfiles = new Map();
  trainingRows.forEach((row) => {
    const disease = row.prognosis;
    if (!diseaseProfiles.has(disease)) {
      diseaseProfiles.set(disease, {
        disease,
        rowCount: 0,
        symptomCounts: {},
        symptomSet: new Set()
      });
    }

    const profile = diseaseProfiles.get(disease);
    profile.rowCount += 1;

    symptomHeaders.forEach((symptom) => {
      if (row[symptom] === "1") {
        profile.symptomCounts[symptom] = (profile.symptomCounts[symptom] || 0) + 1;
        profile.symptomSet.add(symptom);
      }
    });
  });

  const descriptionsByDisease = new Map(
    descriptions.map((item) => [item.Disease, item.Description])
  );

  const precautionsByDisease = new Map(
    precautions.map((item) => [
      item.Disease,
      dedupe([item.Precaution_1, item.Precaution_2, item.Precaution_3, item.Precaution_4])
    ])
  );

  const medicationsByDisease = new Map(
    medications.map((item) => [item.Disease, parseListString(item.Medication)])
  );

  const dietsByDisease = new Map(
    diets.map((item) => [item.Disease, parseListString(item.Diet)])
  );

  const workoutsByDisease = new Map();
  workouts.forEach((item) => {
    const disease = item.disease;
    const existing = workoutsByDisease.get(disease) || [];
    if (item.workout) {
      existing.push(item.workout.trim());
    }
    workoutsByDisease.set(disease, dedupe(existing));
  });

  const symptomSuggestions = symptomHeaders
    .map((symptom) => ({
      value: symptom,
      label: symptom.replace(/_/g, " ")
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return {
    symptomLookup,
    diseaseProfiles,
    descriptionsByDisease,
    precautionsByDisease,
    medicationsByDisease,
    dietsByDisease,
    workoutsByDisease,
    symptomSuggestions
  };
}

const store = loadDataStore();

function resolveSymptoms(rawSymptoms) {
  const unknown = [];
  const resolved = dedupe(
    rawSymptoms.map((item) => {
      const cleaned = normalizeText(item);
      const match = store.symptomLookup.get(cleaned);
      if (!match && item.trim()) {
        unknown.push(item.trim());
      }
      return match || "";
    })
  );

  return { resolved, unknown };
}

function predictDisease(symptoms) {
  const ranked = [];

  store.diseaseProfiles.forEach((profile) => {
    let matchedCount = 0;
    let weightedScore = 0;

    symptoms.forEach((symptom) => {
      const count = profile.symptomCounts[symptom] || 0;
      if (count > 0) {
        matchedCount += 1;
        weightedScore += count / profile.rowCount;
      }
    });

    if (matchedCount > 0) {
      const diseaseBreadth = profile.symptomSet.size || 1;
      const confidence =
        (weightedScore / symptoms.length) * 0.7 +
        (matchedCount / diseaseBreadth) * 0.3;

      ranked.push({
        disease: profile.disease,
        confidence,
        matchedCount
      });
    }
  });

  ranked.sort((a, b) => {
    if (b.confidence !== a.confidence) {
      return b.confidence - a.confidence;
    }
    return b.matchedCount - a.matchedCount;
  });

  return ranked;
}

function buildRecommendation(disease) {
  return {
    disease,
    description:
      store.descriptionsByDisease.get(disease) ||
      "No description is available for this disease in the current dataset.",
    precautions: store.precautionsByDisease.get(disease) || [],
    medications: store.medicationsByDisease.get(disease) || [],
    diets: store.dietsByDisease.get(disease) || [],
    workouts: store.workoutsByDisease.get(disease) || []
  };
}

module.exports = {
  store,
  resolveSymptoms,
  predictDisease,
  buildRecommendation
};
