'use client';

import { useState } from 'react';
import { TradingProvider, useTrading } from '@/context/TradingContext';
import { Sidebar, type ActiveTab } from '@/components/layout/Sidebar';
import { Topbar } from '@/components/layout/Topbar';
import { DashboardView } from '@/components/views/DashboardView';
import { JournalView } from '@/components/views/JournalView';
import { CalendarView } from '@/components/views/CalendarView';
import { AnalyticsView } from '@/components/views/AnalyticsView';
import { PlaybooksView } from '@/components/views/PlaybooksView';
import { TradeFormModal } from '@/components/modals/TradeFormModal';
import { TradeInspectorDrawer } from '@/components/modals/TradeInspectorDrawer';
import type { Trade } from '@/types/trading';

const PREVIEW_USER_ID = 'martin-local-showcase';

function PreviewWorkspace() {
  const { trades, loadDemoTrades } = useTrading();
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isTradeModalOpen, setIsTradeModalOpen] = useState(false);
  const [editingTrade, setEditingTrade] = useState<Trade | null>(null);
  const [inspectedTrade, setInspectedTrade] = useState<Trade | null>(null);
  const [newTradeEntryDate, setNewTradeEntryDate] = useState('');

  const handleOpenNewTradeForDate = (dateKey: string) => {
    setEditingTrade(null);
    setNewTradeEntryDate(dateKey);
    setIsTradeModalOpen(true);
  };

  const handleEditTrade = (trade: Trade) => {
    setInspectedTrade(null);
    setEditingTrade(trade);
    setIsTradeModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-[#09090B] font-sans text-zinc-100 antialiased">
      <div className="border-b border-white/[0.08] bg-zinc-950 px-4 py-2 text-center text-[11px] text-zinc-400">
        VISTA PREVIA LOCAL · Datos aislados de la cuenta real · Sin conexión a la nube
      </div>
      <div className="flex min-h-[calc(100vh-33px)]">
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          isMobileOpen={isMobileNavOpen}
          onCloseMobile={() => setIsMobileNavOpen(false)}
        />

        <main className="min-w-0 flex-1">
          <Topbar
            activeTab={activeTab}
            onToggleMobileNav={() => setIsMobileNavOpen((open) => !open)}
            signedInEmail="Vista previa local"
            onSignOut={() => {}}
            localOnly
          />

          <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
            {trades.length === 0 && activeTab === 'dashboard' && (
              <section className="flex flex-wrap items-center justify-between gap-4 border border-white/[0.08] bg-zinc-950/70 p-4 sm:px-5">
                <div>
                  <h2 className="text-sm font-medium text-zinc-100">Vista previa del sistema</h2>
                  <p className="mt-1 text-xs text-zinc-400">
                    Carga operaciones de ejemplo para mostrar gráficos y métricas.
                  </p>
                </div>
                <button
                  className="min-h-10 border border-white/20 px-4 text-xs font-medium text-zinc-100 transition hover:bg-white/10"
                  onClick={loadDemoTrades}
                  type="button"
                >
                  Cargar operaciones de ejemplo
                </button>
              </section>
            )}

            {activeTab === 'dashboard' && (
              <>
                <DashboardView />
                <JournalView onInspectTrade={setInspectedTrade} onEditTrade={handleEditTrade} />
              </>
            )}
            {activeTab === 'calendar' && (
              <CalendarView
                onInspectTrade={setInspectedTrade}
                onOpenNewTradeForDate={handleOpenNewTradeForDate}
              />
            )}
            {activeTab === 'analytics' && (
              <AnalyticsView
                onInspectTrade={setInspectedTrade}
              />
            )}
            {activeTab === 'playbooks' && <PlaybooksView />}
          </div>
        </main>

        <TradeFormModal
          isOpen={isTradeModalOpen}
          onClose={() => setIsTradeModalOpen(false)}
          editingTrade={editingTrade}
          initialEntryDate={newTradeEntryDate}
          prefillData={null}
        />
        <TradeInspectorDrawer
          trade={inspectedTrade}
          onClose={() => setInspectedTrade(null)}
          onEdit={handleEditTrade}
        />
      </div>
    </div>
  );
}

export function SystemPreview() {
  return (
    <TradingProvider localOnly userId={PREVIEW_USER_ID}>
      <PreviewWorkspace />
    </TradingProvider>
  );
}
