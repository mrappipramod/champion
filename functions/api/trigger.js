export async function onRequestPost({ request, env }) {
  try {
    if (!env.GH_USER || !env.GH_REPO || !env.GH_TOKEN) {
      return json({ ok: false, error: "Missing GitHub env vars (GH_USER, GH_REPO, GH_TOKEN)" });
    }

    const auth = request.headers.get("Authorization") || "";
    const user = await validateSupabaseToken(auth, env);
    if (!user) return json({ ok: false, error: "Unauthorized" });

    const body = await request.json();
    const { type, cap="all", trade="all", min_score="55", single_stock="" } = body;

    const ghRes = await fetch(
      `https://api.github.com/repos/${env.GH_USER}/${env.GH_REPO}/actions/workflows/daily_scan.yml/dispatches`,
      {
        method: "POST",
        headers: {
          "Authorization": `token ${env.GH_TOKEN}`,
          "Accept": "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
          "User-Agent": "Cloudflare-Pages-Function",
        },
        body: JSON.stringify({
          ref: "main",
          inputs: { cap, trade, min_score: String(min_score), single_stock },
        }),
      }
    );

    if (ghRes.status !== 204) {
      let errMsg = `GitHub returned ${ghRes.status}`;
      try {
        const errText = await ghRes.text();
        errMsg += `: ${errText}`;
      } catch {}
      return json({ ok: false, error: errMsg });
    }

    try {
      await fetch(`${env.SUPABASE_URL}/rest/v1/runs`, {
        method: "POST",
        headers: {
          "apikey": env.SUPABASE_ANON_KEY,
          "Authorization": `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          "Content-Type": "application/json",
          "Prefer": "return=minimal",
        },
        body: JSON.stringify({
          user_id: user.sub,
          type,
          params: { cap, trade, min_score, single_stock },
          status: "triggered",
        }),
      });
    } catch (e) {
      console.error("Supabase log error:", e);
    }

    return json({ ok: true, message: "Workflow triggered" });
  } catch (e) {
    return json({ ok: false, error: e.message || String(e), stack: e.stack });
  }
}

async function validateSupabaseToken(authHeader, env) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  try {
    const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: { "apikey": env.SUPABASE_ANON_KEY, "Authorization": `Bearer ${token}` },
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
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
