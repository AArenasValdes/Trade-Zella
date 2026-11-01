-- Migration: 20261101140000_v3_backtesting_vs_real.sql
-- Description: Additive migration for Martin OS V3 to distinguish Backtesting, Demo, and Real trades,
-- preserving all historical trades as 'unclassified' without assuming real execution.
-- Safe, additive, idempotent.

-- 1. Add source_type column to public.trades (default 'unclassified' protects historical data)
alter table public.trades
  add column if not exists source_type text not null default 'unclassified';

-- 2. Drop old constraint if exists and re-add to enforce allowed environment values
alter table public.trades
  drop constraint if exists trades_source_type_check;

alter table public.trades
  add constraint trades_source_type_check check (
    source_type in ('real', 'demo', 'backtest', 'unclassified')
  );

-- 3. Add index on source_type to support performant filtering in dashboard and edge analytics
create index if not exists idx_trades_source_type on public.trades (source_type);
