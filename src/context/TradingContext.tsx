"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useCallback,
} from 'react';
import {
  Trade,
  PropAccount,
  ICTPlaybook,
  DailyJournalNote,
  TradeFilters,
  DashboardMetrics,
  PersonalTradingRule,
  TradeSourceType,
} from '@/types/trading';
import {
  DEFAULT_ACCOUNTS,
  DEFAULT_PLAYBOOKS,
  SAMPLE_TRADES,
  AccentThemeKey,
  ThemePalette,
  THEME_PALETTES,
  MARTIN_QUOTES,
  MotivationalQuote,
} from '@/config/ict-constants';
import { calculateDashboardMetrics } from '@/services/math-engine';
import { createClient } from '@/lib/supabase/client';
import {
  loadTradingSnapshot,
  mergeTradingSnapshots,
  syncTradingChanges,
  type TradingSnapshot,
} from '@/services/cloud-sync-service';
import {
  STORAGE_KEYS,
  parseTradingViewCSV,
  validateBackupPayload,
  BackupPayload,
} from '@/services/storage-service';
import { hasStableCsvSourceIdentity, mergeCsvTrades } from '@/services/csv-import-service';

interface TradingContextValue {
  trades: Trade[];
  filteredTrades: Trade[];
  accounts: PropAccount[];
  playbooks: ICTPlaybook[];
  dailyNotes: Record<string, DailyJournalNote>;
  personalRules: PersonalTradingRule[];
  filters: TradeFilters;
  metrics: DashboardMetrics;
  isLoaded: boolean;
  cloudReady: boolean;
  cloudSyncStatus: 'loading' | 'synced' | 'error';
  retryCloudSync: () => void;
  accentTheme: AccentThemeKey;
  theme: ThemePalette;
  currentQuote: MotivationalQuote;
  setAccentTheme: (theme: AccentThemeKey) => void;
  nextQuote: () => void;
  setFilters: React.Dispatch<React.SetStateAction<TradeFilters>>;
  resetFilters: () => void;
  defaultAccountId: string | null;
  setDefaultAccountId: (id: string | null) => void;
  addTrade: (trade: Omit<Trade, 'id'>) => Trade;
  updateTrade: (trade: Trade) => void;
  deleteTrade: (id: string) => void;
  addAccount: (acc: Omit<PropAccount, 'id'>) => PropAccount;
  deleteAccount: (id: string) => void;
  addPlaybook: (pb: Omit<ICTPlaybook, 'id'>) => void;
  deletePlaybook: (id: string) => void;
  saveDailyNote: (note: DailyJournalNote) => void;
  addPersonalRule: (text: string) => void;
  updatePersonalRule: (id: string, text: string) => void;
  deletePersonalRule: (id: string) => void;
  importCSV: (csvText: string, defaultSourceType?: TradeSourceType) => number;
  importBacktestCSV: (csvText: string) => number;
  importPreparedCsvTrades: (importedTrades: readonly Trade[]) => number;
  exportBackup: () => void;
  importBackup: (jsonText: string) => boolean;
  clearAllTrades: () => void;
  loadDemoTrades: () => void;
}

const DEFAULT_FILTERS: TradeFilters = {
  accountId: 'All',
  killzone: 'All',
  symbol: '',
  direction: 'All',
  status: 'All',
  playbookId: 'All',
  dateFrom: '',
  dateTo: '',
  sourceType: 'All',
};

import { resolveTargetAccount } from '@/services/account-service';
export { resolveTargetAccount };

const THEME_STORAGE_KEY = 'martin_trader_theme_v1';

const TradingContext = createContext<TradingContextValue | undefined>(undefined);

function scopedStorageKey(key: string, userId: string) {
  return `${key}_${userId}`;
}

const TECHNICAL_FALLBACK_ACCOUNT: PropAccount = {
  id: 'acc-tech-unrecorded',
  name: 'Cuenta Técnica (Sin capital de referencia)',
  firm: 'Martin OS Technical',
  initialBalance: 0,
  profitTarget: 0,
  maxDrawdown: 0,
  dailyLossLimit: 0,
  isTechnical: true,
  hasVerifiedBalance: false,
};


export function TradingProvider({
  children,
  userId,
  localOnly = false,
}: {
  children: React.ReactNode;
  userId: string;
  localOnly?: boolean;
}) {
  // Demo records are added only through the explicit "Cargar demo" action.
  const [trades, setTrades] = useState<Trade[]>([]);
  const [accounts, setAccounts] = useState<PropAccount[]>([]);
  const [defaultAccountId, setDefaultAccountIdState] = useState<string | null>(null);
  const [playbooks, setPlaybooks] = useState<ICTPlaybook[]>(DEFAULT_PLAYBOOKS);
  const [dailyNotes, setDailyNotes] = useState<Record<string, DailyJournalNote>>({});
  const [personalRules, setPersonalRules] = useState<PersonalTradingRule[]>([]);
  const [filters, setFilters] = useState<TradeFilters>(DEFAULT_FILTERS);
  const [accentTheme, setAccentThemeState] = useState<AccentThemeKey>('ice');
  const [quoteIdx, setQuoteIdx] = useState<number>(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const [cloudReady, setCloudReady] = useState(localOnly);
  const [cloudSyncStatus, setCloudSyncStatus] = useState<'loading' | 'synced' | 'error'>('loading');
  const [cloudRetryCount, setCloudRetryCount] = useState(0);
  const lastSyncedSnapshot = React.useRef<TradingSnapshot | null>(null);
  const hasLoadedRemoteSnapshot = React.useRef(false);
  const syncQueue = React.useRef<Promise<void>>(Promise.resolve());
  const currentSnapshotRef = React.useRef<TradingSnapshot>({ trades, accounts, playbooks, dailyNotes, personalRules });

  useEffect(() => {
    currentSnapshotRef.current = { trades, accounts, playbooks, dailyNotes, personalRules };
  }, [trades, accounts, playbooks, dailyNotes, personalRules]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      try {
        const readUserValue = (key: string) => {
          const scopedValue = localStorage.getItem(scopedStorageKey(key, userId));
          if (scopedValue !== null) return scopedValue;
          if (userId === process.env.NEXT_PUBLIC_MARTIN_USER_ID) return localStorage.getItem(key);
          return null;
        };
        const savedTrades = readUserValue(STORAGE_KEYS.TRADES);
        const savedAccounts = readUserValue(STORAGE_KEYS.ACCOUNTS);
        const savedPlaybooks = readUserValue(STORAGE_KEYS.PLAYBOOKS);
        const savedNotes = readUserValue(STORAGE_KEYS.DAILY_NOTES);
        const savedPersonalRules = readUserValue(STORAGE_KEYS.PERSONAL_RULES);
        const savedDefaultAccount = readUserValue(STORAGE_KEYS.DEFAULT_ACCOUNT);
        const savedTheme = localStorage.getItem(THEME_STORAGE_KEY) as AccentThemeKey | null;

        if (savedDefaultAccount) {
          setDefaultAccountIdState(savedDefaultAccount);
        }

        let parsedTrades: Trade[] = [];
        if (savedTrades !== null) {
          const savedTradeData = JSON.parse(savedTrades) as Trade[];
          parsedTrades = savedTradeData.map((trade) => ({
            ...trade,
            status: trade.status === 'Win' || trade.status === 'Loss'
              ? trade.status
              : trade.netPnl > 0 ? 'Win' : 'Loss',
          }));
          setTrades(parsedTrades);
        }
        if (savedAccounts !== null) {
          setAccounts(JSON.parse(savedAccounts) as PropAccount[]);
        } else if (parsedTrades.length > 0) {
          const referencedDefaultAccounts = DEFAULT_ACCOUNTS.filter((acc) =>
            parsedTrades.some((t) => t.accountId === acc.id)
          );
          if (referencedDefaultAccounts.length > 0) {
            setAccounts(referencedDefaultAccounts);
          }
        }
        if (savedPlaybooks !== null) {
          const savedPlaybookData = JSON.parse(savedPlaybooks) as ICTPlaybook[];
          const builtInPlaybookIds = new Set(['pb-ny-open-htf', 'pb-ny-session-reaction']);
          setPlaybooks(savedPlaybookData.filter((playbook) => !builtInPlaybookIds.has(playbook.id)));
        }
        if (savedNotes !== null) {
          setDailyNotes(JSON.parse(savedNotes) as Record<string, DailyJournalNote>);
        }
        if (savedPersonalRules !== null) {
          const parsedRules: unknown = JSON.parse(savedPersonalRules);
          if (Array.isArray(parsedRules)) {
            setPersonalRules(parsedRules.filter((rule): rule is PersonalTradingRule =>
              typeof rule?.id === 'string' && typeof rule?.text === 'string'
            ));
          }
        }
        if (savedTheme && THEME_PALETTES[savedTheme]) setAccentThemeState(savedTheme);
      } catch (err) {
        console.error('Error loading local storage:', err);
      } finally {
        setIsLoaded(true);
      }
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [userId]);

  useEffect(() => {
    if (!isLoaded) return;
    localStorage.setItem(scopedStorageKey(STORAGE_KEYS.TRADES, userId), JSON.stringify(trades));
  }, [trades, isLoaded, userId]);

  useEffect(() => {
    if (!isLoaded) return;
    localStorage.setItem(scopedStorageKey(STORAGE_KEYS.ACCOUNTS, userId), JSON.stringify(accounts));
  }, [accounts, isLoaded, userId]);

  useEffect(() => {
    if (!isLoaded) return;
    localStorage.setItem(scopedStorageKey(STORAGE_KEYS.PLAYBOOKS, userId), JSON.stringify(playbooks));
  }, [playbooks, isLoaded, userId]);

  useEffect(() => {
    if (!isLoaded) return;
    localStorage.setItem(scopedStorageKey(STORAGE_KEYS.DAILY_NOTES, userId), JSON.stringify(dailyNotes));
  }, [dailyNotes, isLoaded, userId]);

  useEffect(() => {
    if (!isLoaded) return;
    localStorage.setItem(scopedStorageKey(STORAGE_KEYS.PERSONAL_RULES, userId), JSON.stringify(personalRules));
  }, [personalRules, isLoaded, userId]);

  useEffect(() => {
    if (!isLoaded || localOnly) return;
    let active = true;
    const client = createClient();

    void (async () => {
      const localSnapshot = currentSnapshotRef.current;
      let remoteSnapshot: TradingSnapshot | null = null;
      try {
        remoteSnapshot = await loadTradingSnapshot(client);
        const mergedSnapshot = mergeTradingSnapshots(localSnapshot, remoteSnapshot);
        setTrades(mergedSnapshot.trades);
        setAccounts(mergedSnapshot.accounts);
        setPlaybooks(mergedSnapshot.playbooks);
        setDailyNotes(mergedSnapshot.dailyNotes);
        setPersonalRules(mergedSnapshot.personalRules);
        lastSyncedSnapshot.current = remoteSnapshot;
        hasLoadedRemoteSnapshot.current = true;
        await syncTradingChanges(client, userId, remoteSnapshot, mergedSnapshot);
        if (!active) return;
        lastSyncedSnapshot.current = mergedSnapshot;
        setCloudSyncStatus('synced');
      } catch (cause) {
        console.error('Supabase initial sync failed:', cause);
        if (!active) return;
        lastSyncedSnapshot.current = remoteSnapshot ?? localSnapshot;
        hasLoadedRemoteSnapshot.current = remoteSnapshot !== null;
        setCloudSyncStatus('error');
      } finally {
        if (active) setCloudReady(true);
      }
    })();

    return () => { active = false; };
  }, [isLoaded, userId, cloudRetryCount, localOnly]);

  useEffect(() => {
    if (localOnly || !cloudReady || cloudSyncStatus === 'loading') return;
    const client = createClient();
    const nextSnapshot: TradingSnapshot = { trades, accounts, playbooks, dailyNotes, personalRules };
    const timer = window.setTimeout(() => {
      syncQueue.current = syncQueue.current.then(async () => {
        const previousSnapshot = lastSyncedSnapshot.current;
        if (!previousSnapshot) return;
        try {
          await syncTradingChanges(client, userId, previousSnapshot, nextSnapshot);
          lastSyncedSnapshot.current = nextSnapshot;
          setCloudSyncStatus('synced');
        } catch (cause) {
          console.error('Supabase sync failed:', cause);
          setCloudSyncStatus('error');
        }
      });
    }, 450);
    return () => window.clearTimeout(timer);
  }, [cloudReady, cloudSyncStatus, trades, accounts, playbooks, dailyNotes, personalRules, userId, localOnly]);

  const setAccentTheme = useCallback((t: AccentThemeKey) => {
    setAccentThemeState(t);
    localStorage.setItem(THEME_STORAGE_KEY, t);
  }, []);

  const nextQuote = useCallback(() => {
    setQuoteIdx((prev) => (prev + 1) % MARTIN_QUOTES.length);
  }, []);

  const retryCloudSync = useCallback(() => {
    setCloudSyncStatus('loading');
    if (hasLoadedRemoteSnapshot.current && lastSyncedSnapshot.current) {
      const client = createClient();
      const before = lastSyncedSnapshot.current;
      const after = currentSnapshotRef.current;
      syncQueue.current = syncQueue.current.then(async () => {
        try {
          await syncTradingChanges(client, userId, before, after);
          lastSyncedSnapshot.current = after;
          setCloudSyncStatus('synced');
        } catch (cause) {
          console.error('Supabase retry failed:', cause);
          setCloudSyncStatus('error');
        }
      });
      return;
    }

    setCloudReady(false);
    setCloudRetryCount((count) => count + 1);
  }, [userId]);

  const filteredTrades = useMemo(() => {
    return trades
      .filter((t) => {
        if (filters.accountId !== 'All' && t.accountId !== filters.accountId) return false;
        if (filters.killzone !== 'All' && t.killzone !== filters.killzone) return false;
        if (filters.direction !== 'All' && t.direction !== filters.direction) return false;
        if (filters.status !== 'All' && t.status !== filters.status) return false;
        if (filters.playbookId !== 'All' && t.playbookId !== filters.playbookId) return false;
        if (
          filters.symbol.trim() !== '' &&
          !t.symbol.toLowerCase().includes(filters.symbol.trim().toLowerCase())
        ) {
          return false;
        }
        if (filters.sourceType && filters.sourceType !== 'All') {
          const sType = t.sourceType || 'unclassified';
          if (sType !== filters.sourceType) return false;
        }
        const tradeDay = t.entryDate.slice(0, 10);
        if (filters.dateFrom && tradeDay < filters.dateFrom) return false;
        if (filters.dateTo && tradeDay > filters.dateTo) return false;
        return true;
      })
      .sort(
        (a, b) => b.entryDate.localeCompare(a.entryDate) || b.id.localeCompare(a.id)
      );
  }, [trades, filters]);

  const metrics = useMemo(
    () => calculateDashboardMetrics(trades, accounts),
    [trades, accounts]
  );

  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
  }, []);

  const setDefaultAccountId = useCallback((accId: string | null) => {
    setDefaultAccountIdState(accId);
    const key = scopedStorageKey(STORAGE_KEYS.DEFAULT_ACCOUNT, userId);
    if (accId) {
      localStorage.setItem(key, accId);
    } else {
      localStorage.removeItem(key);
    }
  }, [userId]);

  const addTrade = useCallback((trade: Omit<Trade, 'id'>) => {
    const created: Trade = {
      ...trade,
      id: `tr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };
    setTrades((prev) => [created, ...prev]);
    return created;
  }, []);

  const updateTrade = useCallback((updated: Trade) => {
    setTrades((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  }, []);

  const deleteTrade = useCallback((id: string) => {
    setTrades((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addAccount = useCallback((acc: Omit<PropAccount, 'id'>) => {
    const created: PropAccount = {
      ...acc,
      id: `acc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };
    setAccounts((prev) => [...prev, created]);
    return created;
  }, []);

  const deleteAccount = useCallback((id: string) => {
    setAccounts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const addPlaybook = useCallback((pb: Omit<ICTPlaybook, 'id'>) => {
    const created: ICTPlaybook = { ...pb, id: `pb-${Date.now()}` };
    setPlaybooks((prev) => [...prev, created]);
  }, []);

  const deletePlaybook = useCallback((id: string) => {
    setPlaybooks((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const saveDailyNote = useCallback((note: DailyJournalNote) => {
    setDailyNotes((prev) => ({ ...prev, [note.date]: note }));
  }, []);

  const addPersonalRule = useCallback((text: string) => {
    const normalizedText = text.trim();
    if (!normalizedText) return;
    setPersonalRules((prev) => [
      ...prev,
      { id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, text: normalizedText },
    ]);
  }, []);

  const updatePersonalRule = useCallback((id: string, text: string) => {
    setPersonalRules((prev) => prev.map((rule) => rule.id === id ? { ...rule, text } : rule));
  }, []);

  const deletePersonalRule = useCallback((id: string) => {
    setPersonalRules((prev) => prev.filter((rule) => rule.id !== id));
  }, []);

  const importCSV = useCallback(
    (csvText: string, defaultSourceType: TradeSourceType = 'unclassified') => {
      let targetAccountId = filters.accountId !== 'All' ? filters.accountId : accounts[0]?.id;
      if (!targetAccountId) {
        targetAccountId = TECHNICAL_FALLBACK_ACCOUNT.id;
        setAccounts((prev) => prev.some((a) => a.id === TECHNICAL_FALLBACK_ACCOUNT.id) ? prev : [TECHNICAL_FALLBACK_ACCOUNT, ...prev]);
      }
      const parsed = parseTradingViewCSV(csvText, targetAccountId, defaultSourceType, trades);
      if (parsed.length > 0) {
        setTrades((prev) => [...parsed, ...prev]);
      }
      return parsed.length;
    },
    [filters.accountId, accounts, trades]
  );

  const importBacktestCSV = useCallback(
    (csvText: string) => {
      return importCSV(csvText, 'backtest');
    },
    [importCSV]
  );

  const importPreparedCsvTrades = useCallback((importedTrades: readonly Trade[]) => {
    if (importedTrades.length === 0) return 0;
    const tradesWithPersistentIds = importedTrades.map((trade) => hasStableCsvSourceIdentity(trade)
      ? trade
      : { ...trade, id: crypto.randomUUID() });
    setTrades((previous) => mergeCsvTrades(previous, tradesWithPersistentIds));
    if (tradesWithPersistentIds.some((trade) => trade.accountId === TECHNICAL_FALLBACK_ACCOUNT.id)) {
      setAccounts((previous) => previous.some((account) => account.id === TECHNICAL_FALLBACK_ACCOUNT.id)
        ? previous
        : [TECHNICAL_FALLBACK_ACCOUNT, ...previous]);
    }
    return importedTrades.length;
  }, []);

  const exportBackup = useCallback(() => {
    const payload: BackupPayload = {
      version: '3.0',
      exportedAt: new Date().toISOString(),
      trades,
      accounts,
      playbooks,
      dailyNotes,
      personalRules,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `martin-trader-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [trades, accounts, playbooks, dailyNotes, personalRules]);

  const importBackup = useCallback((jsonText: string): boolean => {
    try {
      const parsed = JSON.parse(jsonText);
      if (!validateBackupPayload(parsed)) return false;
      setTrades(parsed.trades);
      setAccounts(parsed.accounts);
      if (Array.isArray(parsed.playbooks)) setPlaybooks(parsed.playbooks);
      if (parsed.dailyNotes && typeof parsed.dailyNotes === 'object') {
        setDailyNotes(parsed.dailyNotes);
      }
      setPersonalRules(Array.isArray(parsed.personalRules) ? parsed.personalRules : []);
      return true;
    } catch {
      return false;
    }
  }, []);

  const clearAllTrades = useCallback(() => {
    setTrades([]);
  }, []);

  const loadDemoTrades = useCallback(() => {
    setAccounts((prev) => (prev.length > 0 ? prev : DEFAULT_ACCOUNTS));
    setTrades(SAMPLE_TRADES);
  }, []);

  if (!cloudReady) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#09090B] text-sm text-zinc-400">
        Conectando la bitácora segura…
      </div>
    );
  }

  return (
    <TradingContext.Provider
      value={{
        trades,
        filteredTrades,
        accounts,
        playbooks,
        dailyNotes,
        personalRules,
        filters,
        metrics,
        isLoaded,
        cloudReady,
        cloudSyncStatus,
        retryCloudSync,
        accentTheme,
        theme: THEME_PALETTES[accentTheme],
        currentQuote: MARTIN_QUOTES[quoteIdx],
        setAccentTheme,
        nextQuote,
        setFilters,
        resetFilters,
        defaultAccountId,
        setDefaultAccountId,
        addTrade,
        updateTrade,
        deleteTrade,
        addAccount,
        deleteAccount,
        addPlaybook,
        deletePlaybook,
        saveDailyNote,
        importBacktestCSV,
        importPreparedCsvTrades,
        addPersonalRule,
        updatePersonalRule,
        deletePersonalRule,
        importCSV,
        exportBackup,
        importBackup,
        clearAllTrades,
        loadDemoTrades,
      }}
    >
      {children}
    </TradingContext.Provider>
  );
}

export function useTrading() {
  const ctx = useContext(TradingContext);
  if (!ctx) {
    throw new Error('useTrading must be used within a TradingProvider');
  }
  return ctx;
}
