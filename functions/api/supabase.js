export async function onRequest(context) {
  const { request, env } = context;

  // Log request method and URL
  console.log(`[supabase] ${request.method} ${request.url}`);

  // Handle OPTIONS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, apikey, Authorization',
      },
    });
  }

  // Check if environment variables are set
  if (!env.SUPABASE_URL) {
    console.error('SUPABASE_URL is missing');
    return new Response(JSON.stringify({ error: 'Server config: SUPABASE_URL missing' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (!env.SUPABASE_ANON_KEY) {
    console.error('SUPABASE_ANON_KEY is missing');
    return new Response(JSON.stringify({ error: 'Server config: SUPABASE_ANON_KEY missing' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Build target URL
  const url = new URL(request.url);
  const path = url.pathname.replace('/api/supabase', '');
  const targetUrl = `${env.SUPABASE_URL}${path}${url.search}`;
  console.log(`Proxying to: ${targetUrl}`);

  // Forward headers
  const headers = new Headers(request.headers);
  headers.set('apikey', env.SUPABASE_ANON_KEY);
  headers.set('Authorization', `Bearer ${env.SUPABASE_ANON_KEY}`);
  if (request.method !== 'GET' && request.method !== 'HEAD' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  try {
    const proxyRequest = new Request(targetUrl, {
      method: request.method,
      headers: headers,
      body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
    });
    const response = await fetch(proxyRequest);
    console.log(`Upstream status: ${response.status}`);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } catch (err) {
    console.error('Fetch error:', err);
    return new Response(JSON.stringify({ error: 'Fetch failed', details: err.message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
