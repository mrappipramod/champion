/**
 * Cloudflare Pages Function — /api/yahoo
 *
 * Acts as a server-side proxy for Yahoo Finance.
 * Yahoo blocks direct browser requests (CORS), but allows server requests.
 *
 * Usage:
 *   GET /api/yahoo?symbol=TCS.NS              → price chart (1y daily)
 *   GET /api/yahoo?symbol=TCS.NS&type=fundamentals → quoteSummary
 */
export async function onRequestGet({ request }) {
  const url    = new URL(request.url);
  const symbol = url.searchParams.get("symbol");
  const type   = url.searchParams.get("type") || "chart";

  if (!symbol) {
    return json({ error: "Missing symbol parameter" }, 400);
  }

  // Sanitise — only allow alphanumeric + dot + dash
  const safe = symbol.replace(/[^A-Z0-9.\-]/gi, "").toUpperCase();
  if (!safe) return json({ error: "Invalid symbol" }, 400);

  let targetUrl;
  if (type === "fundamentals") {
    targetUrl = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${safe}`
      + `?modules=summaryDetail,defaultKeyStatistics,financialData`;
  } else {
    // Default: price chart
    targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${safe}`
      + `?interval=1d&range=1y&includePrePost=false`;
  }

  try {
    const resp = await fetch(targetUrl, {
      headers: {
        // Mimic a real browser — Yahoo rejects requests without a User-Agent
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "application/json",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://finance.yahoo.com",
      },
    });

    if (!resp.ok) {
      return json({ error: `Yahoo returned HTTP ${resp.status} for ${safe}` }, resp.status);
    }

    const data = await resp.json();

    // Check for Yahoo-level error inside the response body
    const yahooErr = data.chart?.error || data.quoteSummary?.error;
    if (yahooErr) {
      return json({ error: yahooErr.description || "Yahoo Finance error" }, 404);
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        // Cache 5 minutes — reduces Yahoo rate-limit risk
        "Cache-Control": "public, max-age=300",
      },
    });

  } catch (err) {
    return json({ error: `Proxy fetch failed: ${err.message}` }, 502);
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin":  "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
