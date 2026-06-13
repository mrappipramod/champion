// functions/api/supabase.js
export async function onRequest(context) {
  const { request, env } = context;
  
  // 1️⃣ Handle preflight OPTIONS request
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, apikey, Authorization',
      }
    });
  }
  
  // 2️⃣ Proxy logic for all other methods
  const url = new URL(request.url);
  
  // Strip the leading '/api/supabase' to get the actual Supabase REST path
  const path = url.pathname.replace('/api/supabase', '');
  const targetUrl = `${env.SUPABASE_URL}${path}${url.search}`;
  
  // Clone headers and add Supabase authentication
  const headers = new Headers(request.headers);
  headers.set('apikey', env.SUPABASE_ANON_KEY);
  headers.set('Authorization', `Bearer ${env.SUPABASE_ANON_KEY}`);
  
  // Ensure Content-Type is set for POST/PUT/PATCH requests
  if (request.method !== 'GET' && request.method !== 'HEAD' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  
  // Create a new request with the correct method, headers, and body
  const proxyRequest = new Request(targetUrl, {
    method: request.method,
    headers: headers,
    body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
  });
  
  try {
    const response = await fetch(proxyRequest);
    // Return the response as-is (status, headers, body)
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } catch (err) {
    console.error('Supabase proxy error:', err);
    return new Response(JSON.stringify({ error: 'Failed to reach Supabase' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
