"""
main.py — Trade Screener entry point

Usage:
  python main.py                          # scan all caps
  python main.py --cap midcap --trade swing
  python main.py --single-stock TCS
  python main.py --no-notify --no-db      # local test, no side effects
"""

import argparse, asyncio, logging, os, sys

from config import cfg
from screener.screener      import run_screener
from screener.single_stock  import analyse_single
from screener.report_builder import format_console, format_telegram, format_html_email
from screener.notifier       import send_telegram_message, send_email
from screener.db_writer      import save_results, mark_run_complete, mark_run_failed

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)

def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--cap",          default="all", choices=["all","largecap","midcap","smallcap"])
    p.add_argument("--trade",        default="all", choices=["all","longterm","swing","intraday"])
    p.add_argument("--min-score",    default=55, type=int)
    p.add_argument("--max",          default=100, type=int)
    p.add_argument("--workers",      default=4, type=int)
    p.add_argument("--single-stock", default="", type=str)
    p.add_argument("--no-notify",    action="store_true")
    p.add_argument("--no-db",        action="store_true")
    p.add_argument("--run-id",       default="", help="Supabase run ID passed from CF function")
    return p.parse_args()

async def broadcast(token, chat_ids, messages):
    for chat_id in chat_ids:
        for msg in messages:
            await send_telegram_message(token, chat_id, msg)
    log.info(f"Telegram broadcast → {len(chat_ids)} group(s)")

def notify(reports, cap_label, args):
    if args.no_notify:
        return
    # Telegram: only on scheduled runs (no TRIGGERED_BY env means scheduled)
    triggered_by = os.getenv("TRIGGERED_BY", "schedule")
    if triggered_by == "schedule" and cfg.telegram_enabled:
        messages = format_telegram(reports, cap_filter=cap_label)
        asyncio.run(broadcast(cfg.telegram_token, cfg.telegram_chat_ids, messages))
    elif triggered_by != "schedule":
        log.info("Manual run — skipping Telegram (user will see results in dashboard)")

    if cfg.email_enabled:
        send_email(
            sender    = cfg.email_sender,
            password  = cfg.email_password,
            recipient = cfg.email_recipient,
            html_body = format_html_email(reports, cap_filter=cap_label),
            subject   = f"📈 Trade Screener — {len(reports)} pick(s) | {cap_label.upper()}",
        )

def main():
    args = parse_args()
    cfg.log_status()
    run_id = args.run_id or os.getenv("SUPABASE_RUN_ID", "")

    # ── Single stock ──────────────────────────────────────────────
    if args.single_stock:
        symbol = args.single_stock.upper().strip()
        log.info(f"Single stock: {symbol}")
        try:
            report = analyse_single(symbol)
            if not report:
                if run_id: mark_run_failed(run_id, f"No data for {symbol}")
                sys.exit(1)
            print(format_console([report]))
            if not args.no_db:
                save_results([report], run_type="single", run_id=run_id or None)
                if run_id: mark_run_complete(run_id, 1)
            notify([report], symbol, args)
        except Exception as e:
            log.error(f"Single stock failed: {e}")
            if run_id: mark_run_failed(run_id, str(e))
            sys.exit(1)
        return

    # ── Screener ──────────────────────────────────────────────────
    log.info(f"Screener: cap={args.cap} trade={args.trade} min_score={args.min_score}")
    try:
        reports = run_screener(
            cap_filter=args.cap, max_stocks=args.max,
            min_score=args.min_score, trade_filter=args.trade, workers=args.workers,
        )
        print(format_console(reports))
        if not reports:
            log.info("No stocks matched.")
            if run_id: mark_run_complete(run_id, 0)
            sys.exit(0)
        if not args.no_db:
            save_results(reports, run_type="screener", run_id=run_id or None)
            if run_id: mark_run_complete(run_id, len(reports))
        notify(reports, args.cap, args)
    except Exception as e:
        log.error(f"Screener failed: {e}")
        if run_id: mark_run_failed(run_id, str(e))
        sys.exit(1)

if __name__ == "__main__":
    main()
