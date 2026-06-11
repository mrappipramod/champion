
<< 'EOF'
/**
 * Cloudflare Pages Function — /api/auth
 * POST { action: "login"|"signup"|"logout", email, password }
 * Proxies to Supabase Auth so the Supabase anon key stays server-side.
 */
export async function onRequestPost({ request, env }) {
  const { action, email, password } = await request.json();
  const base = env.SUPABASE_URL;
  const key  = env.SUPABASE_ANON_KEY;

  const headers = {
    "Content-Type": "application/json",
    "apikey": key,
  };

  let endpoint, body;

  if (action === "signup") {
    endpoint = `${base}/auth/v1/signup`;
    body = JSON.stringify({ email, password });
  } else if (action === "login") {
    endpoint = `${base}/auth/v1/token?grant_type=password`;
    body = JSON.stringify({ email, password });
  } else if (action === "logout") {
    const token = request.headers.get("Authorization");
    endpoint = `${base}/auth/v1/logout`;
    headers["Authorization"] = token;
    body = JSON.stringify({});
  } else {
    return json({ error: "Unknown action" }, 400);
  }

  const r = await fetch(endpoint, { method: "POST", headers, body });
  const data = await r.json();
  return json(data, r.status);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
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
EOF
