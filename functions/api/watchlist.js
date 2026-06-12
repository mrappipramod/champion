/**
 * Cloudflare Pages Function — /api/watchlist
 * GET  — fetch user's watchlist
 * POST { action:"add"|"remove", symbol, notes }
 */
async function getUser(request, env) {
  const auth = request.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;
  const token = auth.slice(7);
  try {
    const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: { "apikey": env.SUPABASE_ANON_KEY, "Authorization": `Bearer ${token}` },
    });
    if (!r.ok) return null;
    const u = await r.json();
    return { ...u, token };
  } catch { return null; }
}

function sbHeaders(env, token) {
  return {
    "apikey": env.SUPABASE_ANON_KEY,
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export async function onRequestGet({ request, env }) {
  const user = await getUser(request, env);
  if (!user) return json({ error: "Unauthorized" }, 401);
  const r = await fetch(
    `${env.SUPABASE_URL}/rest/v1/watchlist?user_id=eq.${user.id}&order=added_at.desc`,
    { headers: sbHeaders(env, user.token) }
  );
  const data = await r.json();
  return json({ ok: true, data: Array.isArray(data) ? data : [] });
}

export async function onRequestPost({ request, env }) {
  const user = await getUser(request, env);
  if (!user) return json({ error: "Unauthorized" }, 401);
  const { action, symbol, notes = "" } = await request.json();

  if (action === "add") {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/watchlist`, {
      method: "POST",
      headers: { ...sbHeaders(env, user.token), "Prefer": "return=representation" },
      body: JSON.stringify({ user_id: user.id, symbol: symbol.toUpperCase(), notes }),
    });
    return json(await r.json(), r.status);
  }

  if (action === "remove") {
    await fetch(
      `${env.SUPABASE_URL}/rest/v1/watchlist?user_id=eq.${user.id}&symbol=eq.${symbol}`,
      { method: "DELETE", headers: sbHeaders(env, user.token) }
    );
    return json({ ok: true });
  }

  return json({ error: "Unknown action" }, 400);
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
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
