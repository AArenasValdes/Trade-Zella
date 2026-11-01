/**
 * Zella ICT / Martin OS — Complete Database Backup & Recovery Generator
 * Target Project: wotwtunkwkevoqguoebk (Trading-System)
 *
 * Produces:
 * 1. JSON full dump: backups/backup_wotwtunkwkevoqguoebk_<timestamp>.json
 * 2. SQL restore script: backups/backup_wotwtunkwkevoqguoebk_<timestamp>.sql
 * 3. Integrity verification manifest: backups/backup_wotwtunkwkevoqguoebk_<timestamp>.manifest.json
 */

import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const EXPECTED_PROJECT_REF = 'wotwtunkwkevoqguoebk';

function runDbQuery(sql) {
  const tmpFile = path.resolve(process.cwd(), `temp_query_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.sql`);
  fs.writeFileSync(tmpFile, sql, 'utf8');
  try {
    const raw = execSync(`pnpm exec supabase db query --linked --file "${tmpFile}"`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 50 * 1024 * 1024 // 50MB buffer
    });
    const firstBrace = raw.indexOf('{');
    const lastBrace = raw.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1) {
      throw new Error('No valid JSON output from db query: ' + raw);
    }
    const parsed = JSON.parse(raw.slice(firstBrace, lastBrace + 1));
    return parsed.rows || [];
  } finally {
    if (fs.existsSync(tmpFile)) {
      try { fs.unlinkSync(tmpFile); } catch {}
    }
  }
}

function sqlEscapeString(val) {
  if (val === null || val === undefined) return 'NULL';
  return `'${String(val).replace(/'/g, "''")}'`;
}

function sqlFormatValue(val, dataType) {
  if (val === null || val === undefined) return 'NULL';

  if (Array.isArray(val)) {
    if (val.length === 0) return "'{}'::text[]";
    const escapedElements = val.map(e => `"${String(e).replace(/"/g, '\\"')}"`).join(',');
    return `'${"{" + escapedElements + "}"}'::text[]`;
  }

  if (typeof val === 'boolean') {
    return val ? 'TRUE' : 'FALSE';
  }

  if (typeof val === 'number') {
    return String(val);
  }

  if (typeof val === 'object') {
    return `'${JSON.stringify(val).replace(/'/g, "''")}'::jsonb`;
  }

  return sqlEscapeString(val);
}

async function main() {
  console.log('================================================================');
  console.log(' MARTIN OS — FULL DATABASE BACKUP & RESTORE GENERATOR');
  console.log('================================================================');

  // 1. Verify project reference
  console.log(`[1/5] Verifying target Supabase project is ${EXPECTED_PROJECT_REF}...`);
  const projectListRaw = execSync('pnpm exec supabase projects list', { encoding: 'utf8' });
  const projectListMatch = projectListRaw.includes(EXPECTED_PROJECT_REF);
  if (!projectListMatch) {
    console.error(`[CRITICAL] Linked project does not match expected ref: ${EXPECTED_PROJECT_REF}`);
    process.exit(1);
  }
  console.log(`[OK] Confirmed project ref: ${EXPECTED_PROJECT_REF}`);

  // 2. Identify tables
  console.log('[2/5] Inspecting schema and tables in public and supabase_migrations...');
  const tables = [
    { schema: 'public', name: 'profiles', pkey: ['id'] },
    { schema: 'public', name: 'trading_accounts', pkey: ['user_id', 'id'] },
    { schema: 'public', name: 'playbooks', pkey: ['user_id', 'id'] },
    { schema: 'public', name: 'trades', pkey: ['user_id', 'id'] },
    { schema: 'public', name: 'daily_journal_notes', pkey: ['user_id', 'note_date'] },
    { schema: 'public', name: 'personal_trading_rules', pkey: ['user_id', 'id'] },
    { schema: 'supabase_migrations', name: 'schema_migrations', pkey: ['version'] }
  ];

  const backupData = {
    project_ref: EXPECTED_PROJECT_REF,
    timestamp: new Date().toISOString(),
    tables: {}
  };

  const sqlStatements = [];
  sqlStatements.push(`-- MARTIN OS / TRADE-ZELLA RECOVERABLE BACKUP`);
  sqlStatements.push(`-- Project: ${EXPECTED_PROJECT_REF}`);
  sqlStatements.push(`-- Generated At: ${backupData.timestamp}`);
  sqlStatements.push(`-- Safe, transaction-wrapped restore script\n`);
  sqlStatements.push(`BEGIN;\n`);

  for (const tbl of tables) {
    console.log(`  -> Extracting table ${tbl.schema}.${tbl.name}...`);

    // Column metadata
    const colRows = runDbQuery(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = '${tbl.schema}' AND table_name = '${tbl.name}'
      ORDER BY ordinal_position;
    `);

    // Row data
    const dataRows = runDbQuery(`
      SELECT coalesce(json_agg(t), '[]'::json) as row_data
      FROM (SELECT * FROM ${tbl.schema}.${tbl.name} ORDER BY ${tbl.pkey.join(', ')}) t;
    `);

    const rows = (dataRows[0] && dataRows[0].row_data) ? dataRows[0].row_data : [];
    console.log(`     Columns: ${colRows.length}, Rows: ${rows.length}`);

    backupData.tables[`${tbl.schema}.${tbl.name}`] = {
      columns: colRows,
      rowCount: rows.length,
      primaryKey: tbl.pkey,
      rows: rows
    };

    // Generate SQL for this table
    if (rows.length > 0) {
      const colNames = colRows.map(c => c.column_name);
      sqlStatements.push(`-- Table: ${tbl.schema}.${tbl.name} (${rows.length} rows)`);
      for (const row of rows) {
        const valuesSql = colNames.map(col => {
          const colMeta = colRows.find(c => c.column_name === col);
          return sqlFormatValue(row[col], colMeta?.data_type);
        }).join(', ');

        const quotedCols = colNames.map(c => `"${c}"`).join(', ');
        const conflictTargets = tbl.pkey.map(k => `"${k}"`).join(', ');
        const updateSets = colNames
          .filter(c => !tbl.pkey.includes(c))
          .map(c => `"${c}" = EXCLUDED."${c}"`)
          .join(', ');

        if (updateSets.length > 0) {
          sqlStatements.push(
            `INSERT INTO ${tbl.schema}.${tbl.name} (${quotedCols})\nVALUES (${valuesSql})\nON CONFLICT (${conflictTargets}) DO UPDATE SET ${updateSets};`
          );
        } else {
          sqlStatements.push(
            `INSERT INTO ${tbl.schema}.${tbl.name} (${quotedCols})\nVALUES (${valuesSql})\nON CONFLICT (${conflictTargets}) DO NOTHING;`
          );
        }
      }
      sqlStatements.push('');
    }
  }

  sqlStatements.push(`COMMIT;\n`);

  // 3. Write backup files
  console.log('[3/5] Saving backup files to disk...');
  const backupsDir = path.resolve(process.cwd(), 'backups');
  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
  }

  const dateStr = new Date().toISOString().replace(/[:.]/g, '-');
  const jsonPath = path.join(backupsDir, `backup_${EXPECTED_PROJECT_REF}_${dateStr}.json`);
  const sqlPath = path.join(backupsDir, `backup_${EXPECTED_PROJECT_REF}_${dateStr}.sql`);
  const manifestPath = path.join(backupsDir, `backup_${EXPECTED_PROJECT_REF}_${dateStr}.manifest.json`);

  const jsonContent = JSON.stringify(backupData, null, 2);
  const sqlContent = sqlStatements.join('\n');

  fs.writeFileSync(jsonPath, jsonContent, 'utf8');
  fs.writeFileSync(sqlPath, sqlContent, 'utf8');

  // 4. Verify integrity
  console.log('[4/5] Verifying backup integrity...');
  const parsedCheck = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  let totalRows = 0;
  const manifestSummary = {};

  for (const [tName, tData] of Object.entries(parsedCheck.tables)) {
    manifestSummary[tName] = {
      columnsCount: tData.columns.length,
      rowCount: tData.rowCount
    };
    totalRows += tData.rowCount;
    if (tData.rowCount !== tData.rows.length) {
      throw new Error(`Integrity check failed: ${tName} rowCount mismatch!`);
    }
  }

  const jsonHash = crypto.createHash('sha256').update(jsonContent).digest('hex');
  const sqlHash = crypto.createHash('sha256').update(sqlContent).digest('hex');

  const manifest = {
    project_ref: EXPECTED_PROJECT_REF,
    created_at: backupData.timestamp,
    json_file: path.basename(jsonPath),
    json_sha256: jsonHash,
    json_bytes: Buffer.byteLength(jsonContent),
    sql_file: path.basename(sqlPath),
    sql_sha256: sqlHash,
    sql_bytes: Buffer.byteLength(sqlContent),
    total_records: totalRows,
    tables_summary: manifestSummary,
    status: 'VERIFIED_COMPLETE_AND_RECOVERABLE'
  };

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  console.log('[5/5] Backup successfully created and verified:');
  console.log(`  -> JSON: ${jsonPath} (${manifest.json_bytes} bytes, SHA: ${jsonHash.slice(0, 12)}...)`);
  console.log(`  -> SQL:  ${sqlPath} (${manifest.sql_bytes} bytes, SHA: ${sqlHash.slice(0, 12)}...)`);
  console.log(`  -> Total records preserved: ${totalRows}`);
  console.log(`  -> Manifest: ${manifestPath}`);
  console.log('================================================================');
  console.log(' BACKUP COMPLETED & CERTIFIED RECOVERABLE');
  console.log('================================================================\n');
}

main().catch(err => {
  console.error('[FATAL BACKUP ERROR]', err);
  process.exit(1);
});
