"use client";

import React, { useRef } from 'react';
import Image from 'next/image';
import { useTrading } from '@/context/TradingContext';
import grisIcon from '@/app/lib/icons/gris.png';
import {
  Upload,
  Download,
  FolderUp,
  Trash2,
  BarChart3,
  Calendar as CalendarIcon,
  Layers,
  RotateCcw,
  Heart,
  X,
} from 'lucide-react';

export type ActiveTab = 'dashboard' | 'calendar' | 'playbooks';

interface SidebarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
  onShowDedication?: () => void;
}

export function Sidebar({
  activeTab,
  setActiveTab,
  isMobileOpen,
  onCloseMobile,
  onShowDedication,
}: SidebarProps) {
  const {
    trades,
    theme,
    importCSV,
    exportBackup,
    importBackup,
    clearAllTrades,
    loadDemoTrades,
  } = useTrading();

  const csvInputRef = useRef<HTMLInputElement | null>(null);
  const jsonInputRef = useRef<HTMLInputElement | null>(null);

  const handleCSVChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const count = importCSV(evt.target?.result as string);
      alert(`Se importaron ${count} operaciones correctamente.`);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleJSONChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const ok = importBackup(evt.target?.result as string);
      if (ok) {
        alert('Copia de seguridad restaurada exitosamente.');
      } else {
        alert('Archivo JSON inválido.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <>
      {isMobileOpen && (
        <button
          aria-label="Cerrar menú"
          onClick={onCloseMobile}
          className="fixed inset-0 z-30 bg-black/70 md:hidden"
        />
      )}
      <aside className={`fixed inset-y-0 left-0 z-40 flex h-screen w-72 shrink-0 flex-col justify-between border-r border-white/[0.08] bg-[#09090B] select-none transition-transform duration-200 md:sticky md:top-0 md:z-20 md:w-64 md:translate-x-0 ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      <input
        type="file"
        accept=".csv"
        ref={csvInputRef}
        onChange={handleCSVChange}
        className="hidden"
      />
      <input
        type="file"
        accept=".json"
        ref={jsonInputRef}
        onChange={handleJSONChange}
        className="hidden"
      />

      <div>
        <div className="h-16 px-5 flex items-center gap-3.5 border-b border-white/[0.08]">
          <div className="w-9 h-9 rounded-xl bg-zinc-900 border border-white/15 flex items-center justify-center shadow-inner">
            <Image
              src={grisIcon}
              alt=""
              width={36}
              height={36}
              sizes="36px"
              className="h-9 w-9 object-contain"
            />
          </div>
          <div>
            <div className="font-extrabold text-sm tracking-wider text-zinc-100 flex items-center gap-1.5">
              MARTIN <span className={theme.accentTextClass}>{'//'}</span> OS
            </div>
            <span className="block text-[10px] font-medium uppercase tracking-widest text-zinc-500">
              Personal ICT Journal
            </span>
          </div>
          <button onClick={onCloseMobile} aria-label="Cerrar menú" className="ml-auto rounded-lg p-2 text-zinc-400 hover:bg-white/[0.06] md:hidden">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4">
          <div className="grid grid-cols-3 gap-1.5">
            <button
              onClick={() => csvInputRef.current?.click()}
              className="py-1.5 px-2 rounded-lg bg-zinc-900/80 hover:bg-zinc-800 border border-white/[0.06] text-zinc-400 hover:text-zinc-100 font-semibold text-[10px] flex flex-col items-center gap-0.5 cursor-pointer transition-colors"
              title="Importar CSV de Notion o TradingView"
            >
              <Upload className={`w-3.5 h-3.5 ${theme.accentTextClass}`} />
              CSV
            </button>
            <button
              onClick={exportBackup}
              className="py-1.5 px-2 rounded-lg bg-zinc-900/80 hover:bg-zinc-800 border border-white/[0.06] text-zinc-400 hover:text-zinc-100 font-semibold text-[10px] flex flex-col items-center gap-0.5 cursor-pointer transition-colors"
              title="Descargar Backup JSON"
            >
              <Download className={`w-3.5 h-3.5 ${theme.accentTextClass}`} />
              Backup
            </button>
            <button
              onClick={() => jsonInputRef.current?.click()}
              className="py-1.5 px-2 rounded-lg bg-zinc-900/80 hover:bg-zinc-800 border border-white/[0.06] text-zinc-400 hover:text-zinc-100 font-semibold text-[10px] flex flex-col items-center gap-0.5 cursor-pointer transition-colors"
              title="Restaurar Backup JSON"
            >
              <FolderUp className={`w-3.5 h-3.5 ${theme.accentTextClass}`} />
              Restore
            </button>
          </div>
        </div>

        <nav className="px-3 space-y-1">
          {[
            { id: 'dashboard', label: 'Dashboard & Ratios', icon: BarChart3 },
            { id: 'calendar', label: 'Calendario', icon: CalendarIcon },
            { id: 'playbooks', label: 'Estadísticas', icon: Layers },
          ].map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => { setActiveTab(item.id as ActiveTab); onCloseMobile(); }}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  active
                    ? theme.activeNavClass
                    : 'text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100'
                }`}
              >
                <Icon className={`w-4 h-4 ${active ? theme.accentTextClass : 'text-zinc-500'}`} />
                {item.label}
              </button>
            );
          })}

          {onShowDedication && (
            <button
              onClick={() => { onCloseMobile(); onShowDedication(); }}
              className="mt-1 w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100 transition-all cursor-pointer"
            >
              <Heart className={`w-4 h-4 ${theme.accentTextClass}`} />
              Reproducir intro
            </button>
          )}
        </nav>
      </div>

      <div className="p-3">
        <div className="flex gap-1.5 px-1">
          {trades.length > 0 ? (
            <button
              onClick={() => {
                if (confirm('¿Deseas limpiar los trades de ejemplo para iniciar tu registro desde 0?')) {
                  clearAllTrades();
                }
              }}
              className="w-full py-1.5 px-2 rounded-lg text-[11px] font-semibold text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 flex items-center justify-center gap-1 cursor-pointer transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" /> Limpiar Trades Demo
            </button>
          ) : (
            <button
              onClick={loadDemoTrades}
              className="w-full py-1.5 px-2 rounded-lg text-[11px] font-semibold text-zinc-400 hover:bg-white/[0.05] flex items-center justify-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Restaurar Demo
            </button>
          )}
        </div>
      </div>
    </aside>
    </>
  );
}
