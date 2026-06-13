export async function onRequest(context) {
  const { request, env } = context;

  // 1. Handle CORS Preflight
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

  // 2. Build target URL
  const url = new URL(request.url);
  // Ensure the path correctly strips the prefix and maps to the Supabase REST v1 structure
  const path = url.pathname.replace('/api/supabase', '');
  const targetUrl = `${env.SUPABASE_URL}${path}${url.search}`;

  // 3. Prepare headers (Clean and set required ones)
  const newHeaders = new Headers(request.headers);
  newHeaders.set('apikey', env.SUPABASE_ANON_KEY);
  newHeaders.set('Authorization', `Bearer ${env.SUPABASE_ANON_KEY}`);
  // Important: Remove host header so it doesn't conflict with target
  newHeaders.delete('host'); 

  // 4. Handle body correctly
  // If it's a POST/PUT, we need to pass the body stream. 
  // For requests with bodies, fetch usually requires the method and the headers.
  const fetchOptions = {
    method: request.method,
    headers: newHeaders,
  };

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    fetchOptions.body = request.body;
    // Explicitly set duplex for streaming bodies in Cloudflare Workers
    fetchOptions.duplex = 'half';
  }

  try {
    const response = await fetch(targetUrl, fetchOptions);
    
    // Return the response directly
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Proxy failed', details: err.message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
