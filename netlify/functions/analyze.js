exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }
  const KEY = process.env.ANTHROPIC_API_KEY;
  if (!KEY) return { statusCode: 500, body: JSON.stringify({ error: "API key not configured" }) };
  let body;
  try { body = JSON.parse(event.body); } catch { return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) }; }
  const { reviews, reportDate } = body;

  async function callClaude(prompt, maxTokens) {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] })
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error ? d.error.message : "API error");
    return d.content.map(function(i) { return i.text || ""; }).join("").replace(/```json|```/g, "").trim();
  }

  function parseStars(text) {
    if (!text) return { count: 0, avg: null, lines: [] };
    const lines = text.split(/\n+/).map(function(l) { return l.trim(); }).filter(Boolean);
    const ratings = [];
    lines.forEach(function(l) { const m = l.match(/^([1-5])\s*[-–]/); if (m) ratings.push(parseInt(m[1])); });
    const count = Math.max(ratings.length, lines.length);
    const avg = ratings.length > 0 ? Math.round((ratings.reduce(function(a,b){return a+b;},0) / ratings.length) * 10) / 10 : null;
    return { count: ratings.length || lines.length, avg, lines: lines };
  }

  const platKeys = ["google", "wix", "trustpilot", "bbb"];
  const parsed = {};
  platKeys.forEach(function(k) { parsed[k] = parseStars(reviews && reviews[k] && reviews[k].text); });

  let totalScore = 0, totalCount = 0;
  platKeys.forEach(function(k) { if (parsed[k].avg && parsed[k].count) { totalScore += parsed[k].avg * parsed[k].count; totalCount += parsed[k].count; } });
  const overallScore = totalCount > 0 ? Math.round((totalScore / totalCount) * 10) / 10 : null;

  let promoters = 0, passives = 0, detractors = 0, npsTotal = 0;
  platKeys.forEach(function(k) {
    const txt = reviews && reviews[k] && reviews[k].text;
    if (!txt) return;
    txt.split(/\n+/).forEach(function(l) {
      const m = l.match(/^([1-5])\s*[-–]/);
      if (m) { npsTotal++; const s = parseInt(m[1]); if (s >= 5) promoters++; else if (s >= 3) passives++; else detractors++; }
    });
  });
  const npsScore = npsTotal > 0 ? Math.round(((promoters - detractors) / npsTotal) * 100) : 0;
  const npsBreakdown = { promoters: npsTotal > 0 ? Math.round((promoters/npsTotal)*100) : 0, passives: npsTotal > 0 ? Math.round((passives/npsTotal)*100) : 0, detractors: npsTotal > 0 ? Math.round((detractors/npsTotal)*100) : 0 };

  const reviewCounts = {};
  const platformScores = {};
  platKeys.forEach(function(k) { reviewCounts[k] = parsed[k].count || null; platformScores[k] = parsed[k].avg || null; });

  const condensed = platKeys.map(function(k) {
    if (!parsed[k].count) return "";
    return k.toUpperCase() + " (" + parsed[k].count + " reviews, avg " + (parsed[k].avg || "N/A") + "/5):\n" + parsed[k].lines.slice(0, 12).join("\n");
  }).filter(Boolean).join("\n\n");

  const platData = platKeys.map(function(k) {
    if (!parsed[k].count) return "";
    return k.toUpperCase() + ":\n" + parsed[k].lines.slice(0, 20).join("\n");
  }).filter(Boolean).join("\n\n");

  try {
    const [summaryRaw, platRaw] = await Promise.all([
      callClaude(`Zoek Marketing review analyst. Respond ONLY with raw JSON no markdown.
DATE: ${reportDate||"not specified"} OVERALL: ${overallScore}/5

${condensed}

{"whatsGoingRight":"<2 sentences>","areaOfConcern":"<2 sentences>","needsImmediateAttention":"<2 sentences or No critical issues>","overallSummary":"<3 sentences>","trend":"up|down|stable","trendReason":"<one sentence>","positiveTrendNotes":["<note>","<note>"],"negativeTrendNotes":["<note>","<note>"],"topPositiveKeywords":["<w>","<w>","<w>","<w>","<w>","<w>","<w>","<w>","<w>","<w>"],"topNegativeKeywords":["<w>","<w>","<w>","<w>","<w>","<w>","<w>","<w>","<w>","<w>"],"radar":{"areas":["Sales","Operations","Customer Success","Communications","Product/Delivery"],"strengths":[<1-10>,<1-10>,<1-10>,<1-10>,<1-10>],"improvements":[<1-10>,<1-10>,<1-10>,<1-10>,<1-10>],"leadershipRecs":[{"area":"<area>","rec":"<constructive rec>","department":"<dept>","priority":"high|medium|low"},{"area":"<area>","rec":"<rec>","department":"<dept>","priority":"high|medium|low"}]},"positiveShoutouts":[{"name":"<full name if mentioned>","reason":"<10 words>","platform":"<platform>","reviewStars":<n>}],"negativeFlags":[{"name":"<full name if mentioned>","reason":"<10 words>","platform":"<platform>","severity":"high|medium|low"}]}
IMPORTANT: positiveShoutouts only if real person name explicitly praised. negativeFlags only if real name explicitly criticized. Use [] if none found.`, 1600),

      callClaude(`Zoek Marketing review analyst. Respond ONLY with raw JSON no markdown.

${platData}

{"google":${parsed.google.count>0?'{"summary":"<2 sentences>","positiveThemes":["<t>","<t>","<t>"],"negativeThemes":["<t>","<t>","<t>"],"positiveSnippets":["<exact quote under 15 words>","<quote>","<quote>"],"negativeSnippets":["<exact quote under 15 words>","<quote>","<quote>"],"actionItems":[{"action":"<action>","department":"Sales|Operations|Customer Success|Communications|Product/Delivery|Leadership"},{"action":"<action>","department":"<dept>"}]}':"null"},"wix":${parsed.wix.count>0?'{"summary":"<2 sentences>","positiveThemes":["<t>","<t>","<t>"],"negativeThemes":["<t>","<t>","<t>"],"positiveSnippets":["<quote>","<quote>","<quote>"],"negativeSnippets":["<quote>","<quote>","<quote>"],"actionItems":[{"action":"<action>","department":"<dept>"},{"action":"<action>","department":"<dept>"}]}':"null"},"trustpilot":${parsed.trustpilot.count>0?'{"summary":"<2 sentences>","positiveThemes":["<t>","<t>","<t>"],"negativeThemes":["<t>","<t>","<t>"],"positiveSnippets":["<quote>","<quote>","<quote>"],"negativeSnippets":["<quote>","<quote>","<quote>"],"actionItems":[{"action":"<action>","department":"<dept>"},{"action":"<action>","department":"<dept>"}]}':"null"},"bbb":${parsed.bbb.count>0?'{"summary":"<2 sentences>","positiveThemes":["<t>","<t>"],"negativeThemes":["<t>","<t>"],"positiveSnippets":["<quote>","<quote>","<quote>"],"negativeSnippets":["<quote>","<quote>","<quote>"],"actionItems":[{"action":"<action>","department":"<dept>"},{"action":"<action>","department":"<dept>"}]}':"null"}}`, 1600)
    ]);

    const summary = JSON.parse(summaryRaw);
    const platforms = JSON.parse(platRaw);

    const report = {
      overallScore,
      reviewCounts,
      platformScores,
      npsScore,
      npsBreakdown,
      trend: summary.trend || "stable",
      trendReason: summary.trendReason || "",
      whatsGoingRight: summary.whatsGoingRight || "",
      areaOfConcern: summary.areaOfConcern || "",
      needsImmediateAttention: summary.needsImmediateAttention || "No critical issues identified",
      overallSummary: summary.overallSummary || "",
      positiveTrendNotes: summary.positiveTrendNotes || [],
      negativeTrendNotes: summary.negativeTrendNotes || [],
      topPositiveKeywords: summary.topPositiveKeywords || [],
      topNegativeKeywords: summary.topNegativeKeywords || [],
      radar: summary.radar || {},
      positiveShoutouts: summary.positiveShoutouts || [],
      negativeFlags: summary.negativeFlags || [],
      platforms
    };

    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(report) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: "Analysis failed", detail: err.message }) };
  }
};
