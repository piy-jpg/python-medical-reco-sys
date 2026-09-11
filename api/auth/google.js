const { sendJson, sendMethodNotAllowed } = require("../../lib/http");

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    sendMethodNotAllowed(response);
    return;
  }

  const { credential } = request.body || {};
  if (!credential) {
    sendJson(response, 400, { success: false, error: "Missing Google credential." });
    return;
  }

  try {
    // 1. Verify token with Google's tokeninfo API
    const verifyRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
    if (!verifyRes.ok) {
      sendJson(response, 401, { success: false, error: "Invalid Google token." });
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

    sendJson(response, 200, {
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
    sendJson(response, 500, { success: false, error: "Authentication service error." });
  }
};
