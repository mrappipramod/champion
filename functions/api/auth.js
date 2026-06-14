/**
 * Cloudflare Pages Function — /api/auth  (UPDATED with subscription middleware)
 *
 * Added: action "check_access" — verifies token + returns subscription status
 * Used by the frontend gatekeeper before showing the dashboard.
 */

const PLANS = {
  monthly:   { days: 30  },
  quarterly: { days: 90  },
  yearly:    { days: 365 },
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

async function getSubscription(userId, env) {
  const r = await fetch(
    `${env.SUPABASE_URL}/rest/v1/subscriptions?user_id=eq.${userId}&select=*&limit=1`,
    {
      headers: {
        "apikey": env.SUPABASE_SERVICE_KEY,
        "Authorization": `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      },
    }
  );
  const rows = await r.json();
  return rows?.[0] || null;
}

function computeAccess(sub) {
  if (!sub) return { hasAccess: false, effective_status: "expired", days_remaining: 0 };
  const now = Date.now();
  if (sub.plan !== "trial" && sub.status === "active" && new Date(sub.plan_end) > now) {
    return {
      hasAccess: true,
      effective_status: "active",
      plan: sub.plan,
      days_remaining: Math.ceil((new Date(sub.plan_end) - now) / 86400000),
      access_until: sub.plan_end,
    };
  }
  if (sub.plan === "trial" && sub.status === "active" && new Date(sub.trial_end) > now) {
    return {
      hasAccess: true,
      effective_status: "trial",
      plan: "trial",
      days_remaining: Math.ceil((new Date(sub.trial_end) - now) / 86400000),
      access_until: sub.trial_end,
    };
  }
  return { hasAccess: false, effective_status: "expired", plan: sub.plan, days_remaining: 0 };
}

export async function onRequestPost({ request, env }) {
  const body = await request.json();
  const { action } = body;
  const base = env.SUPABASE_URL;
  const key  = env.SUPABASE_ANON_KEY;
  const headers = {
    "Content-Type": "application/json",
    "apikey": key,
  };

  // ── NEW: check_access ──────────────────────────────────
  if (action === "check_access") {
    const token = (request.headers.get("Authorization") || "").replace("Bearer ", "").trim();
    if (!token) return json({ hasAccess: false, effective_status: "expired" });

    // Verify token with Supabase
    const userRes = await fetch(`${base}/auth/v1/user`, {
      headers: { "apikey": key, "Authorization": `Bearer ${token}` },
    });
    if (!userRes.ok) return json({ hasAccess: false, effective_status: "expired" });
    const user = await userRes.json();
    if (!user?.id) return json({ hasAccess: false, effective_status: "expired" });

    const sub = await getSubscription(user.id, env);
    const access = computeAccess(sub);
    return json({ ...access, user_id: user.id, email: user.email });
  }

  // ── Existing auth actions ──────────────────────────────
  let endpoint, payload;

  if (action === "signup") {
    endpoint = `${base}/auth/v1/signup`;
    payload  = JSON.stringify({ email: body.email, password: body.password });
    const r    = await fetch(endpoint, { method: "POST", headers, body: payload });
    const data = await r.json();

    // Auto-create trial subscription (belt-and-suspenders; trigger handles it too)
    if (data.id || data.user?.id) {
      const uid = data.id || data.user?.id;
      await fetch(`${env.SUPABASE_URL}/rest/v1/subscriptions`, {
        method: "POST",
        headers: {
          "apikey": env.SUPABASE_SERVICE_KEY,
          "Authorization": `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          "Content-Type": "application/json",
          "Prefer": "return=minimal,resolution=ignore-duplicates",
        },
        body: JSON.stringify({
          user_id: uid,
          email: body.email,
          plan: "trial",
          status: "active",
          trial_start: new Date().toISOString(),
          trial_end: new Date(Date.now() + 3 * 86400000).toISOString(),
        }),
      });
    }
    return json(data, r.status);

  } else if (action === "login") {
    endpoint = `${base}/auth/v1/token?grant_type=password`;
    payload  = JSON.stringify({ email: body.email, password: body.password });

  } else if (action === "logout") {
    const token = request.headers.get("Authorization");
    endpoint = `${base}/auth/v1/logout`;
    headers["Authorization"] = token;
    payload  = JSON.stringify({});

  } else if (action === "forgot_password") {
    endpoint = `${base}/auth/v1/recover`;
    payload  = JSON.stringify({ email: body.email, gotrue_meta_security: {} });
    const redirectTo = body.redirectTo || "";
    if (redirectTo) endpoint += `?redirect_to=${encodeURIComponent(redirectTo)}`;

  } else if (action === "reset_password") {
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

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
