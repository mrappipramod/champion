export async function onRequestGet({ env }) {
  return new Response(JSON.stringify({
    GH_USER: env.GH_USER,
    GH_REPO: env.GH_REPO,
    GH_TOKEN_exists: !!env.GH_TOKEN,
    SUPABASE_URL: env.SUPABASE_URL,
    SUPABASE_SERVICE_KEY_exists: !!env.SUPABASE_SERVICE_KEY,
  }), {
    headers: { "Content-Type": "application/json" },
  });
}
