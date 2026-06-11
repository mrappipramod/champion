<< 'EOF'
/**
 * Cloudflare Pages Function — /api/results
 * GET ?limit=20 — fetch latest run results for the current user
 */
export async function onRequestGet({ request, env }) {
  const auth = request.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
  const token = auth.slice(7);

  const userRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { "apikey": env.SUPABASE_ANON_KEY, "Authorization": `Bearer ${token}` },
  });
  if (!userRes.ok) return json({ error: "Unauthorized" }, 401);
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
  return json(await r.json());
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
EOF
