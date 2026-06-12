async function getUser(request, env) {
  const auth = request.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;
  const token = auth.slice(7);
  try {
    const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return null;
    return await r.json();           // { id, email, … }
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
      "Access-Control-Allow-Methods": "GET, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

// ── GET /api/results?limit=N ──────────────────────────────────────────────────
export async function onRequestGet({ request, env }) {
  try {
    if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY)
      return json({ ok: false, error: "Server misconfigured" }, 500);

    const user = await getUser(request, env);
    if (!user) return json({ ok: false, error: "Unauthorized" }, 401);

    const url   = new URL(request.url);
    const limit = url.searchParams.get("limit") || "100";

    // Fetch results — no user_id filter so GitHub Action results are visible
    const r = await fetch(
      `${env.SUPABASE_URL}/rest/v1/run_results?order=created_at.desc&limit=${limit}`,
      {
        headers: {
          apikey:        env.SUPABASE_ANON_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,   // service key so RLS doesn't block
        },
      }
    );

    if (!r.ok) {
      const e = await r.text();
      return json({ ok: false, error: `Supabase error ${r.status}: ${e}` }, r.status);
    }

    const data = await r.json();
    return json({ ok: true, data: Array.isArray(data) ? data : [] });

  } catch (e) {
    return json({ ok: false, error: e.message }, 500);
  }
}

// ── DELETE /api/results?id=UUID  or  DELETE /api/results  (clear all) ─────────
export async function onRequestDelete({ request, env }) {
  try {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY)
      return json({ ok: false, error: "Server misconfigured" }, 500);

    const user = await getUser(request, env);
    if (!user) return json({ ok: false, error: "Unauthorized" }, 401);

    const url = new URL(request.url);
    const id  = url.searchParams.get("id");

    // Build the filter:  single row by id  OR  all rows
    const filter = id ? `id=eq.${id}` : `id=neq.00000000-0000-0000-0000-000000000000`;

    const r = await fetch(
      `${env.SUPABASE_URL}/rest/v1/run_results?${filter}`,
      {
        method: "DELETE",
        headers: {
          apikey:        env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          "Content-Type": "application/json",
          Prefer:         "return=minimal",
        },
      }
    );

    if (!r.ok) {
      const e = await r.text();
      return json({ ok: false, error: `Delete failed ${r.status}: ${e}` }, r.status);
    }

    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, error: e.message }, 500);
  }
}
