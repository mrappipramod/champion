/**
 * Cloudflare Pages Function — /api/subscription
 *
 * GET  → returns current user's subscription status
 * POST → { action: "create_order", plan: "monthly"|"quarterly"|"yearly" }
 */

const PLANS = {
  monthly:   { amount: 29900,  label: "Monthly",   days: 30  },
  quarterly: { amount: 49900,  label: "3 Months",  days: 90  },
  yearly:    { amount: 200000, label: "1 Year",     days: 365 },
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      // ── No caching — always fresh ──
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}

async function getSupabaseUser(request, env) {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.replace("Bearer ", "").trim();
  if (!token) return null;
  const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      "apikey": env.SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${token}`,
    },
  });
  if (!r.ok) return null;
  return r.json();
}

async function getSubscription(userId, env) {
  const r = await fetch(
    `${env.SUPABASE_URL}/rest/v1/subscriptions?user_id=eq.${userId}&select=*&limit=1`,
    {
      headers: {
        "apikey": env.SUPABASE_SERVICE_KEY,
        "Authorization": `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        // No caching on Supabase side either
        "Cache-Control": "no-cache",
      },
    }
  );
  if (!r.ok) {
    console.error("Supabase fetch failed:", r.status, await r.text());
    return null;
  }
  const rows = await r.json();
  console.log(`[subscription] user=${userId} row=`, JSON.stringify(rows?.[0]));
  return rows?.[0] || null;
}

function computeStatus(sub) {
  if (!sub) {
    console.log("[computeStatus] No subscription row found → expired");
    return { effective_status: "expired", days_remaining: 0 };
  }

  const now = Date.now();

  // ── PAID PLAN CHECK ──
  // plan is not 'trial', status is 'active', and plan_end is a valid future date
  const planEndMs = sub.plan_end ? new Date(sub.plan_end).getTime() : 0;
  const isPaidActive = sub.plan !== "trial"
    && sub.status === "active"
    && planEndMs > 0
    && planEndMs > now;

  if (isPaidActive) {
    const days = Math.ceil((planEndMs - now) / 86400000);
    console.log(`[computeStatus] ACTIVE paid plan=${sub.plan} days=${days} plan_end=${sub.plan_end}`);
    return {
      effective_status: "active",
      plan: sub.plan,
      days_remaining: days,
      access_until: sub.plan_end,
    };
  }

  // ── TRIAL CHECK ──
  const trialEndMs = sub.trial_end ? new Date(sub.trial_end).getTime() : 0;
  const isTrialActive = sub.plan === "trial"
    && sub.status === "active"
    && trialEndMs > 0
    && trialEndMs > now;

  if (isTrialActive) {
    const days = Math.ceil((trialEndMs - now) / 86400000);
    console.log(`[computeStatus] TRIAL active days=${days} trial_end=${sub.trial_end}`);
    return {
      effective_status: "trial",
      plan: "trial",
      days_remaining: days,
      access_until: sub.trial_end,
    };
  }

  // ── EXPIRED ──
  console.log(`[computeStatus] EXPIRED plan=${sub.plan} status=${sub.status} plan_end=${sub.plan_end} trial_end=${sub.trial_end}`);
  return {
    effective_status: "expired",
    plan: sub.plan,
    days_remaining: 0,
  };
}

// ── GET: subscription status ──────────────────────────────
export async function onRequestGet({ request, env }) {
  const user = await getSupabaseUser(request, env);
  if (!user?.id) return json({ error: "Unauthorized" }, 401);

  const sub = await getSubscription(user.id, env);
  const status = computeStatus(sub);

  return json({
    user_id: user.id,
    email: user.email,
    // Raw fields for debugging — remove in production if desired
    _raw: {
      plan: sub?.plan,
      status: sub?.status,
      trial_end: sub?.trial_end,
      plan_end: sub?.plan_end,
    },
    ...status,
    plans: PLANS,
  });
}

// ── POST: create Razorpay order ───────────────────────────
export async function onRequestPost({ request, env }) {
  const user = await getSupabaseUser(request, env);
  if (!user?.id) return json({ error: "Unauthorized" }, 401);

  const body = await request.json();

  if (body.action === "create_order") {
    const plan = PLANS[body.plan];
    if (!plan) return json({ error: "Invalid plan" }, 400);

    const rzpAuth = btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`);
    const orderRes = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Basic ${rzpAuth}`,
      },
      body: JSON.stringify({
        amount: plan.amount,
        currency: "INR",
        receipt: `ts_${user.id.slice(0, 8)}_${body.plan}_${Date.now()}`,
        notes: {
          user_id: user.id,
          email: user.email,
          plan: body.plan,
        },
      }),
    });

    if (!orderRes.ok) {
      const err = await orderRes.json();
      return json({ error: err.error?.description || "Failed to create order" }, 500);
    }

    const order = await orderRes.json();
    return json({
      order_id: order.id,
      amount: plan.amount,
      currency: "INR",
      key_id: env.RAZORPAY_KEY_ID,
      plan: body.plan,
      plan_label: plan.label,
      user_email: user.email,
      user_name: user.email.split("@")[0],
    });
  }

  return json({ error: "Unknown action" }, 400);
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
