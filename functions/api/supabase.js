// Example: functions/api/supabase.js
export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const path = url.pathname.replace('/api/supabase', ''); // Extract the path

    const supabaseUrl = env.SUPABASE_URL;
    const supabaseKey = env.SUPABASE_ANON_KEY;
    const targetUrl = `${supabaseUrl}${path}${url.search}`;

    const response = await fetch(targetUrl, {
        headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            ...request.headers,
        },
    });

    return new Response(response.body, response);
}
