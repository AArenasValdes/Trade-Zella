-- Migration: 20261030120000_v1b_simplified_registration.sql
-- Description: Additive migration for Martin OS V1b simplified trade capture.
-- Adds realized_net_return_pct and duration_minutes columns.
-- Extends calculation_mode check constraint to include 'unrecorded'.
-- Safe, additive, non-destructive and fully backwards-compatible.

-- 1. Add realized_net_return_pct (allows recording actual % return without assuming fixed risk)
alter table public.trades
  add column if not exists realized_net_return_pct numeric(8, 4);

-- 2. Add duration_minutes (manual duration in minutes, optional)
alter table public.trades
  add column if not exists duration_minutes integer;

-- 3. Check constraint for duration_minutes (must be non-negative if provided)
alter table public.trades
  drop constraint if exists trades_duration_minutes_nonnegative;

alter table public.trades
  add constraint trades_duration_minutes_nonnegative check (
    duration_minutes is null or duration_minutes >= 0
  );

-- 4. Update calculation_mode check constraint to include 'unrecorded'
-- 'monetary': real audited execution prices & monetary P&L
-- 'derived_r': historical legacy derived P&L from reference capital
-- 'unrecorded': new simplified V1b trade with R and/or % return without fabricated dollar amounts
alter table public.trades
  drop constraint if exists trades_calculation_mode_valid;

alter table public.trades
  add constraint trades_calculation_mode_valid check (
    calculation_mode in ('monetary', 'derived_r', 'unrecorded')
  );
