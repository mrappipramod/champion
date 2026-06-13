export function onRequest(context) {
  return new Response(JSON.stringify({ status: "ok", message: "Function is working!" }), {
    headers: { 'Content-Type': 'application/json' }
  });
}
