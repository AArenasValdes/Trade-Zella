"use client";

import React, { useMemo, useRef, useState } from 'react';
import { AlertTriangle, FileUp, X } from 'lucide-react';
import { useTrading } from '@/context/TradingContext';
import {
  buildCsvImportPreview,
  detectCsvFormat,
  getCsvImportFieldLabels,
  getCsvImportFields,
  suggestCsvColumnMappings,
  type CsvImportEnvironment,
  type CsvImportField,
  type CsvImportPreview,
} from '@/services/csv-import-service';

interface CsvImportModalProps {
  onClose: () => void;
}

type PreviewState = { preview: CsvImportPreview; error: null } | { preview: null; error: string };

const ENVIRONMENT_LABELS: Record<CsvImportEnvironment, string> = {
  backtest: 'Backtesting',
  real: 'Real',
  demo: 'Demo',
};

const FALLBACK_ACCOUNT_ID = 'acc-tech-unrecorded';

export function CsvImportModal({ onClose }: CsvImportModalProps) {
  const { trades, accounts, defaultAccountId, theme, importPreparedCsvTrades } = useTrading();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [csvText, setCsvText] = useState('');
  const [fileName, setFileName] = useState('');
  const [environment, setEnvironment] = useState<CsvImportEnvironment | ''>('');
  const [mappings, setMappings] = useState<Record<string, CsvImportField | ''>>({});
  const [reviewedRows, setReviewedRows] = useState<number[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [fileError, setFileError] = useState('');
  const [savedCount, setSavedCount] = useState<number | null>(null);

  const detection = useMemo(() => {
    if (!csvText) return null;
    try {
      return detectCsvFormat(csvText);
    } catch {
      return null;
    }
  }, [csvText]);

  const accountId = selectedAccountId || defaultAccountId || accounts[0]?.id || FALLBACK_ACCOUNT_ID;
  const previewState = useMemo<PreviewState | null>(() => {
    if (!csvText || !environment) return null;
    try {
      return {
        preview: buildCsvImportPreview({
          csvText,
          environment,
          accountId,
          mappings,
          existingTrades: trades,
          reviewedConflictRows: reviewedRows,
        }),
        error: null,
      };
    } catch (error) {
      return {
        preview: null,
        error: error instanceof Error ? error.message : 'No se pudo leer el CSV.',
      };
    }
  }, [accountId, csvText, environment, mappings, reviewedRows, trades]);

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setFileError('');
    setCsvText('');
    setFileName(file.name);
    setMappings({});
    setReviewedRows([]);
    try {
      const text = await file.text();
      if (!text.trim()) {
        setFileError('El archivo está vacío.');
        return;
      }
      const format = detectCsvFormat(text);
      setCsvText(text);
      setMappings(suggestCsvColumnMappings(format.headers));
    } catch (error) {
      setFileError(error instanceof Error ? error.message : 'No se pudo leer el CSV.');
    }
  };

  const preview = previewState?.preview ?? null;
  const labels = getCsvImportFieldLabels();

  const handleSave = () => {
    if (!preview?.canImport || savedCount !== null) return;
    setSavedCount(importPreparedCsvTrades(preview.tradesToImport));
  };

  const toggleReviewedRow = (rowNumber: number) => {
    setReviewedRows((previous) => previous.includes(rowNumber)
      ? previous.filter((value) => value !== rowNumber)
      : [...previous, rowNumber]);
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-3 sm:p-6" role="presentation">
      <section
        aria-labelledby="csv-import-title"
        aria-modal="true"
        className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#111114] shadow-2xl"
        role="dialog"
      >
        <header className="flex items-start justify-between gap-4 border-b border-white/[0.08] p-5">
          <div>
            <h2 id="csv-import-title" className="text-lg font-bold text-zinc-100">Importar historial CSV</h2>
            <p className="mt-1 text-xs text-zinc-400">Revisa el entorno, las columnas y cada fila antes de guardar.</p>
          </div>
          <button aria-label="Cerrar importador CSV" onClick={onClose} className="rounded-lg p-2 text-zinc-400 hover:bg-white/[0.06] hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-5 overflow-y-auto p-5">
          {savedCount !== null ? (
            <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-5 text-sm text-emerald-200">
              Se guardaron {savedCount} operaciones. Las existentes se conservaron.
            </div>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2 text-xs font-semibold text-zinc-300">
                  Entorno de estas operaciones <span className="text-rose-300">(obligatorio)</span>
                  <select
                    value={environment}
                    onChange={(event) => setEnvironment(event.target.value as CsvImportEnvironment | '')}
                    className="w-full rounded-lg border border-white/10 bg-[#09090B] px-3 py-2.5 text-sm text-zinc-100"
                  >
                    <option value="">Selecciona el entorno</option>
                    <option value="backtest">Backtesting</option>
                    <option value="real">Real</option>
                    <option value="demo">Demo</option>
                  </select>
                </label>
                <label className="space-y-2 text-xs font-semibold text-zinc-300">
                  Cuenta asociada
                  <select
                    value={accountId}
                    onChange={(event) => setSelectedAccountId(event.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-[#09090B] px-3 py-2.5 text-sm text-zinc-100"
                  >
                    {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                    {accounts.length === 0 && <option value={FALLBACK_ACCOUNT_ID}>Cuenta técnica sin capital de referencia</option>}
                  </select>
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.08] bg-black/20 p-4">
                <input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={(event) => void handleFile(event)} className="hidden" />
                <button onClick={() => fileInputRef.current?.click()} className={`inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-zinc-100 hover:bg-white/[0.06] ${theme.accentTextClass}`}>
                  <FileUp className="h-4 w-4" /> Elegir archivo CSV
                </button>
                <span className="text-xs text-zinc-400">{fileName || 'Sin archivo seleccionado'}</span>
                {detection && <span className="rounded-md bg-white/[0.05] px-2 py-1 text-[11px] text-zinc-300">Formato detectado: {detection.format === 'notion' ? 'Notion' : detection.format === 'tradingview' ? 'TradingView' : 'genérico'} · {detection.rowCount} filas · delimitador {detection.delimiter === '\t' ? 'tabulación' : detection.delimiter}</span>}
              </div>

              {fileError && <p role="alert" className="text-xs text-rose-300">{fileError}</p>}
              {!environment && csvText && <p className="text-xs text-amber-200">Selecciona el entorno antes de revisar la vista previa. El CSV no determina el entorno automáticamente.</p>}

              {detection && (
                <div className="space-y-2">
                  <div>
                    <h3 className="text-sm font-bold text-zinc-100">Columnas y muestra</h3>
                    <p className="mt-1 text-xs text-zinc-500">Asigna manualmente cualquier columna no reconocida. Las columnas sin mapear se conservan en las notas de cada operación.</p>
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-white/[0.08]">
                    <table className="w-full min-w-[680px] text-left text-xs">
                      <thead className="bg-black/30 text-zinc-400"><tr><th className="px-3 py-2">Columna CSV</th><th className="px-3 py-2">Muestra</th><th className="px-3 py-2">Campo Martin OS</th></tr></thead>
                      <tbody>
                        {detection.headers.map((header) => (
                          <tr key={header} className="border-t border-white/[0.06]">
                            <td className="max-w-56 truncate px-3 py-2 font-medium text-zinc-200" title={header}>{header}</td>
                            <td className="max-w-64 truncate px-3 py-2 text-zinc-400" title={detection.samples[header]}>{detection.samples[header] || '—'}</td>
                            <td className="px-3 py-2">
                              <select
                                aria-label={`Mapear columna ${header}`}
                                value={mappings[header] ?? ''}
                                onChange={(event) => setMappings((previous) => ({ ...previous, [header]: event.target.value as CsvImportField | '' }))}
                                className="w-full rounded-md border border-white/10 bg-[#09090B] px-2 py-1.5 text-zinc-100"
                              >
                                <option value="">Sin mapear</option>
                                {getCsvImportFields().map((field) => <option key={field} value={field}>{labels[field]}</option>)}
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {previewState?.error && <p role="alert" className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-200">No se pudo generar la vista previa: {previewState.error}</p>}

              {preview && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Count label="Válidos" value={preview.validCount} tone="text-emerald-300" />
                    <Count label="Rechazados" value={preview.rejectedCount} tone="text-rose-300" />
                    <Count label="Duplicados" value={preview.duplicateCount} tone="text-zinc-300" />
                    <Count label="Conflictos" value={preview.conflictCount} tone="text-amber-200" />
                  </div>

                  {preview.warnings.length > 0 && (
                    <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-3">
                      <div className="mb-2 flex items-center gap-2 text-xs font-bold text-amber-200"><AlertTriangle className="h-4 w-4" /> Advertencias ({preview.warningCount})</div>
                      <ul className="max-h-28 list-inside list-disc space-y-1 overflow-auto text-[11px] text-amber-100/80">
                        {Array.from(new Set(preview.warnings)).slice(0, 30).map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}
                      </ul>
                    </div>
                  )}

                  <div className="max-h-64 space-y-2 overflow-y-auto">
                    {preview.rows.map((row) => (
                      <div key={row.rowNumber} className="rounded-lg border border-white/[0.07] bg-black/20 p-3 text-xs">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold text-zinc-200">Fila {row.rowNumber} · {row.status === 'ready' ? 'Lista' : row.status === 'duplicate' ? 'Duplicada' : row.status === 'conflict' ? 'Conflicto de entorno' : 'Rechazada'}</span>
                          {row.status === 'conflict' && (
                            <label className="flex items-center gap-2 text-amber-200">
                              <input type="checkbox" checked={row.reviewed} onChange={() => toggleReviewedRow(row.rowNumber)} />
                              Revisé: importar como {environment ? ENVIRONMENT_LABELS[environment] : 'entorno seleccionado'}
                            </label>
                          )}
                        </div>
                        <p className="mt-1 text-zinc-400">{row.messages.join(' ') || '—'}</p>
                      </div>
                    ))}
                    {preview.rows.length === 0 && <p className="text-xs text-zinc-500">El CSV no contiene filas de datos.</p>}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.08] p-4">
          <p className="text-[11px] text-zinc-500">Los resultados y horarios se guardan solo cuando están presentes y son válidos.</p>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-zinc-300 hover:bg-white/[0.05]">{savedCount === null ? 'Cancelar' : 'Cerrar'}</button>
            {savedCount === null && <button onClick={handleSave} disabled={!preview?.canImport} className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">Guardar {preview?.validCount ?? 0} operaciones</button>}
          </div>
        </footer>
      </section>
    </div>
  );
}

function Count({ label, value, tone }: { label: string; value: number; tone: string }) {
  return <div className="rounded-lg border border-white/[0.07] bg-black/20 p-3"><div className={`text-lg font-extrabold tabular-nums ${tone}`}>{value}</div><div className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</div></div>;
}
