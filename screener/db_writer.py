<< 'EOF'
"""
db_writer.py
Writes screener / single-stock results back to Supabase
so users can see them in the dashboard.

Called from main.py after analysis completes.
"""
import os
import json
import logging
import urllib.request
import urllib.error

log = logging.getLogger(__name__)

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")


def _post(endpoint: str, payload: dict) -> bool:
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        log.warning("Supabase not configured — skipping DB write")
        return False
    url = f"{SUPABASE_URL}/rest/v1/{endpoint}"
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        url, data=data, method="POST",
        headers={
            "apikey": SUPABASE_SERVICE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        }
    )
    try:
        with urllib.request.urlopen(req) as r:
            return r.status in (200, 201)
    except urllib.error.HTTPError as e:
        log.error(f"Supabase write error {e.code}: {e.read().decode()}")
        return False


def _patch(endpoint: str, run_id: str, payload: dict) -> bool:
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return False
    url = f"{SUPABASE_URL}/rest/v1/{endpoint}?id=eq.{run_id}"
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        url, data=data, method="PATCH",
        headers={
            "apikey": SUPABASE_SERVICE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
            "Content-Type": "application/json",
        }
    )
    try:
        with urllib.request.urlopen(req) as r:
            return r.status in (200, 204)
    except urllib.error.HTTPError as e:
        log.error(f"Supabase patch error {e.code}: {e.read().decode()}")
        return False


def save_results(reports: list, run_type: str = "screener", run_id: str = None) -> bool:
    """
    Write a list of StockReport objects to Supabase run_results.
    run_id: if provided, links rows to the runs table entry.
    """
    if not reports:
        return True

    # GitHub Actions sets the user_id via env so results appear under the right user
    user_id = os.getenv("SUPABASE_USER_ID", "")

    rows = []
    for r in reports:
        t = r.tech
        f = r.fund
        setup = (t.swing if r.swing_pick else t.long_term) if t else None

        row = {
            "symbol":          r.symbol,
            "cap_category":    r.cap_category,
            "composite_score": r.composite_score,
            "grade":           r.overall_grade,
            "best_trade":      r.best_trade_type,
            "close_price":     t.close      if t else None,
            "entry_price":     setup.entry  if setup else None,
            "target1":         setup.target1 if setup else None,
            "target2":         setup.target2 if setup else None,
            "stop_loss":       setup.stop_loss if setup else None,
            "risk_reward":     setup.risk_reward if setup else None,
            "trend":           t.trend      if t else None,
            "rsi":             t.rsi        if t else None,
            "signals":         json.dumps(t.signals if t else []),
            "fundamentals":    json.dumps({
                "pe":       f.pe_ratio          if f else None,
                "pb":       f.pb_ratio          if f else None,
                "roe":      f.roe               if f else None,
                "margin":   f.net_margin        if f else None,
                "rev_growth":f.revenue_growth_yoy if f else None,
                "eps_growth":f.earnings_growth_yoy if f else None,
            }),
        }
        if user_id:
            row["user_id"] = user_id
        if run_id:
            row["run_id"] = run_id
        rows.append(row)

    # Supabase accepts batch inserts
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        log.warning("Supabase not configured — skipping DB write")
        return False

    url = f"{SUPABASE_URL}/rest/v1/run_results"
    data = json.dumps(rows).encode()
    req = urllib.request.Request(
        url, data=data, method="POST",
        headers={
            "apikey": SUPABASE_SERVICE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        }
    )
    try:
        with urllib.request.urlopen(req) as r:
            log.info(f"Saved {len(rows)} result(s) to Supabase")
            return r.status in (200, 201)
    except urllib.error.HTTPError as e:
        log.error(f"Supabase batch write error {e.code}: {e.read().decode()}")
        return False


def mark_run_complete(run_id: str, count: int) -> bool:
    return _patch("runs", run_id, {"status": "completed", "params": {"result_count": count}})


def mark_run_failed(run_id: str, error: str) -> bool:
    return _patch("runs", run_id, {"status": "failed", "params": {"error": error}})
EOF
