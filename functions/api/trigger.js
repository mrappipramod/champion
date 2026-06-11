/**
 * Cloudflare Pages Function — /api/trigger
 * POST { type:"screener"|"single", cap, trade, min_score, single_stock, user_id }
 * Validates the user's Supabase JWT, then fires GitHub Actions.
 * The GitHub token lives in CF env secrets — never touches the browser.
 */
export async function onRequestPost({ request, env }) {
  // 1. Validate bearer token against Supabase
  const auth = request.headers.get("Authorization") || "";
  const user = await validateSupabaseToken(auth, env);
  if (!user) return json({ error: "Unauthorized" }, 401);

  // 2. Parse request
  const body = await request.json();
  const { type, cap="all", trade="all", min_score="55", single_stock="" } = body;

  // 3. Trigger GitHub Actions workflow
  const ghRes = await fetch(
    `https://api.github.com/repos/${env.GH_USER}/${env.GH_REPO}/actions/workflows/daily_scan.yml/dispatches`,
    {
      method: "POST",
      headers: {
        "Authorization": `token ${env.GH_TOKEN}`,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ref: "main",
        inputs: { cap, trade, min_score: String(min_score), single_stock },
      }),
    }
  );

  if (ghRes.status !== 204) {
    const err = await ghRes.json().catch(() => ({}));
    return json({ error: err.message || "GitHub error", status: ghRes.status }, 502);
  }

  // 4. Log the run in Supabase
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

  return json({ ok: true, message: "Workflow triggered" });
}

async function validateSupabaseToken(authHeader, env) {
  if (!authHeader.startsWith("Bearer ")) return null;
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
