exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const SUPA_URL = process.env.SUPABASE_URL;
  const SUPA_KEY = process.env.SUPABASE_SECRET_KEY;

  if (!SUPA_URL || !SUPA_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: "Supabase not configured" }) };
  }

  let body;
  try { body = JSON.parse(event.body); } catch { return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) }; }

  const { id } = body;
  if (!id) return { statusCode: 400, body: JSON.stringify({ error: "Missing report ID" }) };

  try {
    const res = await fetch(SUPA_URL + "/rest/v1/reports?id=eq." + id, {
      method: "DELETE",
      headers: {
        "apikey": SUPA_KEY,
        "Authorization": "Bearer " + SUPA_KEY,
        "Prefer": "return=minimal"
      }
    });

    if (!res.ok) {
      const err = await res.text();
      return { statusCode: res.status, body: JSON.stringify({ error: err }) };
    }

    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: "Delete failed", detail: err.message }) };
  }
};
