/**
 * Zella ICT — Suite E2E de Persistencia Real y Validación RLS
 * Ejecuta operaciones reales de CRUD y aislamiento de usuario contra Supabase Auth y PostgreSQL.
 *
 * Uso:
 *   node scripts/e2e-supabase-qa.mjs [email] [password] [email_user2] [password_user2]
 *
 * Si no se pasan argumentos, intentará usar variables de entorno o crear un usuario de QA temporal.
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

// Cargar variables de entorno desde .env.local
const envPath = path.resolve(process.cwd(), '.env.local');
const env = {};
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx !== -1) {
      env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
    }
  }
}

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('[CONFIG_ERROR] Falta NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY en .env.local');
  process.exit(1);
}

const args = process.argv.slice(2);
const qaEmail1 = args[0] || process.env.QA_USER_EMAIL;
const qaPassword1 = args[1] || process.env.QA_USER_PASSWORD;
const qaEmail2 = args[2] || process.env.QA_USER_2_EMAIL;
const qaPassword2 = args[3] || process.env.QA_USER_2_PASSWORD;

async function runE2E() {
  console.log('================================================================');
  console.log(' ZELLA ICT — VALIDACIÓN E2E DE PERSISTENCIA Y SEGURIDAD RLS     ');
  console.log('================================================================');
  console.log(`URL de Supabase: ${supabaseUrl}`);
  console.log(`Clave pública configurada: ${supabaseKey.slice(0, 16)}... (Publishable Anon Key)`);

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  });

  if (!qaEmail1 || !qaPassword1) {
    console.log('\n[MODO DIAGNÓSTICO]: No se proporcionaron credenciales confirmadas.');
    const tempEmail = `qa.zella.probe.${Date.now()}@gmail.com`;
    const tempPass = `QaZellaSecure#${Date.now()}!2026`;
    console.log(`Intentando registrar usuario de prueba: ${tempEmail}`);

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: tempEmail,
      password: tempPass,
      options: { data: { display_name: 'QA Probe User' } },
    });

    if (signUpError) {
      console.log(`[SIGNUP_RESPONSE] Error GoTrue: ${signUpError.message} (Status: ${signUpError.status})`);
      return;
    }

    console.log(`[SIGNUP_RESPONSE] Usuario creado en auth.users con ID: ${signUpData.user?.id}`);
    console.log(`[SIGNUP_RESPONSE] confirmed_at: ${signUpData.user?.confirmed_at ?? 'null (Pendiente de confirmación)'}`);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: tempEmail,
      password: tempPass,
    });

    if (signInError && signInError.code === 'email_not_confirmed') {
      console.log('\n----------------------------------------------------------------');
      console.log(' RESULTADO: BLOCKED POR CONFIRMACIÓN DE EMAIL                   ');
      console.log('----------------------------------------------------------------');
      console.log('El proyecto Supabase requiere obligatoriamente confirmación por correo.');
      console.log('Supabase no emite token JWT de sesión a usuarios nuevos sin confirmar.');
      console.log('\nINSTRUCCIONES PARA COMPLETAR LA PRUEBA REAL:');
      console.log('1. Ingresa a Supabase Dashboard -> Authentication -> Users.');
      console.log(`2. Localiza al usuario "${tempEmail}" (o el usuario de QA de tu preferencia).`);
      console.log('3. Haz clic en "Confirm email" para verificarlo manualmente.');
      console.log('4. Ejecuta:');
      console.log(`   node scripts/e2e-supabase-qa.mjs "${tempEmail}" "${tempPass}"`);
      console.log('----------------------------------------------------------------\n');
      return;
    }
  }

  // Si tenemos credenciales confirmadas, ejecutar el flujo E2E completo
  console.log(`\nIniciando sesión con cuenta de QA: ${qaEmail1}...`);
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: qaEmail1,
    password: qaPassword1,
  });

  if (authError) {
    console.error(`[AUTH_ERROR] No se pudo iniciar sesión con ${qaEmail1}:`, authError.message);
    return;
  }

  const user = authData.user;
  console.log(`[AUTH_SUCCESS] Sesión iniciada. User UUID: ${user.id}`);

  const testAccountId = `acc-qa-${Date.now()}`;
  const testTradeId = `tr-qa-${Date.now()}`;

  try {
    // 1. Crear cuenta operativa ficticia
    console.log(`\n1. Insertando cuenta operativa en Supabase: ${testAccountId}...`);
    const { data: accData, error: accError } = await supabase.from('trading_accounts').insert({
      id: testAccountId,
      user_id: user.id,
      name: 'QA E2E Account 100K',
      firm: 'QA Testing Firm',
      initial_balance: 100000,
    }).select();

    if (accError) throw new Error(`Fallo al insertar cuenta: ${accError.message}`);
    console.log('   [PASS] Cuenta creada y confirmada en Supabase:', accData[0]?.id);

    // 2. Registrar trade ficticio con fecha y hora NY
    console.log(`\n2. Insertando trade ficticio en Supabase: ${testTradeId}...`);
    const { data: trData, error: trError } = await supabase.from('trades').insert({
      id: testTradeId,
      user_id: user.id,
      account_id: testAccountId,
      symbol: 'NQ1!',
      direction: 'Long',
      entry_date: '2026-09-18 09:35:00', // Formato civil NY sin offset
      entry_price: 19500,
      exit_price: 19550,
      stop_loss: 19450,
      take_profit: 19600,
      size: 1,
      gross_pnl: 1000,
      commission: 4,
      net_pnl: 996,
      planned_rr: 1.5,
      r_multiple: 1.0,
      status: 'Win',
      killzone: 'NY Open 09:30 AM (09:30-10:30)',
      timeframe: '5m',
      setup_grade: 'A+',
      daily_bias: 'Bullish',
      followed_plan: true,
      psychology_tag: 'A+ Alineado al Contexto HTF',
    }).select();

    if (trError) throw new Error(`Fallo al insertar trade: ${trError.message}`);
    console.log('   [PASS] Trade persistido en Supabase:', trData[0]?.id, '| Net P&L:', trData[0]?.net_pnl);

    // 3. Cerrar sesión y simular cliente nuevo (sesión limpia)
    console.log('\n3. Cerrando sesión en Supabase...');
    await supabase.auth.signOut();
    console.log('   [PASS] Sesión cerrada.');

    console.log('\n4. Creando cliente independiente (simulando nueva sesión sin localStorage)...');
    const freshClient = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

    console.log(`   Re-autenticando con ${qaEmail1}...`);
    const { error: freshAuthError } = await freshClient.auth.signInWithPassword({
      email: qaEmail1,
      password: qaPassword1,
    });
    if (freshAuthError) throw new Error(`Fallo re-autenticación: ${freshAuthError.message}`);

    // 5. Verificar que el trade reaparece en la consulta remota limpia
    console.log(`\n5. Consultando trade ${testTradeId} desde sesión limpia en Supabase...`);
    const { data: reloadedTrades, error: reloadError } = await freshClient.from('trades').select('*').eq('id', testTradeId);
    if (reloadError) throw new Error(`Fallo al consultar trade remoto: ${reloadError.message}`);
    if (!reloadedTrades || reloadedTrades.length === 0) throw new Error('El trade no se encontró en Supabase');
    console.log('   [PASS] Trade recuperado con éxito desde la base de datos remota:', reloadedTrades[0].id);
    console.log('          Fecha y hora NY persistida:', reloadedTrades[0].entry_date);

    // 6. Editar trade y comprobar persistencia
    console.log(`\n6. Modificando resultado del trade ${testTradeId}...`);
    const { data: updatedTrades, error: updateError } = await freshClient.from('trades').update({
      net_pnl: 1500,
      notes: 'QA E2E Editado con éxito',
    }).eq('id', testTradeId).select();

    if (updateError) throw new Error(`Fallo al editar trade: ${updateError.message}`);
    console.log('   [PASS] Trade modificado en Supabase. Nuevo Net P&L:', updatedTrades[0]?.net_pnl);

    // 7. Prueba de Aislamiento RLS con Segundo Usuario (si está configurado)
    if (qaEmail2 && qaPassword2) {
      console.log(`\n7. Probando aislamiento RLS con segundo usuario: ${qaEmail2}...`);
      const user2Client = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
      const { error: user2AuthError } = await user2Client.auth.signInWithPassword({
        email: qaEmail2,
        password: qaPassword2,
      });
      if (user2AuthError) {
        console.log('   [WARN] No se pudo autenticar User 2:', user2AuthError.message);
      } else {
        // User 2 intenta consultar el trade de User 1
        const { data: u2ProbeTrades } = await user2Client.from('trades').select('*').eq('id', testTradeId);
        assert.equal(u2ProbeTrades?.length, 0, 'User 2 no debe ver el trade de User 1');
        console.log('   [PASS] RLS SELECT: User 2 consultó el trade de User 1 y recibió 0 filas.');

        // User 2 intenta modificar el trade de User 1
        const { data: u2AttackUpdate } = await user2Client.from('trades').update({ net_pnl: 99999 }).eq('id', testTradeId).select();
        assert.equal(u2AttackUpdate?.length, 0, 'User 2 no debe poder modificar trade de User 1');
        console.log('   [PASS] RLS UPDATE: User 2 intentó modificar trade de User 1 y fue bloqueado por RLS.');
      }
    } else {
      console.log('\n7. [RLS MULTI-USER NOT TESTED IN LIVE DB]: No se especificaron credenciales para User 2.');
    }

    // 8. Eliminar trade de prueba
    console.log(`\n8. Eliminando trade de prueba ${testTradeId}...`);
    const { error: delTrError } = await freshClient.from('trades').delete().eq('id', testTradeId);
    if (delTrError) throw new Error(`Fallo al borrar trade: ${delTrError.message}`);
    console.log('   [PASS] Trade eliminado de Supabase.');

    // 9. Eliminar cuenta de prueba
    console.log(`9. Eliminando cuenta de prueba ${testAccountId}...`);
    const { error: delAccError } = await freshClient.from('trading_accounts').delete().eq('id', testAccountId);
    if (delAccError) throw new Error(`Fallo al borrar cuenta: ${delAccError.message}`);
    console.log('   [PASS] Cuenta eliminada de Supabase.');

    console.log('\n================================================================');
    console.log(' E2E SUPABASE PERSISTENCE & CLEANUP: PASS AL 100%               ');
    console.log('================================================================');

  } catch (err) {
    console.error('\n[E2E_FAILURE] Error en el flujo:', err.message);
  }
}

runE2E();
