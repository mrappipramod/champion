/**
 * Cloudflare Pages Function — /api/payment-webhook
 *
 * Razorpay calls this after a successful payment.
 * Verifies HMAC signature, then upgrades the user's subscription in Supabase.
 *
 * In your Razorpay Dashboard → Webhooks, set:
 *   URL: https://champ.iamnewuser.com/api/payment-webhook
 *   Events: payment.captured
 *   Secret: (set RAZORPAY_WEBHOOK_SECRET in Cloudflare env vars)
 */

const PLANS = {
  monthly:   { days: 30  },
  quarterly: { days: 90  },
  yearly:    { days: 365 },
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function verifySignature(body, signature, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  const hex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
  return hex === signature;
}

async function upgradeSubscription(userId, plan, paymentId, orderId, amount, env) {
  const days = PLANS[plan]?.days || 30;
  const now = new Date();
  const planEnd = new Date(now.getTime() + days * 86400000);

  // Upsert subscription record
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/subscriptions?user_id=eq.${userId}`, {
    method: "PATCH",
    headers: {
      "apikey": env.SUPABASE_SERVICE_KEY,
      "Authorization": `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
      "Prefer": "return=representation",
    },
    body: JSON.stringify({
      plan,
      status: "active",
      plan_start: now.toISOString(),
      plan_end: planEnd.toISOString(),
      payment_id: paymentId,
      order_id: orderId,
      amount_paid: amount,
      updated_at: now.toISOString(),
    }),
  });

  if (!r.ok) {
    const err = await r.text();
    throw new Error(`Supabase update failed: ${err}`);
  }
  return r.json();
}

export async function onRequestPost({ request, env }) {
  // 1. Read raw body (needed for signature verification)
  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature") || "";

  // 2. Verify webhook signature
  if (env.RAZORPAY_WEBHOOK_SECRET) {
    const valid = await verifySignature(rawBody, signature, env.RAZORPAY_WEBHOOK_SECRET);
    if (!valid) {
      console.error("Webhook signature mismatch");
      return json({ error: "Invalid signature" }, 400);
    }
  }

  // 3. Parse event
  let event;
  try { event = JSON.parse(rawBody); } catch (e) {
    return json({ error: "Invalid JSON" }, 400);
  }

  // 4. Only handle payment.captured
  if (event.event !== "payment.captured") {
    return json({ ok: true, skipped: true });
  }

  const payment = event.payload?.payment?.entity;
  if (!payment) return json({ error: "No payment entity" }, 400);

  const notes = payment.notes || {};
  const userId = notes.user_id;
  const plan   = notes.plan;

  if (!userId || !plan) {
    console.error("Missing user_id or plan in notes:", notes);
    return json({ error: "Missing notes" }, 400);
  }

  // 5. Upgrade subscription
  try {
    await upgradeSubscription(
      userId, plan,
      payment.id,
      payment.order_id,
      payment.amount,
      env
    );
    console.log(`✅ Upgraded ${userId} to ${plan} (payment: ${payment.id})`);
    return json({ ok: true });
  } catch (e) {
    console.error("Upgrade failed:", e.message);
    return json({ error: e.message }, 500);
  }
}

// Also handle GET for Razorpay webhook verification ping
export async function onRequestGet() {
  return json({ ok: true, service: "Trade Screener Webhook" });
}
