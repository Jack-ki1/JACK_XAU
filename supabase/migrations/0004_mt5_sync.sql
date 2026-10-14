-- 0004_mt5_sync.sql — v2 C11: MT5 bridge snapshots (read-only account/position
-- sync from the user's Windows terminal). Append-only: each poll inserts one
-- row; the desk renders the latest. No order placement — view only.

create table if not exists mt5_snapshots (
  id bigint generated always as identity primary key,
  account jsonb not null default '{}',      -- {login, name, company, balance, equity, margin, server}
  positions jsonb not null default '[]',    -- [{ticket, symbol, type, volume, price_open, sl, tp, profit, comment, ctime}]
  bridge_status text not null default 'ok', -- ok | degraded (terminal not ready)
  created_at timestamptz not null default now()
);

create index if not exists mt5_snapshots_created on mt5_snapshots (created_at desc);

-- Read model: only the API (service role) touches this table; RLS from 0002
-- already denies anon/authenticated.
