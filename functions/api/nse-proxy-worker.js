/**
 * Cloudflare Worker: NSE Options Data Proxy
 * Deploy at: workers.tradescreener.app  (or your custom domain)
 * Routes handled:
 *   GET /nse/option-chain?symbol=NIFTY
 *   GET /nse/expiry-dates?symbol=NIFTY
 *   GET /nse/quote?symbol=NIFTY
 *
 * NSE blocks direct browser requests (CORS + User-Agent checks).
 * This worker acts as a server-side proxy, sets correct headers, and
 * forwards data to your frontend.
 */

const NSE_BASE = "https://www.nseindia.com";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",          // restrict to your domain in production
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json",
};

// NSE requires these headers to not return 401/403
const NSE_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  Referer: "https://www.nseindia.com/option-chain",
  Connection: "keep-alive",
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "same-origin",
};

// NSE Index symbols → their API identifiers
const INDEX_MAP = {
  NIFTY: "NIFTY",
  BANKNIFTY: "BANKNIFTY",
  FINNIFTY: "FINNIFTY",
  MIDCPNIFTY: "MIDCPNIFTY",
  NIFTYIT: "NIFTY IT",
  SENSEX: "SENSEX",
};

async function fetchNSEWithSession(url) {
  // Step 1: Fetch NSE homepage to get cookies (NSE requires valid session)
  const sessionResp = await fetch(NSE_BASE, {
    headers: NSE_HEADERS,
    cf: { cacheTtl: 60 },
  });

  const cookies = sessionResp.headers.get("set-cookie") || "";

  // Step 2: Use session cookies for actual API call
  const resp = await fetch(url, {
    headers: {
      ...NSE_HEADERS,
      Cookie: cookies,
    },
    cf: { cacheTtl: 30 }, // cache for 30 seconds to avoid rate limits
  });

  if (!resp.ok) {
    throw new Error(`NSE returned ${resp.status} for ${url}`);
  }

  return resp.json();
}

// ── Route: GET /nse/option-chain?symbol=NIFTY ──────────────────────────────
async function handleOptionChain(symbol) {
  const sym = symbol.toUpperCase();
  const isIndex = Object.keys(INDEX_MAP).includes(sym);

  let url;
  if (isIndex) {
    const nseSymbol = INDEX_MAP[sym] || sym;
    url = `${NSE_BASE}/api/option-chain-indices?symbol=${encodeURIComponent(nseSymbol)}`;
  } else {
    url = `${NSE_BASE}/api/option-chain-equities?symbol=${encodeURIComponent(sym)}`;
  }

  const data = await fetchNSEWithSession(url);

  // Normalise response into a clean structure
  const records = data?.records?.data || [];
  const expiryDates = data?.records?.expiryDates || [];
  const underlyingValue = data?.records?.underlyingValue || 0;
  const strikePrices = data?.records?.strikePrices || [];
  const timestamp = data?.records?.timestamp || new Date().toISOString();

  // Build chain map: strike → { call, put }
  const chainMap = {};
  for (const rec of records) {
    const strike = rec.strikePrice;
    if (!chainMap[strike]) chainMap[strike] = { strike };
    if (rec.CE) {
      chainMap[strike].call = {
        openInterest: rec.CE.openInterest || 0,
        changeinOpenInterest: rec.CE.changeinOpenInterest || 0,
        pchangeinOpenInterest: rec.CE.pchangeinOpenInterest || 0,
        totalTradedVolume: rec.CE.totalTradedVolume || 0,
        impliedVolatility: rec.CE.impliedVolatility || 0,
        lastPrice: rec.CE.lastPrice || 0,
        change: rec.CE.change || 0,
        pChange: rec.CE.pChange || 0,
        totalBuyQuantity: rec.CE.totalBuyQuantity || 0,
        totalSellQuantity: rec.CE.totalSellQuantity || 0,
        bidQty: rec.CE.bidQty || 0,
        bidprice: rec.CE.bidprice || 0,
        askQty: rec.CE.askQty || 0,
        askPrice: rec.CE.askPrice || 0,
        underlyingValue: rec.CE.underlyingValue || underlyingValue,
        expiryDate: rec.CE.expiryDate || "",
      };
    }
    if (rec.PE) {
      chainMap[strike].put = {
        openInterest: rec.PE.openInterest || 0,
        changeinOpenInterest: rec.PE.changeinOpenInterest || 0,
        pchangeinOpenInterest: rec.PE.pchangeinOpenInterest || 0,
        totalTradedVolume: rec.PE.totalTradedVolume || 0,
        impliedVolatility: rec.PE.impliedVolatility || 0,
        lastPrice: rec.PE.lastPrice || 0,
        change: rec.PE.change || 0,
        pChange: rec.PE.pChange || 0,
        totalBuyQuantity: rec.PE.totalBuyQuantity || 0,
        totalSellQuantity: rec.PE.totalSellQuantity || 0,
        bidQty: rec.PE.bidQty || 0,
        bidprice: rec.PE.bidprice || 0,
        askQty: rec.PE.askQty || 0,
        askPrice: rec.PE.askPrice || 0,
        underlyingValue: rec.PE.underlyingValue || underlyingValue,
        expiryDate: rec.PE.expiryDate || "",
      };
    }
  }

  return {
    symbol: sym,
    underlyingValue,
    expiryDates,
    strikePrices,
    timestamp,
    chain: Object.values(chainMap).sort((a, b) => a.strike - b.strike),
  };
}

// ── Route: GET /nse/expiry-dates?symbol=NIFTY ─────────────────────────────
async function handleExpiryDates(symbol) {
  // Expiry dates are embedded in the option chain response
  const chainData = await handleOptionChain(symbol);
  return {
    symbol: symbol.toUpperCase(),
    expiryDates: chainData.expiryDates,
    underlyingValue: chainData.underlyingValue,
  };
}

// ── Route: GET /nse/quote?symbol=RELIANCE ────────────────────────────────
async function handleQuote(symbol) {
  const sym = symbol.toUpperCase();
  const isIndex = Object.keys(INDEX_MAP).includes(sym);

  if (isIndex) {
    // For indices, get from option chain underlying value
    const data = await handleOptionChain(sym);
    return {
      symbol: sym,
      lastPrice: data.underlyingValue,
      isIndex: true,
      timestamp: data.timestamp,
    };
  }

  const url = `${NSE_BASE}/api/quote-equity?symbol=${encodeURIComponent(sym)}`;
  const data = await fetchNSEWithSession(url);

  return {
    symbol: sym,
    lastPrice: data?.priceInfo?.lastPrice || data?.lastPrice || 0,
    open: data?.priceInfo?.open || 0,
    high: data?.priceInfo?.intraDayHighLow?.max || 0,
    low: data?.priceInfo?.intraDayHighLow?.min || 0,
    previousClose: data?.priceInfo?.previousClose || 0,
    change: data?.priceInfo?.change || 0,
    pChange: data?.priceInfo?.pChange || 0,
    isIndex: false,
    timestamp: new Date().toISOString(),
  };
}

// ── Main handler ──────────────────────────────────────────────────────────
export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname;
    const symbol = url.searchParams.get("symbol") || "NIFTY";
    const expiry = url.searchParams.get("expiry") || "";

    try {
      let result;

      if (path === "/nse/option-chain") {
        result = await handleOptionChain(symbol, expiry);
      } else if (path === "/nse/expiry-dates") {
        result = await handleExpiryDates(symbol);
      } else if (path === "/nse/quote") {
        result = await handleQuote(symbol);
      } else {
        return new Response(
          JSON.stringify({ error: "Unknown route", path }),
          { status: 404, headers: CORS_HEADERS }
        );
      }

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: {
          ...CORS_HEADERS,
          "Cache-Control": "public, max-age=30", // 30s cache
        },
      });
    } catch (err) {
      console.error("NSE Proxy error:", err);
      return new Response(
        JSON.stringify({
          error: err.message,
          symbol,
          fallback: true,
          hint: "NSE may be closed or rate-limiting. Try again shortly.",
        }),
        { status: 502, headers: CORS_HEADERS }
      );
    }
  },
};
