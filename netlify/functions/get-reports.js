exports.handler = async function (event) {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const SUPA_URL = process.env.SUPABASE_URL;
  const SUPA_KEY = process.env.SUPABASE_SECRET_KEY;

  if (!SUPA_URL || !SUPA_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: "Supabase not configured" }) };
  }

  try {
    const res = await fetch(SUPA_URL + "/rest/v1/reports?select=*&order=created_at.desc&limit=48", {
      headers: {
        "apikey": SUPA_KEY,
        "Authorization": "Bearer " + SUPA_KEY
      }
    });

    if (!res.ok) {
      const err = await res.text();
      return { statusCode: res.status, body: JSON.stringify({ error: err }) };
    }

    const data = await res.json();
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: "Failed to load reports", detail: err.message }) };
  }
};
