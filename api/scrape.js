export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const { token, actorId, input } = req.body;
  if (!token || !actorId) return res.status(400).json({ error: "Missing token or actorId" });
  try {
    const startRes = await fetch("https://api.apify.com/v2/acts/" + actorId + "/runs?token=" + token, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input || {}),
    });
    if (!startRes.ok) return res.status(startRes.status).json({ error: "Apify: " + (await startRes.text()) });
    const run = (await startRes.json()).data;
    let elapsed = 0;
    while (elapsed < 290000) {
      await new Promise(r => setTimeout(r, 5000));
      elapsed += 5000;
      const sr = await fetch("https://api.apify.com/v2/actor-runs/" + run.id + "?token=" + token);
      const s = (await sr.json()).data;
      if (s.status === "SUCCEEDED") {
        const ir = await fetch("https://api.apify.com/v2/datasets/" + s.defaultDatasetId + "/items?token=" + token + "&format=json");
        return res.status(200).json({ ok: true, items: await ir.json() });
      }
      if (["FAILED","ABORTED","TIMED-OUT"].includes(s.status)) return res.status(500).json({ error: "Actor " + s.status });
    }
    return res.status(504).json({ error: "Timeout" });
  } catch (e) { return res.status(500).json({ error: e.message }); }
}
