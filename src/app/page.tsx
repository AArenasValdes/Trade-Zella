"use client";

import React, { useEffect, useState } from 'react';
import { TradingProvider } from '@/context/TradingContext';
import { Sidebar } from '@/components/layout/Sidebar';
import type { ActiveTab } from '@/components/layout/Sidebar';
import { Topbar } from '@/components/layout/Topbar';
import { DashboardView } from '@/components/views/DashboardView';
import { JournalView } from '@/components/views/JournalView';
import { CalendarView } from '@/components/views/CalendarView';
import { PlaybooksView } from '@/components/views/PlaybooksView';
import { TradeFormModal } from '@/components/modals/TradeFormModal';
import { TradeInspectorDrawer } from '@/components/modals/TradeInspectorDrawer';
import type { Trade } from '@/types/trading';
import { WelcomeExperience } from '@/components/views/WelcomeExperience';
import { SupabaseAuthGate, signOutFromSupabase } from '@/components/auth/SupabaseAuthGate';
import type { User } from '@supabase/supabase-js';

const INTRO_SEEN_KEY = 'martin_os_intro_seen_v1';

function TradingWorkspace({ user }: { user: User }) {
  const martinUserId = process.env.NEXT_PUBLIC_MARTIN_USER_ID;
  const isMartin = Boolean(martinUserId && user.id === martinUserId);
  const introSeenKey = `${INTRO_SEEN_KEY}_${user.id}`;
  const [introPreferenceReady, setIntroPreferenceReady] = useState(false);
  const [isWelcomeOpen, setIsWelcomeOpen] = useState(false);
  const [welcomeInstance, setWelcomeInstance] = useState(0);
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isTradeModalOpen, setIsTradeModalOpen] = useState(false);
  const [editingTrade, setEditingTrade] = useState<Trade | null>(null);
  const [inspectedTrade, setInspectedTrade] = useState<Trade | null>(null);
  const [newTradeEntryDate, setNewTradeEntryDate] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => {
      let seen = false;
      try {
      seen = !isMartin || window.localStorage.getItem(introSeenKey) === 'true';
      } catch {
        // Keep the intro available when browser storage is disabled.
      }
      setIsWelcomeOpen(!seen);
      setIntroPreferenceReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [introSeenKey, isMartin]);

  const handleIntroAccess = () => {
    try {
      window.localStorage.setItem(introSeenKey, 'true');
    } catch {
      // The current visit can still continue if storage is unavailable.
    }
  };

  const handleReplayIntro = () => {
    if (!isMartin) return;
    setWelcomeInstance((instance) => instance + 1);
    setIsWelcomeOpen(true);
  };

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
    <TradingProvider userId={user.id}>
      <div
        aria-hidden={isWelcomeOpen || !introPreferenceReady}
        className="min-h-screen bg-[#09090B] text-zinc-100 flex font-sans antialiased"
        inert={isWelcomeOpen || !introPreferenceReady}
      >
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          isMobileOpen={isMobileNavOpen}
          onCloseMobile={() => setIsMobileNavOpen(false)}
          onShowDedication={isMartin ? handleReplayIntro : undefined}
        />

        <main className="flex-1 min-w-0">
          <Topbar
            activeTab={activeTab}
            onToggleMobileNav={() => setIsMobileNavOpen((open) => !open)}
            signedInEmail={user.email ?? ''}
            onSignOut={() => { void signOutFromSupabase(); }}
          />

          <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
            {activeTab === 'dashboard' && (
              <>
                <DashboardView />
                <JournalView
                  onInspectTrade={setInspectedTrade}
                  onEditTrade={handleEditTrade}
                />
              </>
            )}

            {activeTab === 'calendar' && (
              <CalendarView
                onInspectTrade={setInspectedTrade}
                onOpenNewTradeForDate={handleOpenNewTradeForDate}
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
      {!introPreferenceReady && (
        <div aria-hidden="true" className="fixed inset-0 z-50 bg-[#09090B]" />
      )}
      {isMartin && isWelcomeOpen && introPreferenceReady && (
        <WelcomeExperience
          key={welcomeInstance}
          onAccessReady={handleIntroAccess}
          onComplete={() => {
            setIsWelcomeOpen(false);
          }}
        />
      )}
    </TradingProvider>
  );
}

export default function ZellaICTApp() {
  return (
    <SupabaseAuthGate>
      {(user) => <TradingWorkspace user={user} />}
    </SupabaseAuthGate>
  );
}
