-- Migration: 20261030130000_v1b_financial_audit_fixes.sql
-- Description: Additive migration to support technical accounts without fictitious capital,
-- unrecorded R-Multiples, unrecorded plan compliance on simplified V1b capture, P&L provenance,
-- and data conflict flags on CSV imports.
-- Safe, additive, non-destructive, and idempotent.

-- 1. Add is_technical to trading_accounts
alter table public.trading_accounts
  add column if not exists is_technical boolean not null default false;

-- 2. Add has_verified_balance to trading_accounts
alter table public.trading_accounts
  add column if not exists has_verified_balance boolean not null default true;

-- 3. Update check constraint to allow technical accounts with initial_balance = 0
alter table public.trading_accounts
  drop constraint if exists trading_accounts_amounts_nonnegative;

alter table public.trading_accounts
  add constraint trading_accounts_amounts_nonnegative check (
    initial_balance >= 0 and profit_target >= 0 and max_drawdown >= 0 and daily_loss_limit >= 0
  );

-- 4. Add r_unrecorded, plan_unrecorded, has_data_conflict, and pnl_provenance to trades
alter table public.trades
  add column if not exists r_unrecorded boolean not null default false;

alter table public.trades
  add column if not exists plan_unrecorded boolean not null default false;

alter table public.trades
  add column if not exists has_data_conflict boolean not null default false;

alter table public.trades
  add column if not exists pnl_provenance text default null;

alter table public.trades
  drop constraint if exists trades_pnl_provenance_check;

alter table public.trades
  add constraint trades_pnl_provenance_check check (
    pnl_provenance is null or pnl_provenance in ('audited', 'theoretical', 'derived_r', 'unrecorded')
  );
