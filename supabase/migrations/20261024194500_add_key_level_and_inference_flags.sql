-- Migration: 20261024194500_add_key_level_and_inference_flags.sql
-- Description: Add 'Key Level' to pd_arrays CHECK constraint and additive provenance columns.
-- Safe, additive, non-destructive, fully idempotent migration.

-- 1. Update pd_arrays CHECK constraint to include 'Key Level'
alter table public.trades
  drop constraint if exists trades_pd_arrays_valid;

alter table public.trades
  add constraint trades_pd_arrays_valid check (pd_arrays <@ array[
    'Contexto HTF (1D/4H/2H/30m)',
    'FVG (Fair Value Gap)',
    'IFVG (Inversion FVG)',
    'Order Block (+OB / -OB)',
    'Breaker Block',
    'Liquidity Sweep (BSL/SSL)',
    'SMT Divergence',
    'OTE (62% - 79%)',
    'BPR (Balanced Price Range)',
    'Key Level'
  ]::text[]);

-- 2. Additive provenance columns with safe defaults for existing rows
alter table public.trades
  add column if not exists time_precision text not null default 'exact',
  add column if not exists operational_window text,
  add column if not exists calculation_mode text not null default 'monetary',
  add column if not exists commission_unmeasured boolean not null default false,
  add column if not exists prices_unrecorded boolean not null default false;

-- 3. Idempotent check constraints for provenance columns
alter table public.trades
  drop constraint if exists trades_time_precision_valid,
  drop constraint if exists trades_operational_window_valid,
  drop constraint if exists trades_calculation_mode_valid;

alter table public.trades
  add constraint trades_time_precision_valid check (time_precision in ('exact', 'window')),
  add constraint trades_operational_window_valid check (operational_window is null or operational_window in ('window_1', 'window_2', 'outside')),
  add constraint trades_calculation_mode_valid check (calculation_mode in ('monetary', 'derived_r'));
