/**
 * Live fire demo server for Rapid Response (Twilio optional).
 * - GET /health -> 200 ok
 * - POST /lead -> accepts JSON { source, payload, to? }
 *   logs payload and (if configured) sends Twilio SMS.
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");
const { URLSearchParams } = require("url");

function loadEnv() {
  const envPath = path.join(__dirname, "..", "..", ".env");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  lines.forEach(line => {
    if (!line || line.trim().startsWith("#")) return;
    const [key, ...rest] = line.split("=");
    if (!key) return;
    const value = rest.join("=").trim();
    if (!process.env[key]) process.env[key] = value;
  });
}

loadEnv();

const PORT = process.env.PORT || 3030;
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID || "";
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN || "";
const TWILIO_FROM = process.env.TWILIO_FROM || "";
const TWILIO_TO = process.env.TWILIO_TO || ""; // legacy comma-separated list
const TWILIO_TO_REPS = process.env.TWILIO_TO_REPS || "";
const TWILIO_TO_MANAGER = process.env.TWILIO_TO_MANAGER || "";

function sendTwilioSMS({ to, body }) {
  return new Promise((resolve, reject) => {
    if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_FROM || !to) {
      resolve({ ok: false, reason: "Twilio not configured" });
      return;
    }

    const params = new URLSearchParams();
    params.append("To", to);
    params.append("From", TWILIO_FROM);
    params.append("Body", body);

    const req = https.request(
      {
        hostname: "api.twilio.com",
        path: `/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization:
            "Basic " + Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString("base64")
        }
      },
      res => {
        let data = "";
        res.on("data", chunk => (data += chunk.toString()));
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ ok: true, status: res.statusCode });
          } else {
            resolve({ ok: false, status: res.statusCode, body: data });
          }
        });
      }
    );

    req.on("error", err => reject(err));
    req.write(params.toString());
    req.end();
  });
}

function parseRecipients(value) {
  return (value || "")
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);
}

function pickRecipients(...lists) {
  for (const list of lists) {
    if (list && list.length) return list;
  }
  return [];
}

function parseBody(req) {
  return new Promise(resolve => {
    let body = "";
    req.on("data", chunk => (body += chunk.toString()));
    req.on("end", () => resolve(body));
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method === "POST" && req.url === "/lead") {
    const raw = await parseBody(req);
    let data = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch (err) {
      // ignore
    }

    const source = data.source || "Unknown";
    const payload = data.payload || "";
    const recipients = pickRecipients(
      parseRecipients(data.to),
      parseRecipients(TWILIO_TO_REPS),
      parseRecipients(TWILIO_TO)
    );

    console.log("[Live Fire] Lead received:");
    console.log({ source, recipients });
    if (payload) console.log(payload);

    const message =
      data.message ||
      `Rapid Response: New ${source} lead received. Claim window active.`;
    const results = [];
    for (const to of recipients) {
      // eslint-disable-next-line no-await-in-loop
      const result = await sendTwilioSMS({ to, body: message });
      results.push({ to, result });
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, results }));
    return;
  }

  if (req.method === "POST" && req.url === "/escalate") {
    const raw = await parseBody(req);
    let data = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch (err) {
      // ignore
    }

    const source = data.source || "Unknown";
    const recipients = pickRecipients(
      parseRecipients(data.to),
      parseRecipients(TWILIO_TO_MANAGER),
      parseRecipients(TWILIO_TO)
    );

    console.log("[Live Fire] Escalation triggered:");
    console.log({ source, recipients });

    const message =
      data.message ||
      `Rapid Response: Lead unclaimed after 120s (${source}). Manager attention needed.`;
    const results = [];
    for (const to of recipients) {
      // eslint-disable-next-line no-await-in-loop
      const result = await sendTwilioSMS({ to, body: message });
      results.push({ to, result });
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, results }));
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not Found");
});

server.listen(PORT, () => {
  console.log(`[Live Fire] Server listening on http://localhost:${PORT}`);
  console.log("[Live Fire] Endpoints: GET /health, POST /lead, POST /escalate");
  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_FROM) {
    console.log("[Live Fire] Twilio not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM.");
  }
  if (!TWILIO_TO_REPS && !TWILIO_TO_MANAGER && !TWILIO_TO) {
    console.log("[Live Fire] Add TWILIO_TO_REPS and TWILIO_TO_MANAGER (or legacy TWILIO_TO).");
  }
});
