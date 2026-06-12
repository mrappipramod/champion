async function getUser(request, env) {
  const auth = request.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;
  const token = auth.slice(7);
  try {
    const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
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

// ── GET /api/watchlist ────────────────────────────────────────────────────────
export async function onRequestGet({ request, env }) {
  const user = await getUser(request, env);
  if (!user) return json({ ok: false, error: "Unauthorized" }, 401);

  const r = await fetch(
    `${env.SUPABASE_URL}/rest/v1/watchlist?user_id=eq.${user.id}&order=added_at.desc`,
    {
      headers: {
        apikey:        env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      },
    }
  );
  const data = await r.json();
  return json({ ok: true, data: Array.isArray(data) ? data : [] });
}

// ── POST /api/watchlist ───────────────────────────────────────────────────────
export async function onRequestPost({ request, env }) {
  const user = await getUser(request, env);
  if (!user) return json({ ok: false, error: "Unauthorized" }, 401);

  const body   = await request.json();
  const action = body.action;
  const symbol = (body.symbol || "").toUpperCase().trim();

  if (!symbol) return json({ ok: false, error: "symbol required" }, 400);

  if (action === "add") {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/watchlist`, {
      method: "POST",
      headers: {
        apikey:          env.SUPABASE_SERVICE_KEY,
        Authorization:   `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        "Content-Type":  "application/json",
        Prefer:          "return=minimal",
      },
      body: JSON.stringify({ user_id: user.id, symbol, notes: body.notes || "" }),
    });
    if (!r.ok) {
      const e = await r.text();
      // 409 = duplicate — treat as success
      if (r.status === 409) return json({ ok: true, duplicate: true });
      return json({ ok: false, error: e }, r.status);
    }
    return json({ ok: true });
  }

  if (action === "remove") {
    const r = await fetch(
      `${env.SUPABASE_URL}/rest/v1/watchlist?user_id=eq.${user.id}&symbol=eq.${symbol}`,
      {
        method: "DELETE",
        headers: {
          apikey:        env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          Prefer:        "return=minimal",
        },
      }
    );
    return json({ ok: r.ok });
  }

  return json({ ok: false, error: "Unknown action" }, 400);
}
