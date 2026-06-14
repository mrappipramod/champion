/**
 * Cloudflare Pages Function — /api/results
 * GET    ?limit=50&offset=0  — returns rows NOT dismissed by this user
 * DELETE ?id=<uuid>          — soft-dismiss one row for this user only
 * DELETE ?clear=1            — soft-dismiss ALL rows for this user only
 *
 * Rows are shared (GitHub Actions writes with no user_id).
 * "Clear" never hard-deletes — it appends the user's ID to dismissed_by[].
 */

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}

async function getAuthenticatedUser(request, env) {
  const auth = request.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;
  const token = auth.slice(7);
  const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { "apikey": env.SUPABASE_ANON_KEY, "Authorization": `Bearer ${token}` },
  });
  if (!r.ok) return null;
  const u = await r.json();
  return u?.id ? u : null;
}

// ── GET — fetch results not dismissed by this user ─────────────────
export async function onRequestGet({ request, env }) {
  try {
    if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
      return json({ ok: false, error: "Missing Supabase config" }, 500);
    }

    const user = await getAuthenticatedUser(request, env);
    if (!user) return json({ ok: false, error: "Unauthorized" }, 401);

    const url    = new URL(request.url);
    const limit  = Math.min(parseInt(url.searchParams.get("limit")  || "50"), 200);
    const offset = Math.max(parseInt(url.searchParams.get("offset") || "0"),  0);

    // Exclude rows this user has soft-dismissed
    // PostgREST syntax: dismissed_by=not.cs.{"<user_id>"}
    const filter = `dismissed_by=not.cs.{"${user.id}"}`;

    const r = await fetch(
      `${env.SUPABASE_URL}/rest/v1/run_results?${filter}&order=created_at.desc&limit=${limit}&offset=${offset}`,
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

// ── DELETE — soft-dismiss one or all rows for this user only ───────
export async function onRequestDelete({ request, env }) {
  try {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
      return json({ ok: false, error: "Missing Supabase config" }, 500);
    }

    const user = await getAuthenticatedUser(request, env);
    if (!user) return json({ ok: false, error: "Unauthorized" }, 401);

    const url   = new URL(request.url);
    const id    = url.searchParams.get("id");
    const clear = url.searchParams.get("clear");

    if (!id && !clear) {
      return json({ ok: false, error: "Missing id or clear param" }, 400);
    }

    // Target: one specific row, or every row
    const rowFilter = id
      ? `id=eq.${id}`
      : `id=neq.00000000-0000-0000-0000-000000000000`;

    // We need a DB function to safely append to the array.
    // Call our RPC (created in Step 1b below).
    const r = await fetch(
      `${env.SUPABASE_URL}/rest/v1/rpc/dismiss_results_for_user`,
      {
        method: "POST",
        headers: {
          "apikey":         env.SUPABASE_ANON_KEY,
          "Authorization":  `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          "Content-Type":   "application/json",
        },
        body: JSON.stringify({
          p_user_id:  user.id,
          p_row_id:   id   || null,
          p_clear_all: clear ? true : false,
        }),
      }
    );

    if (!r.ok) {
      const errText = await r.text();
      return json({ ok: false, error: `DB error ${r.status}: ${errText}` }, r.status);
    }

    return json({ ok: true });

  } catch (e) {
    return json({ ok: false, error: e.message }, 500);
  }
}

// ── OPTIONS — CORS preflight ───────────────────────────────────────
export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin":  "*",
      "Access-Control-Allow-Methods": "GET, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
