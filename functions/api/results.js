export async function onRequestGet({ request, env }) {
  try {
    if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
      return json({ ok: false, error: "Server error: Missing Supabase config" }, 500);
    }

    const auth = request.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) {
      return json({ ok: false, error: "Unauthorized" }, 401);
    }
    const token = auth.slice(7);

    // Validate JWT
    const userRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: { "apikey": env.SUPABASE_ANON_KEY, "Authorization": `Bearer ${token}` },
    });
    if (!userRes.ok) return json({ ok: false, error: "Unauthorized" }, 401);

    const url    = new URL(request.url);
    const limit  = Math.min(parseInt(url.searchParams.get("limit")  || "50"),  200);
    const offset = Math.max(parseInt(url.searchParams.get("offset") || "0"),   0);

    // Use the SERVICE key here so RLS doesn't block rows written by GitHub Actions
    // (those rows have no user_id, so anon-key + user JWT can't read them)
    const r = await fetch(
      `${env.SUPABASE_URL}/rest/v1/run_results?order=created_at.desc&limit=${limit}&offset=${offset}`,
      {
        headers: {
          "apikey":        env.SUPABASE_ANON_KEY,
          "Authorization": `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        },
      }
    );

    if (!r.ok) {
      const errText = await r.text();
      return json({ ok: false, error: `DB error ${r.status}: ${errText}` }, r.status);
    }

    const data = await r.json();
    return json({ ok: true, data, count: data.length });

  } catch (e) {
    return json({ ok: false, error: e.message || "Internal error" }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin":  "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
