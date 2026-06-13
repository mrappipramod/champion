// functions/api/supabase.js
export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  
  // Extract the path after /api/supabase
  // Example: /api/supabase/rest/v1/pnl_summary?select=*...
  // becomes /rest/v1/pnl_summary?select=*...
  const path = url.pathname.replace('/api/supabase', '');
  const targetUrl = `${env.SUPABASE_URL}${path}${url.search}`;
  
  // Forward the request with Supabase auth headers
  const response = await fetch(targetUrl, {
    method: request.method,
    headers: {
      'apikey': env.SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${env.SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      // Forward other headers if needed (range, prefer, etc.)
      ...Object.fromEntries(request.headers),
    },
    body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
  });
  
  // Return the response (same status, same body)
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
