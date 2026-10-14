#!/usr/bin/env python3
"""JACK TRADE MT5 bridge (read-only).

Polls the local MetaTrader 5 terminal for account + open XAUUSD positions and
POSTs a snapshot to the desk API. Never places, modifies or closes orders.

Run this on the Windows box that has MT5 installed:

    pip install -r requirements.txt
    set API_BASE=http://HOST:3101
    set API_TOKEN=<machine token>
    python bridge.py

Env:
    API_BASE        API base URL (default http://127.0.0.1:3101)
    API_TOKEN       machine bearer token (same value the web proxy uses)
    POLL_SECONDS    poll interval (default 30)
    SYMBOL_FILTER   only sync these symbols, comma separated (default XAUUSD)

Exit codes: 0 clean Ctrl+C, 1 config error, 2 terminal init failed.
"""

import json
import os
import sys
import time
import urllib.error
import urllib.request

API_BASE = os.environ.get("API_BASE", "http://127.0.0.1:3101").rstrip("/")
API_TOKEN = os.environ.get("API_TOKEN", "")
POLL_SECONDS = int(os.environ.get("POLL_SECONDS", "30"))
SYMBOL_FILTER = {
    s.strip().upper()
    for s in os.environ.get("SYMBOL_FILTER", "XAUUSD").split(",")
    if s.strip()
}
SYNC_PATH = "/v1/mt5/sync"


def post_json(path: str, payload: dict) -> tuple[bool, str]:
    req = urllib.request.Request(
        API_BASE + path,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {API_TOKEN}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as res:
            return True, res.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")
        return False, f"HTTP {e.code}: {body[:300]}"
    except Exception as e:  # noqa: BLE001 — transport errors all look the same here
        return False, str(e)


def collect(mt5) -> tuple[dict, list[dict], str]:
    """Return (account, positions, bridge_status)."""
    info = mt5.account_info()
    if info is None:
        return {}, [], "degraded"
    account = {
        "login": info.login,
        "name": info.name,
        "company": info.company,
        "server": info.server,
        "currency": info.currency,
        "balance": round(float(info.balance), 2),
        "equity": round(float(info.equity), 2),
        "margin": round(float(info.margin), 2),
        "leverage": info.leverage,
    }
    positions = []
    for p in mt5.positions_get() or ():
        sym = (p.symbol or "").upper()
        if SYMBOL_FILTER and not any(f in sym for f in SYMBOL_FILTER):
            continue
        positions.append(
            {
                "ticket": p.ticket,
                "symbol": p.symbol,
                # 0 = buy, 1 = sell in MT5
                "type": "buy" if p.type == 0 else "sell",
                "volume": round(float(p.volume), 2),
                "price_open": float(p.price_open),
                "sl": float(p.sl),
                "tp": float(p.tp),
                "profit": round(float(p.profit), 2),
                "comment": (p.comment or "")[:64],
                "ctime": int(p.time),
            }
        )
    return account, positions, "ok"


def main() -> int:
    if not API_TOKEN:
        print("API_TOKEN is not set — refusing to run.", file=sys.stderr)
        return 1
    try:
        import MetaTrader5 as mt5
    except ImportError:
        print(
            "MetaTrader5 package not installed (Windows only).\n"
            "  pip install -r requirements.txt",
            file=sys.stderr,
        )
        return 2

    if not mt5.initialize():
        print(f"mt5.initialize() failed: {mt5.last_error()} — is the terminal running?", file=sys.stderr)
        # Keep retrying: the user may launch MT5 after the bridge.
        while not mt5.initialize():
            time.sleep(POLL_SECONDS)

    print(f"MT5 bridge up → {API_BASE}{SYNC_PATH} every {POLL_SECONDS}s (symbols: {sorted(SYMBOL_FILTER) or 'all'})")
    fails = 0
    try:
        while True:
            account, positions, status = collect(mt5)
            ok, detail = post_json(
                SYNC_PATH,
                {"account": account, "positions": positions, "bridge_status": status},
            )
            if ok:
                fails = 0
                print(f"[{time.strftime('%H:%M:%S')}] synced {len(positions)} position(s), status={status}")
            else:
                fails += 1
                print(f"[{time.strftime('%H:%M:%S')}] sync failed ({fails}): {detail}", file=sys.stderr)
                if fails >= 5:
                    print("5 consecutive failures — sleeping 5 minutes before retrying.", file=sys.stderr)
                    time.sleep(300)
                    fails = 0
            time.sleep(POLL_SECONDS)
    except KeyboardInterrupt:
        mt5.shutdown()
        print("\nbridge stopped.")
        return 0
    return 0


if __name__ == "__main__":
    sys.exit(main())
