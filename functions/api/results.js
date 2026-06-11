export async function onRequestGet({ request, env }) {
  try {
    const auth = request.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) return json({ ok: false, error: "Unauthorized" });
    const token = auth.slice(7);

    const userRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: { "apikey": env.SUPABASE_ANON_KEY, "Authorization": `Bearer ${token}` },
    });
    if (!userRes.ok) return json({ ok: false, error: "Invalid token" });
    const user = await userRes.json();

    const url = new URL(request.url);
    const limit = url.searchParams.get("limit") || "50";

    const r = await fetch(
      `${env.SUPABASE_URL}/rest/v1/run_results?user_id=eq.${user.id}&order=created_at.desc&limit=${limit}`,
      {
        headers: {
          "apikey": env.SUPABASE_ANON_KEY,
          "Authorization": `Bearer ${token}`,
        },
      }
    );

    if (!r.ok) {
      const errText = await r.text();
      return json({ ok: false, error: `Supabase query failed: ${r.status} ${errText}` });
    }

    const data = await r.json();
    return json({ ok: true, data });
  } catch (e) {
    return json({ ok: false, error: e.message });
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
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
