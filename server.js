const http = require("http");
const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");
const { URL } = require("url");

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "datasets", "archive");
const PORT = Number(process.env.PORT || 9000);
const HOST = process.env.HOST || "127.0.0.1";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

function loadEnvFile() {
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) {
    return;
  }

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      return;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, "");
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  });
}

loadEnvFile();

const CONTACT_TO_EMAIL = process.env.CONTACT_TO_EMAIL || "piyushverma730929@gmail.com";
const SMTP_HOST = process.env.SMTP_HOST || "smtp.gmail.com";
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USERNAME = process.env.SMTP_USERNAME || "";
const SMTP_PASSWORD = process.env.SMTP_PASSWORD || "";
const SMTP_USE_TLS = String(process.env.SMTP_USE_TLS || "true").toLowerCase() === "true";

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

function safeJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": MIME_TYPES[".json"] });
  response.end(JSON.stringify(payload));
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;
    });

    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });

    request.on("error", reject);
  });
}

function serveStatic(request, response, filePath) {
  if (!filePath.startsWith(PUBLIC_DIR)) {
    safeJson(response, 403, { error: "Forbidden" });
    return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    safeJson(response, 404, { error: "Not found" });
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  response.writeHead(200, {
    "Content-Type": MIME_TYPES[ext] || "application/octet-stream"
  });
  if (request.method === "HEAD") {
    response.end();
  } else {
    response.end(fs.readFileSync(filePath));
  }
}

function loadDataStore() {
  const trainingRows = loadCsv("Training.csv");
  const descriptions = loadCsv("description.csv");
  const precautions = loadCsv("precautions_df.csv");
  const medications = loadCsv("medications.csv");
  const diets = loadCsv("diets.csv");
  const workouts = loadCsv("workout_df.csv");

  const symptomHeaders = Object.keys(trainingRows[0]).filter(
    (key) => key !== "prognosis"
  );

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
      dedupe([
        item.Precaution_1,
        item.Precaution_2,
        item.Precaution_3,
        item.Precaution_4
      ])
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
    symptomHeaders,
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
        weightedScore / symptoms.length * 0.7 +
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

function handlePredict(request, response) {
  readJsonBody(request)
    .then((payload) => {
      const submittedSymptoms = Array.isArray(payload.symptoms)
        ? payload.symptoms
        : String(payload.symptoms || "")
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean);

      if (!submittedSymptoms.length) {
        safeJson(response, 400, {
          error: "Please enter at least one symptom."
        });
        return;
      }

      const { resolved, unknown } = resolveSymptoms(submittedSymptoms);
      if (!resolved.length) {
        safeJson(response, 400, {
          error: "None of the submitted symptoms matched the dataset.",
          unknown,
          suggestions: store.symptomSuggestions.slice(0, 12)
        });
        return;
      }

      const ranked = predictDisease(resolved);
      if (!ranked.length) {
        safeJson(response, 404, {
          error: "No disease match could be calculated from these symptoms."
        });
        return;
      }

      const bestMatch = ranked[0];
      const recommendation = buildRecommendation(bestMatch.disease);

      safeJson(response, 200, {
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
    })
    .catch((error) => {
      safeJson(response, 500, {
        error: "The request could not be processed.",
        details: error.message
      });
    });
}

async function sendContactEmail({ firstName, lastName, email, subject, message }) {
  if (!SMTP_USERNAME || !SMTP_PASSWORD) {
    throw new Error("SMTP credentials are missing. Update the .env file with SMTP_USERNAME and SMTP_PASSWORD.");
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: {
      user: SMTP_USERNAME,
      pass: SMTP_PASSWORD
    },
    requireTLS: SMTP_USE_TLS
  });

  await transporter.sendMail({
    from: `"MedRecSys Contact" <${SMTP_USERNAME}>`,
    to: CONTACT_TO_EMAIL,
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
}

function handleContact(request, response) {
  readJsonBody(request)
    .then(async (payload) => {
      const formData = {
        firstName: String(payload.firstName || "").trim(),
        lastName: String(payload.lastName || "").trim(),
        email: String(payload.email || "").trim(),
        subject: String(payload.subject || "").trim(),
        message: String(payload.message || "").trim()
      };

      const missingField = Object.entries(formData).find(([, value]) => !value);
      if (missingField) {
        safeJson(response, 400, {
          error: "Please fill in first name, last name, email, subject, and message."
        });
        return;
      }

      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailPattern.test(formData.email)) {
        safeJson(response, 400, { error: "Please enter a valid email address." });
        return;
      }

      await sendContactEmail(formData);
      safeJson(response, 200, {
        message: `Message sent successfully to ${CONTACT_TO_EMAIL}.`
      });
    })
    .catch((error) => {
      safeJson(response, 500, {
        error: error.message || "Message could not be sent right now."
      });
    });
}

async function handleGoogleAuth(request, response) {
  try {
    const payload = await readJsonBody(request);
    const { credential } = payload || {};
    if (!credential) {
      safeJson(response, 400, { success: false, error: "Missing Google credential." });
      return;
    }

    // 1. Verify token with Google's tokeninfo API
    const verifyRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
    if (!verifyRes.ok) {
      safeJson(response, 401, { success: false, error: "Invalid Google token." });
      return;
    }

    const tokenInfo = await verifyRes.json();
    const email = tokenInfo.email?.toLowerCase();
    const firstName = tokenInfo.given_name || tokenInfo.name || "User";
    const lastName = tokenInfo.family_name || "";
    const name = tokenInfo.name || `${firstName} ${lastName}`.trim();
    const picture = tokenInfo.picture || "";

    // 2. Generate session token
    const tokenData = {
      userId: tokenInfo.sub || `usr_${Date.now()}`,
      email,
      name,
      picture,
      exp: Date.now() + 7 * 24 * 60 * 60 * 1000
    };
    const sessionToken = Buffer.from(JSON.stringify(tokenData)).toString("base64url");

    safeJson(response, 200, {
      success: true,
      token: sessionToken,
      user: {
        id: tokenData.userId,
        email,
        firstName,
        lastName,
        name,
        picture
      }
    });
  } catch (err) {
    console.error("Google Auth Error:", err);
    safeJson(response, 500, { success: false, error: "Authentication service error." });
  }
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const pageRoutes = new Map([
    ["/", "index.html"],
    ["/home", "index.html"],
    ["/predict", "predict.html"],
    ["/results", "results.html"],
    ["/developer", "developer.html"],
    ["/contact", "contact.html"],
    ["/login", "login.html"],
    ["/signin", "login.html"]
  ]);

  if (request.method === "GET" && url.pathname === "/api/symptoms") {
    safeJson(response, 200, { symptoms: store.symptomSuggestions });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/predict") {
    handlePredict(request, response);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/contact") {
    handleContact(request, response);
    return;
  }

  if (request.method === "POST" && (url.pathname === "/api/auth/google" || url.pathname === "/api/auth-google")) {
    handleGoogleAuth(request, response);
    return;
  }

  if (url.pathname === "/api/auth/config" || url.pathname === "/api/auth-config") {
    if (request.method === "GET") {
      safeJson(response, 200, {
        googleClientId: process.env.GOOGLE_CLIENT_ID || ""
      });
      return;
    }
    if (request.method === "POST") {
      (async () => {
        try {
          const payload = await readJsonBody(request);
          const { googleClientId } = payload || {};
          if (googleClientId && typeof googleClientId === "string") {
            const cleanId = googleClientId.trim();
            process.env.GOOGLE_CLIENT_ID = cleanId;
            const envPath = path.join(ROOT, ".env");
            let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
            if (/^GOOGLE_CLIENT_ID=/m.test(content)) {
              content = content.replace(/^GOOGLE_CLIENT_ID=.*$/m, `GOOGLE_CLIENT_ID=${cleanId}`);
            } else {
              content = (content ? content.trimEnd() + "\n" : "") + `GOOGLE_CLIENT_ID=${cleanId}\n`;
            }
            fs.writeFileSync(envPath, content, "utf8");
            safeJson(response, 200, { success: true, googleClientId: cleanId });
            return;
          }
          safeJson(response, 400, { success: false, error: "Invalid client ID" });
        } catch (err) {
          safeJson(response, 500, { success: false, error: "Failed to save client ID" });
        }
      })();
      return;
    }
  }

  if ((request.method === "GET" || request.method === "HEAD") && pageRoutes.has(url.pathname)) {
    serveStatic(request, response, path.join(PUBLIC_DIR, pageRoutes.get(url.pathname)));
    return;
  }

  if (request.method === "GET" || request.method === "HEAD") {
    const requestedPath = path.normalize(
      path.join(PUBLIC_DIR, decodeURIComponent(url.pathname))
    );
    serveStatic(request, response, requestedPath);
    return;
  }

  safeJson(response, 405, { error: "Method not allowed" });
});

server.listen(PORT, HOST, () => {
  console.log(`MedRecSys Node app running at http://${HOST}:${PORT}`);
});
