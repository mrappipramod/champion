export async function onRequestGet({ request }) {
  // 1. Get the symbol from the frontend request
  const url = new URL(request.url);
  const symbol = url.searchParams.get("symbol");

  if (!symbol) {
    return new Response(JSON.stringify({ error: "Missing symbol" }), {
      status: 400,
      headers: CORS_HEADERS
    });
  }

  // 2. Build the Yahoo Finance URL
  const targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1y`;

  try {
    // 3. Fetch data from Yahoo (Server-to-Server, so no CORS issues!)
    const targetResponse = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });

    const data = await targetResponse.json();

    // 4. Send the data back to your frontend WITH CORS headers allowed
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: CORS_HEADERS
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: "Failed to fetch from Yahoo" }), {
      status: 500,
      headers: CORS_HEADERS
    });
  }
}

// Reusable CORS headers
const CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*", 
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

// Handle preflight requests
export async function onRequestOptions() {
  return new Response(null, { headers: CORS_HEADERS });
}
