-- MARTIN OS — V4b: AI Analyst Usage Ledger & Shared Budget Control
-- Migration: 20261101200000_v4b_ai_usage_ledger.sql
-- Note: Prepared for future production deployment. Do NOT run destructively.

CREATE TABLE IF NOT EXISTS public.ai_usage_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  billing_month TEXT NOT NULL, -- e.g. '2026-11'
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
CREATE POLICY "Users can view their own ai usage"
  ON public.ai_usage_ledger
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Atomic reservation function to prevent race condition budget overdraft across Vercel instances
CREATE OR REPLACE FUNCTION public.reserve_ai_query(
  p_user_id UUID,
  p_billing_month TEXT,
  p_reserve_amount NUMERIC(10, 6),
  p_max_monthly_budget NUMERIC(10, 6),
  p_max_daily_queries INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today_start TIMESTAMPTZ := date_trunc('day', now());
  v_user_today_count INTEGER;
  v_current_month_spent NUMERIC(10, 6);
  v_ledger_id UUID;
BEGIN
  -- 1. Check daily rate limit for this user (Max 20 queries/day)
  SELECT COUNT(*)
  INTO v_user_today_count
  FROM public.ai_usage_ledger
  WHERE user_id = p_user_id
    AND request_timestamp >= v_today_start
    AND status IN ('reserved', 'completed');

  IF v_user_today_count >= p_max_daily_queries THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'daily_limit_exceeded',
      'message', 'Has alcanzado el límite diario de 20 consultas.',
      'today_queries', v_user_today_count,
      'max_daily_queries', p_max_daily_queries
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
  WHERE billing_month = p_billing_month
    AND status IN ('reserved', 'completed');

  IF (v_current_month_spent + p_reserve_amount) > p_max_monthly_budget THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'budget_exceeded',
      'message', 'Presupuesto mensual de IA alcanzado ($5.00 USD). Consultas pausadas hasta el próximo ciclo.',
      'current_spent_usd', v_current_month_spent,
      'max_monthly_budget_usd', p_max_monthly_budget
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
    p_billing_month,
    p_reserve_amount,
    0,
    'reserved',
    'deepseek-flash'
  ) RETURNING id INTO v_ledger_id;

  RETURN jsonb_build_object(
    'success', true,
    'ledger_id', v_ledger_id,
    'today_queries', v_user_today_count + 1,
    'max_daily_queries', p_max_daily_queries,
    'current_spent_usd', v_current_month_spent + p_reserve_amount,
    'max_monthly_budget_usd', p_max_monthly_budget
  );
END;
$$;

-- Settlement function after provider call completes
CREATE OR REPLACE FUNCTION public.settle_ai_query(
  p_ledger_id UUID,
  p_user_id UUID,
  p_prompt_tokens INTEGER,
  p_completion_tokens INTEGER,
  p_actual_cost_usd NUMERIC(10, 6),
  p_query_preview TEXT,
  p_status TEXT -- 'completed' or 'failed'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.ai_usage_ledger
  SET
    prompt_tokens = p_prompt_tokens,
    completion_tokens = p_completion_tokens,
    total_tokens = p_prompt_tokens + p_completion_tokens,
    estimated_cost_usd = CASE WHEN p_status = 'completed' THEN p_actual_cost_usd ELSE 0 END,
    reserved_cost_usd = 0,
    status = p_status,
    query_preview = p_query_preview,
    updated_at = now()
  WHERE id = p_ledger_id AND user_id = p_user_id;
END;
$$;
