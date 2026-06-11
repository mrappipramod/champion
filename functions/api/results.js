export async function onRequestGet({ request, env }) {
  try {
    // 1. Guard check for missing Environment Variables
    if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
      return json({ ok: false, error: "Server error: Missing Supabase variables" }, 500);
    }

    // 2. Validate Authorization Header
    const auth = request.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) {
      return json({ ok: false, error: "Unauthorized: Missing or invalid token" }, 401);
    }
    const token = auth.slice(7);

    // 3. Authenticate the User via Supabase Auth
    const userRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: { 
        "apikey": env.SUPABASE_ANON_KEY, 
        "Authorization": `Bearer ${token}` 
      },
    });
    
    if (!userRes.ok) {
      return json({ ok: false, error: "Unauthorized: Invalid or expired token" }, 401);
    }
    const user = await userRes.json();

    // 4. Parse Query Parameters
    const url = new URL(request.url);
    const limit = url.searchParams.get("limit") || "50";

    // 5. Fetch Data from Supabase Rest API
    const r = await fetch(
      `${env.SUPABASE_URL}/rest/v1/run_results?user_id=eq.${user.id}&order=created_at.desc&limit=${limit}`,
      {
        headers: {
          "apikey": env.SUPABASE_ANON_KEY,
          "Authorization": `Bearer ${token}`, // Passes the user's token so RLS applies properly
        },
      }
    );

    if (!r.ok) {
      const errText = await r.text();
      return json({ ok: false, error: `Supabase query failed: ${r.status} ${errText}` }, r.status);
    }

    const data = await r.json();
    return json({ ok: true, data }, 200);

  } catch (e) {
    return json({ ok: false, error: e.message || "Internal Server Error" }, 500);
  }
}

// Helper function to standardize JSON responses and headers
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 
      "Content-Type": "application/json", 
      "Access-Control-Allow-Origin": "*" 
    },
  });
}

// Handle CORS preflight requests
export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
    },
  });
}
