-- Zella ICT: multi-user, owner-scoped data model.
-- Trading timestamps remain New York wall-clock values, matching the current app contract.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(pg_catalog.btrim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(pg_catalog.split_part(coalesce(new.email, ''), '@', 1), ''),
      'Trader'
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Trader',
  local_time_zone text not null default 'America/Santiago',
  market_time_zone text not null default 'America/New_York',
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint profiles_display_name_not_blank check (pg_catalog.length(pg_catalog.btrim(display_name)) > 0)
);

create table public.trading_accounts (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null default (pg_catalog.gen_random_uuid())::text,
  name text not null,
  firm text not null,
  initial_balance numeric(18, 2) not null,
  profit_target numeric(18, 2) not null default 0,
  max_drawdown numeric(18, 2) not null default 0,
  daily_loss_limit numeric(18, 2) not null default 0,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint trading_accounts_pkey primary key (user_id, id),
  constraint trading_accounts_name_not_blank check (pg_catalog.length(pg_catalog.btrim(name)) > 0),
  constraint trading_accounts_firm_not_blank check (pg_catalog.length(pg_catalog.btrim(firm)) > 0),
  constraint trading_accounts_amounts_nonnegative check (
    initial_balance > 0 and profit_target >= 0 and max_drawdown >= 0 and daily_loss_limit >= 0
  )
);

create table public.playbooks (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null default (pg_catalog.gen_random_uuid())::text,
  name text not null,
  description text not null default '',
  default_killzone text not null,
  required_pd_arrays text[] not null default array[]::text[],
  rules text[] not null default array[]::text[],
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint playbooks_pkey primary key (user_id, id),
  constraint playbooks_name_not_blank check (pg_catalog.length(pg_catalog.btrim(name)) > 0),
  constraint playbooks_killzone_valid check (default_killzone in (
    'NY Open 09:30 AM (09:30-10:30)',
    'NY Pre-Open / Macro (08:30-09:30)',
    'NY Mid-Morning (10:30-12:00)',
    'NY PM Session (13:30-16:00)',
    'London / Pre-NY (02:00-08:30)',
    'Out of NY Window'
  ))
);

create table public.trades (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null default (pg_catalog.gen_random_uuid())::text,
  account_id text not null,
  playbook_id text,
  symbol text not null,
  direction text not null,
  -- `entry_date` is intentionally timestamp without time zone: existing values represent NY wall time.
  entry_date timestamp without time zone not null,
  entry_price numeric(20, 8) not null,
  exit_price numeric(20, 8) not null,
  stop_loss numeric(20, 8) not null,
  take_profit numeric(20, 8) not null,
  size numeric(20, 8) not null,
  risk_percent_used numeric(7, 4),
  htf_aligned text[] not null default array[]::text[],
  gross_pnl numeric(20, 8) not null default 0,
  commission numeric(20, 8) not null default 0,
  net_pnl numeric(20, 8) not null default 0,
  planned_rr numeric(12, 6) not null default 0,
  r_multiple numeric(12, 6) not null default 0,
  status text not null,
  killzone text not null,
  pd_arrays text[] not null default array[]::text[],
  checklist_completed text[] not null default array[]::text[],
  setup_grade text not null default 'Sin evaluar',
  daily_bias text not null default 'Neutral',
  dol_target text not null default '',
  timeframe text not null,
  followed_plan boolean not null default false,
  psychology_tag text not null default 'Sin clasificar',
  trading_view_url text,
  screenshot_path text,
  notes text,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint trades_pkey primary key (user_id, id),
  constraint trades_account_fkey foreign key (user_id, account_id)
    references public.trading_accounts (user_id, id) on delete restrict,
  constraint trades_playbook_fkey foreign key (user_id, playbook_id)
    references public.playbooks (user_id, id) on delete set null (playbook_id),
  constraint trades_symbol_not_blank check (pg_catalog.length(pg_catalog.btrim(symbol)) > 0),
  constraint trades_direction_valid check (direction in ('Long', 'Short')),
  constraint trades_status_valid check (status in ('Win', 'Loss')),
  constraint trades_killzone_valid check (killzone in (
    'NY Open 09:30 AM (09:30-10:30)',
    'NY Pre-Open / Macro (08:30-09:30)',
    'NY Mid-Morning (10:30-12:00)',
    'NY PM Session (13:30-16:00)',
    'London / Pre-NY (02:00-08:30)',
    'Out of NY Window'
  )),
  constraint trades_setup_grade_valid check (setup_grade in ('A+', 'B', 'C', 'FOMO', 'Sin evaluar')),
  constraint trades_daily_bias_valid check (daily_bias in ('Bullish', 'Bearish', 'Neutral')),
  constraint trades_htf_timeframes_valid check (htf_aligned <@ array['1D', '4H', '2H', '30m']::text[]),
  constraint trades_pd_arrays_valid check (pd_arrays <@ array[
    'Contexto HTF (1D/4H/2H/30m)', 'FVG (Fair Value Gap)', 'IFVG (Inversion FVG)',
    'Order Block (+OB / -OB)', 'Breaker Block', 'Liquidity Sweep (BSL/SSL)',
    'SMT Divergence', 'OTE (62% - 79%)', 'BPR (Balanced Price Range)'
  ]::text[]),
  constraint trades_timeframe_valid check (timeframe in ('15m', '5m', '30m', '2H', '4H', '1D', '1m', '3m')),
  constraint trades_psychology_tag_valid check (psychology_tag in (
    'A+ Alineado al Contexto HTF',
    'Contra Contexto Mayor',
    'Entrada Anticipada (Antes de 9:30)',
    'FOMO (Perseguir Precio)',
    'Revenge Trade',
    'Overtrading',
    'Regla Violada (Cerrado antes de TP/SL)',
    'Sin clasificar'
  )),
  constraint trades_prices_and_size_valid check (
    entry_price >= 0 and exit_price >= 0 and stop_loss >= 0 and take_profit >= 0 and size > 0
  ),
  constraint trades_risk_percent_valid check (risk_percent_used is null or risk_percent_used between 0 and 100),
  constraint trades_external_links_https check (
    trading_view_url is null or trading_view_url ~ '^https://'
  )
);

create table public.daily_journal_notes (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  note_date date not null,
  pre_market_bias text not null default 'Neutral',
  dol_target text not null default '',
  high_impact_news text not null default '',
  pre_market_notes text not null default '',
  post_market_review text not null default '',
  followed_daily_rules boolean not null default false,
  timeframe_context jsonb not null default '{}'::jsonb,
  session_window text,
  no_trade boolean not null default false,
  no_trade_reason text not null default '',
  completed_rule_ids text[] not null default array[]::text[],
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint daily_journal_notes_pkey primary key (user_id, note_date),
  constraint daily_journal_notes_bias_valid check (pre_market_bias in ('Bullish', 'Bearish', 'Neutral')),
  constraint daily_journal_notes_context_object check (pg_catalog.jsonb_typeof(timeframe_context) = 'object'),
  constraint daily_journal_notes_session_window_valid check (session_window is null or session_window in (
    'NY Open 09:30 AM (09:30-10:30)',
    'NY Pre-Open / Macro (08:30-09:30)',
    'NY Mid-Morning (10:30-12:00)',
    'NY PM Session (13:30-16:00)',
    'London / Pre-NY (02:00-08:30)',
    'Out of NY Window'
  ))
);

create table public.personal_trading_rules (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null default (pg_catalog.gen_random_uuid())::text,
  rule_text text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint personal_trading_rules_pkey primary key (user_id, id),
  constraint personal_trading_rules_text_not_blank check (pg_catalog.length(pg_catalog.btrim(rule_text)) > 0)
);

create index trades_user_entry_date_idx on public.trades (user_id, entry_date desc);
create index trades_user_account_entry_date_idx on public.trades (user_id, account_id, entry_date desc);
create index trades_user_playbook_idx on public.trades (user_id, playbook_id) where playbook_id is not null;
create index notes_user_date_desc_idx on public.daily_journal_notes (user_id, note_date desc);
create index personal_rules_user_order_idx on public.personal_trading_rules (user_id, sort_order, id);

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_auth_user();
create trigger trading_accounts_set_updated_at before update on public.trading_accounts
  for each row execute function private.set_updated_at();
create trigger playbooks_set_updated_at before update on public.playbooks
  for each row execute function private.set_updated_at();
create trigger trades_set_updated_at before update on public.trades
  for each row execute function private.set_updated_at();
create trigger daily_journal_notes_set_updated_at before update on public.daily_journal_notes
  for each row execute function private.set_updated_at();
create trigger personal_trading_rules_set_updated_at before update on public.personal_trading_rules
  for each row execute function private.set_updated_at();

alter table public.profiles enable row level security;
alter table public.trading_accounts enable row level security;
alter table public.playbooks enable row level security;
alter table public.trades enable row level security;
alter table public.daily_journal_notes enable row level security;
alter table public.personal_trading_rules enable row level security;

revoke all on table public.profiles, public.trading_accounts, public.playbooks,
  public.trades, public.daily_journal_notes, public.personal_trading_rules from anon, authenticated;
grant select, insert, update on table public.profiles to authenticated;
grant select, insert, update, delete on table public.trading_accounts, public.playbooks,
  public.trades, public.daily_journal_notes, public.personal_trading_rules to authenticated;

create policy profiles_select_own on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy profiles_insert_own on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy trading_accounts_select_own on public.trading_accounts for select to authenticated
  using (user_id = (select auth.uid()));
create policy trading_accounts_insert_own on public.trading_accounts for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy trading_accounts_update_own on public.trading_accounts for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy trading_accounts_delete_own on public.trading_accounts for delete to authenticated
  using (user_id = (select auth.uid()));

create policy playbooks_select_own on public.playbooks for select to authenticated
  using (user_id = (select auth.uid()));
create policy playbooks_insert_own on public.playbooks for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy playbooks_update_own on public.playbooks for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy playbooks_delete_own on public.playbooks for delete to authenticated
  using (user_id = (select auth.uid()));

create policy trades_select_own on public.trades for select to authenticated
  using (user_id = (select auth.uid()));
create policy trades_insert_own on public.trades for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy trades_update_own on public.trades for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy trades_delete_own on public.trades for delete to authenticated
  using (user_id = (select auth.uid()));

create policy daily_notes_select_own on public.daily_journal_notes for select to authenticated
  using (user_id = (select auth.uid()));
create policy daily_notes_insert_own on public.daily_journal_notes for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy daily_notes_update_own on public.daily_journal_notes for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy daily_notes_delete_own on public.daily_journal_notes for delete to authenticated
  using (user_id = (select auth.uid()));

create policy personal_rules_select_own on public.personal_trading_rules for select to authenticated
  using (user_id = (select auth.uid()));
create policy personal_rules_insert_own on public.personal_trading_rules for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy personal_rules_update_own on public.personal_trading_rules for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy personal_rules_delete_own on public.personal_trading_rules for delete to authenticated
  using (user_id = (select auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'trade-screenshots',
  'trade-screenshots',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy trade_screenshots_select_own on storage.objects for select to authenticated
  using (
    bucket_id = 'trade-screenshots'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy trade_screenshots_insert_own on storage.objects for insert to authenticated
  with check (
    bucket_id = 'trade-screenshots'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy trade_screenshots_update_own on storage.objects for update to authenticated
  using (
    bucket_id = 'trade-screenshots'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'trade-screenshots'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy trade_screenshots_delete_own on storage.objects for delete to authenticated
  using (
    bucket_id = 'trade-screenshots'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
