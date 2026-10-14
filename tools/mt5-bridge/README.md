# MT5 bridge (read-only)

Polls your local MetaTrader 5 terminal for account info + open XAUUSD
positions and posts a snapshot to the desk. **Never places orders.**

## Run (Windows)

```bat
cd tools\mt5-bridge
pip install -r requirements.txt
set API_BASE=http://YOUR_HOST:3101
set API_TOKEN=YOUR_MACHINE_TOKEN
python bridge.py
```

- `SYMBOL_FILTER` (default `XAUUSD`) — comma-separated symbols to sync.
- `POLL_SECONDS` (default `30`) — poll interval.
- Terminal must be running; the bridge retries `mt5.initialize()` until it is.
- 5 consecutive API failures → sleeps 5 minutes, then resumes.

## API side

| Endpoint | Purpose |
|---|---|
| `POST /v1/mt5/sync` | ingest `{account, positions, bridge_status}` (Bearer `API_TOKEN`) |
| `GET /v1/mt5/status` | latest snapshot + `connected` (fresh < 10 min) |

Table: `mt5_snapshots` (migration `0004_mt5_sync.sql`, append-only).

Degrades to `connected: false` with no bridge running — the desk works
without it; this is a live-account mirror, not a dependency.
