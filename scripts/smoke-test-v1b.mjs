/**
 * Zella ICT / Martin OS — Smoke Test Suite V1b
 * Validates: Acceso, Registro V1b, Edición, Calendario, Estadísticas y Persistencia tras recargar.
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  calculateConsolidatedReturnPct,
  calculatePercentageEquityCurve,
  resolveTradeReturnPct
} from '../src/services/financial-engine.ts';
import { calculateDashboardMetrics } from '../src/services/math-engine.ts';
import { mapTrade, tradeToRow } from '../src/services/cloud-sync-service.ts';

const EXPECTED_PROJECT_REF = 'wotwtunkwkevoqguoebk';

function runDbQuery(sql) {
  const tmpFile = path.resolve(process.cwd(), `smoke_query_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.sql`);
  fs.writeFileSync(tmpFile, sql, 'utf8');
  try {
    const raw = execSync(`pnpm exec supabase db query --linked --file "${tmpFile}"`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
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

async function smokeTest() {
  console.log('================================================================');
  console.log(' MARTIN OS V1b — SMOKE TEST DE INTEGRACIÓN REAL Y DESPLIEGUE');
  console.log('================================================================\n');

  // STEP 1: Acceso a la base de datos remota
  console.log('[1/6] Verificando ACCESO a Supabase wotwtunkwkevoqguoebk...');
  const accessCheck = runDbQuery('SELECT current_database(), current_user, count(*) as trade_count FROM public.trades;');
  console.log(`  -> Base de datos: ${accessCheck[0].current_database}, Usuario: ${accessCheck[0].current_user}, Operaciones existentes: ${accessCheck[0].trade_count}`);
  if (Number(accessCheck[0].trade_count) !== 6) {
    throw new Error(`Se esperaban 6 operaciones históricas, se encontraron ${accessCheck[0].trade_count}`);
  }
  console.log('  -> Acceso: OK (6 operaciones históricas verificadas)');

  // Obtener un user_id y account_id real para la prueba
  const userCheck = runDbQuery('SELECT user_id, id FROM public.trading_accounts LIMIT 1;');
  const probeUserId = userCheck[0].user_id;
  const probeAccountId = userCheck[0].id;
  const probeTradeId = `smoke-v1b-${Date.now()}`;

  try {
    // STEP 2: Registro de nueva operación simplificada V1b
    console.log('\n[2/6] Verificando REGISTRO V1b (modo unrecorded, R, %, duración)...');
    const v1bTradeDomain = {
      id: probeTradeId,
      accountId: probeAccountId,
      symbol: 'NAS100',
      direction: 'Long',
      entryDate: '2026-11-01T09:35:00',
      entryPrice: 0,
      exitPrice: 0,
      stopLoss: 0,
      takeProfit: 0,
      size: 1,
      riskPercentUsed: 1,
      htfAligned: ['1D', '4H'],
      grossPnl: 0,
      commission: 0,
      netPnl: 0,
      plannedRr: 2,
      rMultiple: 2,
      status: 'Win',
      killzone: 'NY Open 09:30 AM (09:30-10:30)',
      pdArrays: ['Key Level'],
      checklistCompleted: [],
      setupGrade: 'A+',
      dailyBias: 'Bullish',
      dolTarget: 'High Diario',
      timeframe: '5m',
      followedPlan: true,
      psychologyTag: 'A+ Alineado al Contexto HTF',
      notes: 'Smoke test probe V1b',
      timePrecision: 'exact',
      calculationMode: 'unrecorded',
      realizedNetReturnPct: 2.5,
      durationMinutes: 35,
      rUnrecorded: false,
      planUnrecorded: false,
      hasDataConflict: false,
      conflictReasons: [],
      pnlProvenance: 'unrecorded'
    };

    const rowToInsert = tradeToRow(v1bTradeDomain, null);
    runDbQuery(`
      INSERT INTO public.trades (
        user_id, id, account_id, symbol, direction, entry_date,
        entry_price, exit_price, stop_loss, take_profit, size,
        gross_pnl, commission, net_pnl, planned_rr, r_multiple,
        status, killzone, pd_arrays, checklist_completed, setup_grade,
        daily_bias, dol_target, timeframe, followed_plan, psychology_tag,
        notes, time_precision, calculation_mode, realized_net_return_pct,
        duration_minutes, r_unrecorded, plan_unrecorded, has_data_conflict,
        conflict_reasons, pnl_provenance
      ) VALUES (
        '${probeUserId}', '${rowToInsert.id}', '${rowToInsert.account_id}', '${rowToInsert.symbol}', '${rowToInsert.direction}', '${rowToInsert.entry_date}',
        0, 0, 0, 0, 1,
        0, 0, 0, 2, 2,
        'Win', '${rowToInsert.killzone}', ARRAY['Key Level']::text[], ARRAY[]::text[], 'A+',
        'Bullish', 'High Diario', '5m', true, 'A+ Alineado al Contexto HTF',
        'Smoke test probe V1b', 'exact', 'unrecorded', 2.5,
        35, false, false, false,
        ARRAY[]::text[], 'unrecorded'
      );
    `);
    console.log(`  -> Operación V1b insertada con id: ${probeTradeId}`);
    console.log('  -> Registro: OK');

    // STEP 3: Edición (preservación de métricas y actualización de notas)
    console.log('\n[3/6] Verificando EDICIÓN de la operación...');
    runDbQuery(`
      UPDATE public.trades
      SET notes = 'Smoke test probe V1b - NOTA EDITADA',
          psychology_tag = 'Sin clasificar'
      WHERE id = '${probeTradeId}';
    `);
    const editedRow = runDbQuery(`SELECT * FROM public.trades WHERE id = '${probeTradeId}';`)[0];
    if (editedRow.notes !== 'Smoke test probe V1b - NOTA EDITADA' || editedRow.psychology_tag !== 'Sin clasificar') {
      throw new Error('La edición de notas/psicología no se aplicó correctamente.');
    }
    if (Number(editedRow.r_multiple) !== 2 || Number(editedRow.realized_net_return_pct) !== 2.5 || editedRow.calculation_mode !== 'unrecorded') {
      throw new Error('La edición modificó indebidamente los valores financieros.');
    }
    console.log('  -> Edición preservó R (2.0), % (2.5%), modo (unrecorded) y actualizó notas: OK');

    // STEP 4: Calendario y agregación temporal
    console.log('\n[4/6] Verificando CALENDARIO...');
    const calRow = runDbQuery(`
      SELECT date_trunc('day', entry_date) as trade_day, count(*) as count, sum(r_multiple) as day_r
      FROM public.trades
      WHERE id = '${probeTradeId}'
      GROUP BY date_trunc('day', entry_date);
    `)[0];
    console.log(`  -> Agregado de día calendario: Día: ${calRow.trade_day}, Total trades: ${calRow.count}, Total R: ${calRow.day_r}`);
    if (Number(calRow.day_r) !== 2) {
      throw new Error('El cálculo del día en calendario no sumó correctamente el R-Multiple.');
    }
    console.log('  -> Calendario: OK');

    // STEP 5: Estadísticas con motor financiero
    console.log('\n[5/6] Verificando ESTADÍSTICAS con el motor financiero...');
    const allTradesRows = runDbQuery(`SELECT * FROM public.trades ORDER BY entry_date ASC;`);
    const mappedTrades = allTradesRows.map(mapTrade);
    console.log(`  -> Total operaciones mapeadas: ${mappedTrades.length} (6 históricas + 1 probe)`);

    const accountsRows = runDbQuery(`SELECT * FROM public.trading_accounts;`);
    const mappedAccounts = accountsRows.map(r => ({
      id: r.id,
      name: r.name,
      firm: r.firm,
      initialBalance: Number(r.initial_balance),
      profitTarget: Number(r.profit_target),
      maxDrawdown: Number(r.max_drawdown),
      dailyLossLimit: Number(r.daily_loss_limit),
      isTechnical: Boolean(r.is_technical),
      hasVerifiedBalance: Boolean(r.has_verified_balance)
    }));

    const dashboardMetrics = calculateDashboardMetrics(mappedTrades, mappedAccounts);
    const equityCurve = calculatePercentageEquityCurve(mappedTrades, mappedAccounts, undefined, 'r');

    console.log(`  -> Expectativa: ${dashboardMetrics.expectancyR.toFixed(2)}R`);
    console.log(`  -> R acumulado: ${dashboardMetrics.totalRMultiple.toFixed(2)}R`);
    console.log(`  -> Win Rate: ${dashboardMetrics.winRate.toFixed(1)}%`);
    console.log(`  -> Puntos curva: ${equityCurve.points.length}`);
    if (equityCurve.points.length === 0) {
      throw new Error('La curva de equidad no generó puntos.');
    }
    console.log('  -> Estadísticas: OK');

    // STEP 6: Persistencia tras recargar (round-trip sin caché)
    console.log('\n[6/6] Verificando PERSISTENCIA TRAS RECARGAR...');
    const freshFetch = runDbQuery(`SELECT * FROM public.trades WHERE id = '${probeTradeId}';`)[0];
    const freshMapped = mapTrade(freshFetch);
    if (
      freshMapped.id !== probeTradeId ||
      freshMapped.durationMinutes !== 35 ||
      freshMapped.realizedNetReturnPct !== 2.5 ||
      freshMapped.calculationMode !== 'unrecorded' ||
      freshMapped.rMultiple !== 2 ||
      freshMapped.notes !== 'Smoke test probe V1b - NOTA EDITADA'
    ) {
      throw new Error('Fallo en la persistencia o deserialización tras recargar.');
    }
    console.log('  -> Persistencia round-trip validada: OK');
  } finally {
    // CLEANUP: Eliminar la operación probe y certificar estado intacto
    console.log('\n[CLEANUP] Eliminando operación probe...');
    runDbQuery(`DELETE FROM public.trades WHERE id = '${probeTradeId}';`);
    const finalCheck = runDbQuery('SELECT count(*) as count FROM public.trades;')[0];
    console.log(`  -> Operaciones en base de datos tras cleanup: ${finalCheck.count}`);
    if (Number(finalCheck.count) !== 6) {
      throw new Error(`Cleanup falló: se esperaban 6 operaciones, hay ${finalCheck.count}`);
    }
    console.log('  -> Base de datos limpia y en su estado histórico original.');
  }

  console.log('\n================================================================');
  console.log(' SMOKE TEST V1b EXITOSO — TODOS LOS CRITERIOS VALIDADOS');
  console.log('================================================================\n');
}

smokeTest().catch(err => {
  console.error('[SMOKE TEST FAILED]', err);
  process.exit(1);
});
