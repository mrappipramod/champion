/**
 * Cloudflare Pages Function — /api/auth
 * POST { action: "login"|"signup"|"logout"|"forgot_password"|"reset_password", ... }
 * Proxies to Supabase Auth so the Supabase anon key stays server-side.
 */
export async function onRequestPost({ request, env }) {
  const body = await request.json();
  const { action } = body;
  const base = env.SUPABASE_URL;
  const key  = env.SUPABASE_ANON_KEY;

  const headers = {
    "Content-Type": "application/json",
    "apikey": key,
  };

  let endpoint, payload;

  if (action === "signup") {
    endpoint = `${base}/auth/v1/signup`;
    payload  = JSON.stringify({ email: body.email, password: body.password });

  } else if (action === "login") {
    endpoint = `${base}/auth/v1/token?grant_type=password`;
    payload  = JSON.stringify({ email: body.email, password: body.password });

  } else if (action === "logout") {
    const token = request.headers.get("Authorization");
    endpoint = `${base}/auth/v1/logout`;
    headers["Authorization"] = token;
    payload  = JSON.stringify({});

  } else if (action === "forgot_password") {
    // Sends a password-reset email via Supabase.
    // `redirectTo` must match a URL listed in your Supabase "Redirect URLs" settings.
    endpoint = `${base}/auth/v1/recover`;
    payload  = JSON.stringify({
      email: body.email,
      // The user lands back here; the hash will contain #access_token=...&type=recovery
      gotrue_meta_security: {},
    });
    // Supabase recover endpoint accepts an optional redirect_to query param
    const redirectTo = body.redirectTo || "";
    if (redirectTo) endpoint += `?redirect_to=${encodeURIComponent(redirectTo)}`;

  } else if (action === "reset_password") {
    // Called with the recovery access_token extracted from the URL hash on the client.
    // We hit Supabase's /user endpoint (PUT) to update the password.
    endpoint = `${base}/auth/v1/user`;
    headers["Authorization"] = `Bearer ${body.access_token}`;
    payload  = JSON.stringify({ password: body.new_password });

    const r = await fetch(endpoint, { method: "PUT", headers, body: payload });
    const data = await r.json();
    return json(data, r.status);

  } else {
    return json({ error: "Unknown action" }, 400);
  }

  const r    = await fetch(endpoint, { method: "POST", headers, body: payload });
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
