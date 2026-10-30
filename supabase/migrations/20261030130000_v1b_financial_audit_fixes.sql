-- Migration: 20261030130000_v1b_financial_audit_fixes.sql
-- Description: Additive migration to support technical accounts without fictitious capital.
-- Allows initial_balance >= 0 for accounts, distinguishing technical identity from verified capital.
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
