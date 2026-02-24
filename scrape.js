const https = require("https");

function apifyRequest(url, options) {
  return new Promise((resolve, reject) => {
    const isPost = options && options.method === "POST";
    const req = https.request(url, {
      method: isPost ? "POST" : "GET",
      headers: isPost ? { "Content-Type": "application/json" } : {},
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("end", () => {
        try { resolve(JSON.parse(data)); } catch (e) { resolve(data); }
      });
    });
    req.on("error", reject);
    if (isPost && options.body) req.write(options.body);
    req.end();
  });
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  var token = req.body.token;
  var actorId = req.body.actorId;
  var input = req.body.input;
  if (!token || !actorId) return res.status(400).json({ error: "Missing token or actorId" });
  actorId = actorId.replace("/", "~");
  try {
    var startData = await apifyRequest(
      "https://api.apify.com/v2/acts/" + actorId + "/runs?token=" + token,
      { method: "POST", body: JSON.stringify(input || {}) }
    );
    var runId = startData.data && startData.data.id;
    if (!runId) return res.status(500).json({ error: "No run ID", raw: JSON.stringify(startData).slice(0, 300) });
    var elapsed = 0;
    while (elapsed < 290000) {
      await new Promise(function(r) { setTimeout(r, 5000); });
      elapsed += 5000;
      var statusData = await apifyRequest("https://api.apify.com/v2/actor-runs/" + runId + "?token=" + token);
      var s = statusData.data;
      if (s.status === "SUCCEEDED") {
        var items = await apifyRequest("https://api.apify.com/v2/datasets/" + s.defaultDatasetId + "/items?token=" + token + "&format=json");
        return res.status(200).json({ ok: true, items: items });
      }
      if (["FAILED", "ABORTED", "TIMED-OUT"].indexOf(s.status) !== -1) {
        return res.status(500).json({ error: "Actor " + s.status });
      }
    }
    return res.status(504).json({ error: "Timeout" });
  } catch (e) { return res.status(500).json({ error: e.message }); }
};
