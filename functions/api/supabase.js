export async function onRequest(context) {
  const { request } = context;
  return new Response(
    JSON.stringify({
      message: "Supabase proxy is alive",
      method: request.method,
      url: request.url,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}
