exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const KEY = process.env.ANTHROPIC_API_KEY;
  if (!KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: "API key not configured" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const { reviews, reportDate } = body;
  const pb = (name, d) => d && d.text ? `${name}:\n${d.text}` : `${name}: no data`;

  const prompt = `You are a customer insights analyst for Zoek Marketing. Parse reviews formatted as "STAR_RATING - review text" and calculate TRUE averages from individual ratings.

REPORT DATE: ${reportDate || "not specified"}

REVIEWS:
${pb("GOOGLE", reviews && reviews.google)}
${pb("WIX", reviews && reviews.wix)}
${pb("TRUSTPILOT", reviews && reviews.trustpilot)}
${pb("BBB", reviews && reviews.bbb)}

Respond ONLY with raw JSON, no markdown, no backticks, no extra text:
{
  "overallScore": <weighted avg 1.0-5.0>,
  "reviewCounts": { "google": <n or null>, "wix": <n or null>, "trustpilot": <n or null>, "bbb": <n or null> },
  "platformScores": { "google": <avg or null>, "wix": <avg or null>, "trustpilot": <avg or null>, "bbb": <avg or null> },
  "trend": "up",
  "trendReason": "<one sentence>",
  "npsScore": <-100 to 100>,
  "npsBreakdown": { "promoters": <pct 0-100>, "passives": <pct 0-100>, "detractors": <pct 0-100> },
  "topPositiveKeywords": ["<word>","<word>","<word>","<word>","<word>","<word>","<word>","<word>","<word>","<word>"],
  "topNegativeKeywords": ["<word>","<word>","<word>","<word>","<word>","<word>","<word>","<word>","<word>","<word>"],
  "whatsGoingRight": "<2-3 sentences>",
  "areaOfConcern": "<2-3 sentences>",
  "needsImmediateAttention": "<2-3 sentences or No critical issues identified>",
  "overallSummary": "<3-4 sentence executive summary>",
  "positiveTrendNotes": ["<observation>","<observation>"],
  "negativeTrendNotes": ["<observation>","<observation>"],
  "platforms": {
    "google": { "summary": "<2-3 sentences>", "positiveThemes": ["<t>","<t>","<t>"], "negativeThemes": ["<t>","<t>","<t>"], "positiveSnippets": ["<quote max 20 words>","<quote>","<quote>"], "negativeSnippets": ["<quote max 20 words>","<quote>","<quote>"], "actionItems": [{"action":"<action>","department":"Sales"},{"action":"<action>","department":"Operations"}] },
    "wix": { "summary": "<2-3 sentences>", "positiveThemes": ["<t>","<t>","<t>"], "negativeThemes": ["<t>","<t>","<t>"], "positiveSnippets": ["<quote>","<quote>","<quote>"], "negativeSnippets": ["<quote>","<quote>","<quote>"], "actionItems": [{"action":"<action>","department":"Customer Success"},{"action":"<action>","department":"Communications"}] },
    "trustpilot": { "summary": "<2-3 sentences>", "positiveThemes": ["<t>","<t>","<t>"], "negativeThemes": ["<t>","<t>","<t>"], "positiveSnippets": ["<quote>","<quote>","<quote>"], "negativeSnippets": ["<quote>","<quote>","<quote>"], "actionItems": [{"action":"<action>","department":"Operations"},{"action":"<action>","department":"Sales"}] },
    "bbb": { "summary": "<2-3 sentences>", "positiveThemes": ["<t>","<t>"], "negativeThemes": ["<t>","<t>"], "positiveSnippets": ["<quote>","<quote>","<quote>"], "negativeSnippets": ["<quote>","<quote>","<quote>"], "actionItems": [{"action":"<action>","department":"Customer Success"},{"action":"<action>","department":"Leadership"}] }
  },
  "radar": {
    "areas": ["Sales","Operations","Customer Success","Communications","Product/Delivery"],
    "strengths": [<1-10>,<1-10>,<1-10>,<1-10>,<1-10>],
    "improvements": [<1-10>,<1-10>,<1-10>,<1-10>,<1-10>],
    "leadershipRecs": [{"area":"<area>","rec":"<constructive 1-2 sentence rec>","department":"<dept>","priority":"high"}]
  },
  "positiveShoutouts": [{"name":"<full name>","reason":"<max 12 words>","platform":"<platform>","reviewStars":<stars>}],
  "negativeFlags": [{"name":"<full name>","reason":"<max 12 words>","platform":"<platform>","severity":"medium"}]
}

RULES:
- Parse every "N - text" line for TRUE star averages
- npsScore: 5 star = promoter, 3-4 star = passive, 1-2 star = detractor. NPS = promoters% minus detractors%
- positiveSnippets and negativeSnippets: real quotes from reviews only, null if fewer than 3
- positiveShoutouts: ONLY real names explicitly mentioned positively, empty array if none
- negativeFlags: ONLY real names explicitly mentioned negatively, empty array if none
- Deduplicate names across platforms
- Platforms with no data: use null for scores, empty arrays for lists`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 3500,
        messages: [{ role: "user", content: prompt }]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: data.error ? data.error.message : "API error" })
      };
    }

    const raw = data.content.map(function(i) { return i.text || ""; }).join("").replace(/```json|```/g, "").trim();

    JSON.parse(raw);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: raw
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Analysis failed", detail: err.message })
    };
  }
};
