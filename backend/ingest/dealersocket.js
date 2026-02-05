/**
 * Placeholder DealerSocket ingest handler (demo only).
 * Accepts POST, logs payload, returns HTTP 200.
 */
const http = require("http");

const PORT = process.env.PORT || 3030;

const server = http.createServer((req, res) => {
  if (req.method !== "POST" || req.url !== "/ingest/dealersocket") {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not Found");
    return;
  }

  let body = "";
  req.on("data", chunk => {
    body += chunk.toString();
  });

  req.on("end", () => {
    console.log("[DealerSocket Ingest] Payload received:");
    console.log(body || "(empty)");
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
  });
});

server.listen(PORT, () => {
  console.log(`[DealerSocket Ingest] Listening on http://localhost:${PORT}/ingest/dealersocket`);
});
