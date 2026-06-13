export async function onRequest(context) {
  const { request, env } = context;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, apikey, Authorization, Prefer',
  };

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // Build target Supabase URL
  const url = new URL(request.url);
  const path = url.pathname.replace('/api/supabase', '');
  const targetUrl = `${env.SUPABASE_URL}${path}${url.search}`;

  // ✅ Build headers from scratch — don't inherit browser request headers
  const newHeaders = new Headers();
  newHeaders.set('apikey', env.SUPABASE_ANON_KEY);
  newHeaders.set('Authorization', `Bearer ${env.SUPABASE_ANON_KEY}`);
  newHeaders.set('Content-Type', 'application/json');

  // ✅ Forward the Prefer header from the client (critical for POST/PATCH)
  const prefer = request.headers.get('Prefer');
  if (prefer) newHeaders.set('Prefer', prefer);

  const fetchOptions = {
    method: request.method,
    headers: newHeaders,
  };

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    fetchOptions.body = request.body;
    fetchOptions.duplex = 'half';
  }

  try {
    const response = await fetch(targetUrl, fetchOptions);

    // Add CORS headers to the response
    const responseHeaders = new Headers(response.headers);
    Object.entries(corsHeaders).forEach(([k, v]) => responseHeaders.set(k, v));

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Proxy failed', details: err.message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}
