export async function onRequestPost({ request, env }) {
  const { action, email, password, token } = await request.json();
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
    const authHeader = request.headers.get("Authorization");
    endpoint = `${base}/auth/v1/logout`;
    headers["Authorization"] = authHeader;
    body = JSON.stringify({});
  } else if (action === "forgot_password") {
    // Send recovery email
    endpoint = `${base}/auth/v1/recover`;
    body = JSON.stringify({ email });
  } else if (action === "reset_password") {
    // Change password with recovery token
    endpoint = `${base}/auth/v1/user`;
    headers["Authorization"] = `Bearer ${token}`;
    body = JSON.stringify({ password });
  } else {
    return json({ error: "Unknown action" }, 400);
  }

  const r = await fetch(endpoint, { method: "PATCH", headers, body });
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
