-- MARTIN OS — V4b: AI Analyst Usage Ledger & Shared Budget Control
-- Migration: 20261101200000_v4b_ai_usage_ledger.sql
-- Note: Prepared for future production deployment. Do NOT run destructively.

CREATE TABLE IF NOT EXISTS public.ai_usage_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  billing_month TEXT NOT NULL, -- Format: 'YYYY-MM'
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd NUMERIC(10, 6) NOT NULL DEFAULT 0.000000,
  reserved_cost_usd NUMERIC(10, 6) NOT NULL DEFAULT 0.000000,
  status TEXT NOT NULL CHECK (status IN ('reserved', 'completed', 'failed', 'refunded')),
  model TEXT NOT NULL DEFAULT 'deepseek-flash',
  query_preview TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for efficient billing month aggregation and user rate limiting
CREATE INDEX IF NOT EXISTS idx_ai_usage_billing_month ON public.ai_usage_ledger(billing_month, status);
CREATE INDEX IF NOT EXISTS idx_ai_usage_user_timestamp ON public.ai_usage_ledger(user_id, request_timestamp);

-- Enable Row Level Security
ALTER TABLE public.ai_usage_ledger ENABLE ROW LEVEL SECURITY;

-- Policies: Authenticated users can only read their own AI ledger entries
-- Writes (INSERT, UPDATE, DELETE) are strictly prohibited for public/anon/authenticated roles
-- and must be performed exclusively via service_role RPC functions.
CREATE POLICY "Users can view their own ai usage"
  ON public.ai_usage_ledger
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- 1. Atomic reservation function with transactional advisory locking
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reserve_ai_query(
  p_user_id UUID,
  p_billing_month TEXT DEFAULT NULL,
  p_reserve_amount NUMERIC(10, 6) DEFAULT 0.010000
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c_max_monthly_budget CONSTANT NUMERIC(10, 6) := 5.000000;
  c_max_daily_queries CONSTANT INTEGER := 20;
  c_max_allowed_reservation CONSTANT NUMERIC(10, 6) := 0.050000;

  v_billing_month TEXT := COALESCE(p_billing_month, to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM'));
  v_reserve_amount NUMERIC(10, 6) := LEAST(GREATEST(COALESCE(p_reserve_amount, 0.010000), 0.000001), c_max_allowed_reservation);
  v_today_start TIMESTAMPTZ := date_trunc('day', now() AT TIME ZONE 'UTC');
  v_user_today_count INTEGER;
  v_current_month_spent NUMERIC(10, 6);
  v_ledger_id UUID;
BEGIN
  -- Validate user id
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'invalid_user',
      'message', 'El identificador de usuario es obligatorio.'
    );
  END IF;

  -- TRANSACTIONAL LOCK: Acquire exclusive advisory lock for the billing month.
  -- This serializes concurrent reservations across all instances and eliminates race conditions.
  PERFORM pg_advisory_xact_lock(hashtext('ai_budget_month_' || v_billing_month));

  -- Conservative ledger policy: Pending reservations ('reserved') are NOT automatically
  -- forgiven or refunded without confirmation, ensuring the $5.00 hard cap is never breached.

  -- 1. Check daily rate limit for this user (Max 20 queries/day)
  SELECT COUNT(*)
  INTO v_user_today_count
  FROM public.ai_usage_ledger
  WHERE user_id = p_user_id
    AND request_timestamp >= v_today_start
    AND status IN ('reserved', 'completed');

  IF v_user_today_count >= c_max_daily_queries THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'daily_limit_exceeded',
      'message', 'Has alcanzado el límite diario de 20 consultas.',
      'today_queries', v_user_today_count,
      'max_daily_queries', c_max_daily_queries
    );
  END IF;

  -- 2. Check monthly budget across all instances (Hard cap $5.00 USD)
  SELECT COALESCE(SUM(
    CASE 
      WHEN status = 'completed' THEN estimated_cost_usd
      WHEN status = 'reserved' THEN reserved_cost_usd
      ELSE 0
    END
  ), 0.000000)
  INTO v_current_month_spent
  FROM public.ai_usage_ledger
  WHERE billing_month = v_billing_month
    AND status IN ('reserved', 'completed');

  IF (v_current_month_spent + v_reserve_amount) > c_max_monthly_budget THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'budget_exceeded',
      'message', 'Presupuesto mensual de IA alcanzado ($5.00 USD). Consultas pausadas hasta el próximo ciclo.',
      'current_spent_usd', v_current_month_spent,
      'max_monthly_budget_usd', c_max_monthly_budget
    );
  END IF;

  -- 3. Reserve atomically
  INSERT INTO public.ai_usage_ledger (
    user_id,
    billing_month,
    reserved_cost_usd,
    estimated_cost_usd,
    status,
    model
  ) VALUES (
    p_user_id,
    v_billing_month,
    v_reserve_amount,
    0.000000,
    'reserved',
    'deepseek-flash'
  ) RETURNING id INTO v_ledger_id;

  RETURN jsonb_build_object(
    'success', true,
    'ledger_id', v_ledger_id,
    'today_queries', v_user_today_count + 1,
    'max_daily_queries', c_max_daily_queries,
    'current_spent_usd', v_current_month_spent + v_reserve_amount,
    'max_monthly_budget_usd', c_max_monthly_budget,
    'reserved_amount_usd', v_reserve_amount
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. Settlement function after provider call completes
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.settle_ai_query(
  p_ledger_id UUID,
  p_user_id UUID,
  p_prompt_tokens INTEGER,
  p_completion_tokens INTEGER,
  p_actual_cost_usd NUMERIC(10, 6),
  p_query_preview TEXT,
  p_status TEXT -- 'completed' or 'refunded'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_normalized_status TEXT := LOWER(TRIM(COALESCE(p_status, 'refunded')));
  v_actual_cost NUMERIC(10, 6) := GREATEST(COALESCE(p_actual_cost_usd, 0.000000), 0.000000);
  v_reserved_cost NUMERIC(10, 6);
  v_updated_rows INTEGER;
BEGIN
  IF v_normalized_status NOT IN ('completed', 'refunded', 'failed') THEN
    v_normalized_status := 'refunded';
  END IF;

  -- Verify reservation exists and belongs to the user
  SELECT reserved_cost_usd INTO v_reserved_cost
  FROM public.ai_usage_ledger
  WHERE id = p_ledger_id
    AND user_id = p_user_id
    AND status = 'reserved';

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'invalid_reservation',
      'message', 'No se encontró una reserva pendiente válida para este usuario y ledger id.'
    );
  END IF;

  UPDATE public.ai_usage_ledger
  SET
    prompt_tokens = CASE WHEN v_normalized_status = 'completed' THEN GREATEST(COALESCE(p_prompt_tokens, 0), 0) ELSE 0 END,
    completion_tokens = CASE WHEN v_normalized_status = 'completed' THEN GREATEST(COALESCE(p_completion_tokens, 0), 0) ELSE 0 END,
    total_tokens = CASE WHEN v_normalized_status = 'completed' THEN (GREATEST(COALESCE(p_prompt_tokens, 0), 0) + GREATEST(COALESCE(p_completion_tokens, 0), 0)) ELSE 0 END,
    estimated_cost_usd = CASE WHEN v_normalized_status = 'completed' THEN v_actual_cost ELSE 0.000000 END,
    reserved_cost_usd = 0.000000,
    status = v_normalized_status,
    query_preview = CASE WHEN p_query_preview IS NOT NULL THEN substring(p_query_preview from 1 for 120) ELSE NULL END,
    updated_at = now()
  WHERE id = p_ledger_id
    AND user_id = p_user_id
    AND status = 'reserved';

  GET DIAGNOSTICS v_updated_rows = ROW_COUNT;

  IF v_updated_rows = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'invalid_reservation',
      'message', 'La reserva ya fue liquidada o cancelada previamente.'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'ledger_id', p_ledger_id,
    'status', v_normalized_status,
    'actual_cost_usd', CASE WHEN v_normalized_status = 'completed' THEN v_actual_cost ELSE 0.000000 END,
    'reserved_cost_usd', v_reserved_cost
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. Global budget summary function (safe aggregation without leaking other users' records)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_ai_budget_summary(
  p_user_id UUID,
  p_billing_month TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c_max_monthly_budget CONSTANT NUMERIC(10, 6) := 5.000000;
  c_max_daily_queries CONSTANT INTEGER := 20;

  v_billing_month TEXT := COALESCE(p_billing_month, to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM'));
  v_today_start TIMESTAMPTZ := date_trunc('day', now() AT TIME ZONE 'UTC');
  v_user_today_count INTEGER := 0;
  v_current_month_spent NUMERIC(10, 6) := 0.000000;
BEGIN
  -- Aggregate queries used by this user today
  IF p_user_id IS NOT NULL THEN
    SELECT COUNT(*)
    INTO v_user_today_count
    FROM public.ai_usage_ledger
    WHERE user_id = p_user_id
      AND request_timestamp >= v_today_start
      AND status IN ('reserved', 'completed');
  END IF;

  -- Aggregate total spent across all users for this billing month (completed + pending reservations)
  SELECT COALESCE(SUM(
    CASE 
      WHEN status = 'completed' THEN estimated_cost_usd
      WHEN status = 'reserved' THEN reserved_cost_usd
      ELSE 0
    END
  ), 0.000000)
  INTO v_current_month_spent
  FROM public.ai_usage_ledger
  WHERE billing_month = v_billing_month
    AND status IN ('reserved', 'completed');

  RETURN jsonb_build_object(
    'billing_month', v_billing_month,
    'today_queries', v_user_today_count,
    'max_daily_queries', c_max_daily_queries,
    'current_month_spent_usd', v_current_month_spent,
    'max_monthly_budget_usd', c_max_monthly_budget,
    'remaining_budget_usd', GREATEST(c_max_monthly_budget - v_current_month_spent, 0.000000),
    'is_daily_limit_reached', v_user_today_count >= c_max_daily_queries,
    'is_monthly_budget_reached', v_current_month_spent >= c_max_monthly_budget
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. Restrict Execution Privileges: SERVICE_ROLE ONLY
-- Prevents public, anon, or authenticated clients from forging ledger entries or manipulating budgets.
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.reserve_ai_query(UUID, TEXT, NUMERIC) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.settle_ai_query(UUID, UUID, INTEGER, INTEGER, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_ai_budget_summary(UUID, TEXT) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.reserve_ai_query(UUID, TEXT, NUMERIC) TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_ai_query(UUID, UUID, INTEGER, INTEGER, NUMERIC, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_ai_budget_summary(UUID, TEXT) TO service_role;
