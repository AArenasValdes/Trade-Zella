"use client";

import React from 'react';
import { useTrading } from '@/context/TradingContext';
import { MARTIN_QUOTES } from '@/config/ict-constants';
import { X, Flame, ShieldCheck, BookOpen } from 'lucide-react';

interface MindsetModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MindsetModal({ isOpen, onClose }: MindsetModalProps) {
  const { theme } = useTrading();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-[#111114] text-zinc-100 rounded-2xl max-w-3xl w-full p-6 shadow-2xl border border-white/10 max-h-[90vh] overflow-y-auto space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-white/[0.08]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-zinc-900 border border-white/10">
              <Flame className={`w-5 h-5 ${theme.accentTextClass}`} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">
                Mentalidad, Fe & Reglas Operativas — Martín
              </h3>
              <p className="text-xs text-zinc-400">
                Construido con dedicación para acompañar tu camino como trader profesional
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:bg-white/5 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 rounded-2xl bg-zinc-900/80 border border-white/10 space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-300">
            <ShieldCheck className={`w-4 h-4 ${theme.accentTextClass}`} />
            Código de Ejecución en Sesión de Nueva York (09:30 AM)
          </div>
          <p className="text-xs text-zinc-300 leading-relaxed">
            Martín, este sistema fue creado especialmente para ti. No necesitas perseguir el
            mercado: tu ventaja está en leer el contexto mayor en <strong>Diario, 4H, 2H y 30m</strong>,
            ejecutar con templanza en <strong>15m y 5m</strong> durante la ventana de Nueva York,
            arriesgar siempre entre el <strong>1% y el 2%</strong>, y confiar en tu análisis hasta{' '}
            <strong>TP o SL</strong> sin dudar.
          </p>
        </div>

        <div className="space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
            <BookOpen className={`w-4 h-4 ${theme.accentTextClass}`} />
            Sabiduría Bíblica, Templanza y Disciplina
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {MARTIN_QUOTES.map((q, idx) => (
              <div
                key={idx}
                className="p-4 rounded-xl bg-zinc-900/50 border border-white/[0.06] flex flex-col justify-between space-y-2"
              >
                <p className="text-xs text-zinc-200 leading-relaxed italic">
                  &ldquo;{q.text}&rdquo;
                </p>
                <div className="flex items-center justify-between pt-2 border-t border-white/[0.05]">
                  <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-white/5 text-zinc-400">
                    {q.category}
                  </span>
                  <span className={`text-xs font-bold ${theme.accentTextClass}`}>
                    {q.author}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end pt-3 border-t border-white/[0.08]">
          <button
            onClick={onClose}
            className={`px-5 py-2 rounded-xl text-xs font-bold cursor-pointer ${theme.buttonClass}`}
          >
            Volver a la Terminal
          </button>
        </div>
      </div>
    </div>
  );
}