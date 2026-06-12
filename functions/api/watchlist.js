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

function sbH(env, token) {
  return {
    "apikey":        env.SUPABASE_ANON_KEY,
    "Authorization": `Bearer ${token}`,
    "Content-Type":  "application/json",
  };
}

export async function onRequestGet({ request, env }) {
  const user = await getUser(request, env);
  if (!user) return json({ ok: false, error: "Unauthorized" }, 401);

  const r = await fetch(
    `${env.SUPABASE_URL}/rest/v1/watchlist?user_id=eq.${user.id}&order=added_at.desc`,
    { headers: sbH(env, user.token) }
  );
  if (!r.ok) return json({ ok: false, error: `DB error ${r.status}` }, r.status);
  const data = await r.json();
  return json({ ok: true, data: Array.isArray(data) ? data : [] });
}

export async function onRequestPost({ request, env }) {
  const user = await getUser(request, env);
  if (!user) return json({ ok: false, error: "Unauthorized" }, 401);

  const body = await request.json();
  const { action } = body;

  if (action === "add") {
    const row = {
      user_id:      user.id,
      symbol:       (body.symbol || "").toUpperCase().trim(),
      notes:        body.notes        || "",
      buy_price:    body.buy_price    || null,
      buy_date:     body.buy_date     || null,
      target_price: body.target_price || null,
      stop_loss:    body.stop_loss    || null,
      quantity:     body.quantity     || null,
    };
    if (!row.symbol) return json({ ok: false, error: "Symbol required" }, 400);

    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/watchlist`, {
      method: "POST",
      headers: { ...sbH(env, user.token), "Prefer": "return=representation" },
      body: JSON.stringify(row),
    });
    const data = await r.json();
    // 409 = duplicate (already in watchlist) — treat as success
    if (r.status === 409) return json({ ok: true, duplicate: true });
    if (!r.ok) return json({ ok: false, error: data?.message || `DB ${r.status}` }, r.status);
    return json({ ok: true, data: Array.isArray(data) ? data[0] : data });
  }

  if (action === "remove") {
    const sym = (body.symbol || "").toUpperCase().trim();
    const r = await fetch(
      `${env.SUPABASE_URL}/rest/v1/watchlist?user_id=eq.${user.id}&symbol=eq.${sym}`,
      { method: "DELETE", headers: sbH(env, user.token) }
    );
    return json({ ok: r.ok });
  }

  if (action === "update") {
    const sym = (body.symbol || "").toUpperCase().trim();
    const fields = {};
    ["notes","buy_price","buy_date","target_price","stop_loss","quantity"].forEach(f => {
      if (body[f] !== undefined) fields[f] = body[f];
    });
    const r = await fetch(
      `${env.SUPABASE_URL}/rest/v1/watchlist?user_id=eq.${user.id}&symbol=eq.${sym}`,
      { method: "PATCH", headers: sbH(env, user.token), body: JSON.stringify(fields) }
    );
    return json({ ok: r.ok });
  }

  if (action === "refresh_price") {
    const sym = (body.symbol || "").toUpperCase().trim();
    const fields = {
      last_price:     body.last_price     ?? null,
      last_refreshed: new Date().toISOString(),
      tech_score:     body.tech_score     ?? null,
      grade:          body.grade          ?? null,
      trend:          body.trend          ?? null,
      rsi:            body.rsi            ?? null,
    };
    const r = await fetch(
      `${env.SUPABASE_URL}/rest/v1/watchlist?user_id=eq.${user.id}&symbol=eq.${sym}`,
      { method: "PATCH", headers: sbH(env, user.token), body: JSON.stringify(fields) }
    );
    return json({ ok: r.ok });
  }

  return json({ ok: false, error: "Unknown action" }, 400);
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
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
