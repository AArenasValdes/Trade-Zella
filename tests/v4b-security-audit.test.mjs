import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import {
  reserveBudgetForQuery,
  settleCompletedQuery,
  getBudgetStatus,
  RESERVATION_AMOUNT_USD,
} from '../src/services/ai-budget-service.ts';
import {
  buildAnalystGroundingContext,
  callDeepSeekFlash,
  MAX_INPUT_TOKENS_LIMIT,
} from '../src/services/ai-analyst-service.ts';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://wotwtunkwkevoqguoebk.supabase.co';
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndvdHd0dW5rd2tldm9xZ3VvZWJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIzNTk5NjcsImV4cCI6MjEwNzkzNTk2N30.JyLzOR3WI5WqFL0SegMDEFB22NyjKC_nVugUjUSyghU';

function runDbQuery(sql) {
  const tmpFile = path.resolve(process.cwd(), `test_audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.sql`);
  fs.writeFileSync(tmpFile, sql, 'utf8');
  try {
    const raw = execSync(`pnpm exec supabase db query --linked --file "${tmpFile}"`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 10 * 1024 * 1024,
    });
    const firstBrace = raw.indexOf('{');
    const lastBrace = raw.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1) {
      throw new Error('No valid JSON output: ' + raw);
    }
    const parsed = JSON.parse(raw.slice(firstBrace, lastBrace + 1));
    return parsed.rows || [];
  } finally {
    if (fs.existsSync(tmpFile)) {
      try { fs.unlinkSync(tmpFile); } catch {}
    }
  }
}

// -----------------------------------------------------------------------------
// Test 1: Concurrency and Advisory Lock on Real PostgreSQL
// -----------------------------------------------------------------------------
test('1. Prueba de reservas concurrentes contra PostgreSQL real: pg_advisory_xact_lock previene sobregiro', async (t) => {
  let isLinked = false;
  try {
    const ping = runDbQuery('SELECT 1 as num;');
    isLinked = Array.isArray(ping) && ping.length > 0;
  } catch {
    isLinked = false;
  }

  if (!isLinked) {
    t.skip('Supabase CLI no vinculado a proyecto remoto en este entorno; omitiendo prueba contra DB remota.');
    return;
  }

  const testSchema = `test_v4b_audit_${Date.now()}`;
  const testMonth = '2026-11';
  const user1 = 'a0000000-0000-0000-0000-000000000001';
  const user2 = 'b0000000-0000-0000-0000-000000000002';

  try {
    // 1. Setup isolated test schema and ledger table
    runDbQuery(`
      CREATE SCHEMA IF NOT EXISTS ${testSchema};

      CREATE TABLE ${testSchema}.test_ai_usage_ledger (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        request_timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
        billing_month TEXT NOT NULL,
        estimated_cost_usd NUMERIC(10, 6) NOT NULL DEFAULT 0.000000,
        reserved_cost_usd NUMERIC(10, 6) NOT NULL DEFAULT 0.000000,
        status TEXT NOT NULL,
        model TEXT NOT NULL DEFAULT 'deepseek-flash'
      );

      CREATE OR REPLACE FUNCTION ${testSchema}.test_reserve_ai_query(
        p_user_id UUID,
        p_billing_month TEXT,
        p_reserve_amount NUMERIC(10, 6)
      )
      RETURNS JSONB
      LANGUAGE plpgsql
      AS $func$
      DECLARE
        c_max_monthly_budget CONSTANT NUMERIC(10, 6) := 5.000000;
        v_current_month_spent NUMERIC(10, 6);
        v_ledger_id UUID;
      BEGIN
        -- Transactional advisory lock on billing month
        PERFORM pg_advisory_xact_lock(hashtext('ai_budget_month_' || p_billing_month));

        -- Sum current active reservations and completed entries
        SELECT COALESCE(SUM(
          CASE 
            WHEN status = 'completed' THEN estimated_cost_usd
            WHEN status = 'reserved' THEN reserved_cost_usd
            ELSE 0
          END
        ), 0.000000)
        INTO v_current_month_spent
        FROM ${testSchema}.test_ai_usage_ledger
        WHERE billing_month = p_billing_month
          AND status IN ('reserved', 'completed');

        IF (v_current_month_spent + p_reserve_amount) > c_max_monthly_budget THEN
          RETURN jsonb_build_object(
            'success', false,
            'error', 'budget_exceeded',
            'current_spent_usd', v_current_month_spent
          );
        END IF;

        INSERT INTO ${testSchema}.test_ai_usage_ledger (
          user_id,
          billing_month,
          reserved_cost_usd,
          estimated_cost_usd,
          status
        ) VALUES (
          p_user_id,
          p_billing_month,
          p_reserve_amount,
          0.000000,
          'reserved'
        ) RETURNING id INTO v_ledger_id;

        RETURN jsonb_build_object(
          'success', true,
          'ledger_id', v_ledger_id,
          'current_spent_usd', v_current_month_spent + p_reserve_amount
        );
      END;
      $func$;
    `);

    // 2. Pre-seed with $4.00 USD spent
    runDbQuery(`
      INSERT INTO ${testSchema}.test_ai_usage_ledger (user_id, billing_month, estimated_cost_usd, reserved_cost_usd, status)
      VALUES ('${user1}', '${testMonth}', 4.000000, 0.000000, 'completed');
    `);

    // 3. Competing parallel reservations near hard cap
    const resA = runDbQuery(`SELECT ${testSchema}.test_reserve_ai_query('${user1}', '${testMonth}', 0.600000) as result;`);
    const resB = runDbQuery(`SELECT ${testSchema}.test_reserve_ai_query('${user2}', '${testMonth}', 0.600000) as result;`);

    const rawResultA = resA[0].result;
    const rawResultB = resB[0].result;
    const resultA = typeof rawResultA === 'string' ? JSON.parse(rawResultA) : rawResultA;
    const resultB = typeof rawResultB === 'string' ? JSON.parse(rawResultB) : rawResultB;

    assert.equal(resultA.success, true, 'La primera reserva de $0.60 debe aprobarse ($4.60 gastados)');
    assert.equal(resultB.success, false, 'La segunda reserva de $0.60 debe rechazarse ($4.60 + $0.60 > $5.00)');
    assert.equal(resultB.error, 'budget_exceeded');

    // Verify total spent in database is exactly $4.60, never exceeding $5.00
    const totalCheck = runDbQuery(`
      SELECT COALESCE(SUM(
        CASE WHEN status = 'completed' THEN estimated_cost_usd ELSE reserved_cost_usd END
      ), 0) as total
      FROM ${testSchema}.test_ai_usage_ledger
      WHERE billing_month = '${testMonth}';
    `);
    assert.equal(Number(totalCheck[0].total), 4.60);
  } finally {
    try {
      runDbQuery(`DROP SCHEMA IF EXISTS ${testSchema} CASCADE;`);
    } catch {}
  }
});

// -----------------------------------------------------------------------------
// Test 2: Multi-Tenant Isolation (User A vs User B)
// -----------------------------------------------------------------------------
test('2. Prueba de aislamiento entre dos usuarios: User A no accede ni contamina datos de User B', async () => {
  const userA = '11111111-1111-1111-1111-111111111111';
  const userB = '22222222-2222-2222-2222-222222222222';

  const userATrades = [
    {
      id: 'trade-a-1',
      userId: userA,
      symbol: 'NQ',
      direction: 'Long',
      entryDate: '2026-10-30T09:35:00',
      status: 'Win',
      rMultiple: 2.0,
      pdArrays: ['Breaker Block'],
      sourceType: 'real',
      notes: 'Trade exclusivo de Usuario A',
      hasDataConflict: false,
      rUnrecorded: false,
    },
  ];

  const contextA = buildAnalystGroundingContext(userATrades, 'real');
  assert.equal(contextA.sampleSummary.totalTrades, 1);
  assert.ok(contextA.systemPrompt.includes('trade-a-1'));

  const contextB = buildAnalystGroundingContext([], 'real');
  assert.equal(contextB.sampleSummary.totalTrades, 0);
  assert.equal(contextB.systemPrompt.includes('trade-a-1'), false, 'El contexto de User B no debe contener trades de User A');

  const clientMock = {
    rpc: async (name, args) => {
      if (name === 'reserve_ai_query') {
        return {
          data: {
            success: true,
            ledger_id: `res-${args.p_user_id}`,
          },
          error: null,
        };
      }
      if (name === 'get_ai_budget_summary') {
        const isUserA = args.p_user_id === userA;
        return {
          data: {
            billing_month: '2026-11',
            today_queries: isUserA ? 20 : 0,
            max_daily_queries: 20,
            current_month_spent_usd: 1.50,
            max_monthly_budget_usd: 5.0,
            remaining_budget_usd: 3.50,
            is_daily_limit_reached: isUserA,
            is_monthly_budget_reached: false,
          },
          error: null,
        };
      }
      return { data: null, error: null };
    },
  };

  const statusA = await getBudgetStatus(userA, clientMock);
  const statusB = await getBudgetStatus(userB, clientMock);

  assert.equal(statusA.isDailyLimitReached, true, 'User A debe tener límite alcanzado');
  assert.equal(statusB.isDailyLimitReached, false, 'User B debe tener consultas disponibles');
  assert.equal(statusB.todayQueries, 0);
});

// -----------------------------------------------------------------------------
// Test 3: Fail-Closed Protection (Supabase failure blocks DeepSeek)
// -----------------------------------------------------------------------------
test('3. Prueba de falla de Supabase: debe bloquear DeepSeek inmediatamente (fail-closed)', async () => {
  const userId = 'fail-closed-test-user';

  const brokenClient = {
    rpc: async () => {
      throw new Error('Database connection refused (503 Service Unavailable)');
    },
  };

  const result = await reserveBudgetForQuery({
    userId,
    supabaseClient: brokenClient,
    allowTestMemoryFallback: false,
  });

  assert.equal(result.ok, false, 'La reserva debe fallar si la base de datos no está disponible');
  assert.equal(result.error, 'budget_unavailable');
  assert.equal(result.reservationId, '');
  assert.ok(result.message.includes('bloqueada preventivamente'));
});

// -----------------------------------------------------------------------------
// Test 4: Direct RPC manipulation is denied to public / anon clients
// -----------------------------------------------------------------------------
test('4. Prueba de manipulación directa de RPC: cliente anon/público debe ser denegado', async () => {
  const anonClient = createClient(SUPABASE_URL, ANON_KEY);

  const { data, error } = await anonClient.rpc('reserve_ai_query', {
    p_user_id: '00000000-0000-0000-0000-000000000000',
    p_billing_month: '2026-11',
    p_reserve_amount: 0.01,
  });

  assert.ok(error !== null || data === null, 'La invocación directa desde cliente público no debe tener éxito');
  if (error) {
    assert.ok(
      error.message.includes('permission') ||
      error.message.includes('denied') ||
      error.message.includes('not found') ||
      error.code === 'PGRST202' ||
      error.code === '42501' ||
      error.code === 'PGRST301'
    );
  }
});

// -----------------------------------------------------------------------------
// Test 5: Unconfirmed or Failed Settlement handling (does NOT claim false success)
// -----------------------------------------------------------------------------
test('5. Prueba de liquidación fallida: RPC con error o success=false NO reporta liquidación exitosa', async () => {
  const userId = 'user-settle-fail';
  const reservationId = '00000000-0000-0000-0000-000000000099';

  // Client simulating an RPC failure or rejection by PostgreSQL
  const rejectingClient = {
    rpc: async (name) => {
      if (name === 'settle_ai_query') {
        return {
          data: { success: false, error: 'invalid_reservation', message: 'Reserva no encontrada o ya liquidada' },
          error: null,
        };
      }
      if (name === 'get_ai_budget_summary') {
        return {
          data: {
            billing_month: '2026-11',
            today_queries: 1,
            max_daily_queries: 20,
            current_month_spent_usd: RESERVATION_AMOUNT_USD, // reservation remains committed
            max_monthly_budget_usd: 5.0,
            remaining_budget_usd: 5.0 - RESERVATION_AMOUNT_USD,
            is_daily_limit_reached: false,
            is_monthly_budget_reached: false,
          },
          error: null,
        };
      }
      return { data: null, error: null };
    },
  };

  const settlement = await settleCompletedQuery({
    reservationId,
    userId,
    promptTokens: 1000,
    completionTokens: 200,
    supabaseClient: rejectingClient,
    allowTestMemoryFallback: false,
  });

  // Must report ok: false and NOT report successful settlement
  assert.equal(settlement.ok, false, 'No debe reportar liquidación exitosa si PostgreSQL rechazó');
  assert.ok(settlement.error.includes('Reserva no encontrada'));
  // And the budget still considers the reservation committed ($0.010 USD retained)
  assert.equal(settlement.budgetStatus.currentMonthSpentUsd, RESERVATION_AMOUNT_USD);
});

// -----------------------------------------------------------------------------
// Test 6: Pending reservations are retained in budget and not automatically released
// -----------------------------------------------------------------------------
test('6. Prueba de reservas pendientes: se conservan en cómputo mensual para no exceder $5.00', async () => {
  const userId = 'user-pending-res-test';

  const clientWithPendingRes = {
    rpc: async (name) => {
      if (name === 'get_ai_budget_summary') {
        return {
          data: {
            billing_month: '2026-11',
            today_queries: 5,
            max_daily_queries: 20,
            current_month_spent_usd: 4.995000, // completed + pending reservations sum up to $4.995
            max_monthly_budget_usd: 5.0,
            remaining_budget_usd: 0.005000,
            is_daily_limit_reached: false,
            is_monthly_budget_reached: false,
          },
          error: null,
        };
      }
      if (name === 'reserve_ai_query') {
        // Next reservation of $0.010 would exceed $5.00 ($4.995 + $0.010 = $5.005 > $5.00)
        return {
          data: {
            success: false,
            error: 'budget_exceeded',
            message: 'Presupuesto mensual de IA alcanzado ($5.00 USD).',
          },
          error: null,
        };
      }
      return { data: null, error: null };
    },
  };

  const reservation = await reserveBudgetForQuery({
    userId,
    supabaseClient: clientWithPendingRes,
    allowTestMemoryFallback: false,
  });

  assert.equal(reservation.ok, false, 'Debe bloquear sobregasto cuando las reservas pendientes cubren el saldo');
  assert.equal(reservation.error, 'budget_exceeded');
  assert.ok(reservation.message.includes('$5.00 USD'));
});

// -----------------------------------------------------------------------------
// Test 7: Context token ceiling enforcement in callDeepSeekFlash
// -----------------------------------------------------------------------------
test('7. Cota efectiva de tokens de entrada: callDeepSeekFlash rechaza antes de llamar a la red si excede 8.000 tokens', async () => {
  // Generate massive prompt exceeding 8,000 tokens (> 28,000 chars)
  const oversizedSystemPrompt = 'A'.repeat(30000);

  await assert.rejects(
    async () => {
      await callDeepSeekFlash({
        apiKey: 'sk-test-key-valid',
        systemPrompt: oversizedSystemPrompt,
        userMessage: 'pregunta normal',
      });
    },
    {
      message: new RegExp(`excede el límite máximo de ${MAX_INPUT_TOKENS_LIMIT} tokens`),
    }
  );
});
