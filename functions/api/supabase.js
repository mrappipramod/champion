// functions/api/supabase.js
export async function onRequest(context) {
  const { request, env } = context;

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, apikey, Authorization, Prefer',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  // Build target URL
  const url = new URL(request.url);
  const path = url.pathname.replace('/api/supabase', ''); // remove prefix
  const targetUrl = `${env.SUPABASE_URL}${path}${url.search}`;

  // ----- Read request body for mutations -----
  let body = undefined;
  if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
    // clone the request before reading body
    body = await request.text();
  }

  // ----- Construct clean headers -----
  const headers = new Headers();
  headers.set('apikey', env.SUPABASE_ANON_KEY);
  headers.set('Authorization', `Bearer ${env.SUPABASE_ANON_KEY}`);
  headers.set('Content-Type', 'application/json');
  
  // Forward the Prefer header if present (the frontend sends it)
  const prefer = request.headers.get('Prefer');
  if (prefer) headers.set('Prefer', prefer);

  // ----- Make the request to Supabase -----
  const response = await fetch(targetUrl, {
    method: request.method,
    headers,
    body: body,
  });

  // ----- Return the response to the browser -----
  const responseHeaders = new Headers(response.headers);
  // Add CORS headers for the browser
  responseHeaders.set('Access-Control-Allow-Origin', '*');
  responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  responseHeaders.set('Access-Control-Allow-Headers', 'Content-Type, apikey, Authorization, Prefer');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}
