"use client";

import { useEffect, useState } from "react";
import {
  autoCalculateTradeMath,
  detectKillzoneFromTime,
  INITIAL_ACCOUNTS,
  INITIAL_TRADES,
} from "../app/lib/ict-engine";
import type { PropAccount, Trade } from "../app/lib/ict-engine";

const TRADES_STORAGE_KEY = "zella_ict_trades_v1";
const ACCOUNTS_STORAGE_KEY = "zella_ict_accounts_v1";

function parseCsvRows(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let insideQuotes = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const next = csv[index + 1];

    if (char === '"' && insideQuotes && next === '"') {
      field += '"';
      index += 1;
    } else if (char === '"') {
      insideQuotes = !insideQuotes;
    } else if (char === "," && !insideQuotes) {
      row.push(field.trim());
      field = "";
    } else if ((char === "\n" || char === "\r") && !insideQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

export function useZellaStore() {
  const [trades, setTrades] = useState<Trade[]>(INITIAL_TRADES);
  const [accounts, setAccounts] = useState<PropAccount[]>(INITIAL_ACCOUNTS);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    try {
      const savedTrades = localStorage.getItem(TRADES_STORAGE_KEY);
      const savedAccounts = localStorage.getItem(ACCOUNTS_STORAGE_KEY);

      // Restore browser storage after hydration to keep server and client markup aligned.
      if (savedTrades) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setTrades(JSON.parse(savedTrades) as Trade[]);
      }
      if (savedAccounts) {
        setAccounts(JSON.parse(savedAccounts) as PropAccount[]);
      }
    } catch (error) {
      console.error("No se pudieron cargar los datos guardados de Zella.", error);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem(TRADES_STORAGE_KEY, JSON.stringify(trades));
    }
  }, [trades, isLoaded]);

  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts));
    }
  }, [accounts, isLoaded]);

  const addTrade = (trade: Omit<Trade, "id">) => {
    const created: Trade = { ...trade, id: `tr-${Date.now()}` };
    setTrades((current) => [created, ...current]);
    return created;
  };

  const updateTrade = (updated: Trade) => {
    setTrades((current) =>
      current.map((trade) => (trade.id === updated.id ? updated : trade))
    );
  };

  const deleteTrade = (id: string) => {
    setTrades((current) => current.filter((trade) => trade.id !== id));
  };

  const addAccount = (account: Omit<PropAccount, "id">) => {
    const created: PropAccount = { ...account, id: `acc-${Date.now()}` };
    setAccounts((current) => [...current, created]);
    return created;
  };

  const deleteAccount = (id: string) => {
    setAccounts((current) => current.filter((account) => account.id !== id));
  };

  const importFromCSV = (csvText: string, targetAccountId: string): number => {
    const [headerRow, ...dataRows] = parseCsvRows(csvText);
    if (!headerRow || dataRows.length === 0) return 0;

    const headers = headerRow.map((header) =>
      header.replace(/^\uFEFF/, "").trim().toLowerCase()
    );
    const imported = dataRows.flatMap((columns, index): Trade[] => {
      const row = Object.fromEntries(
        headers.map((header, columnIndex) => [header, columns[columnIndex] ?? ""])
      );
      const read = (...keys: string[]) =>
        keys.map((key) => row[key]).find((value) => value?.trim()) ?? "";
      const number = (value: string, fallback = 0) => {
        const parsed = Number.parseFloat(value.replace(/[$,]/g, ""));
        return Number.isFinite(parsed) ? parsed : fallback;
      };

      const symbol = (read("symbol", "instrument", "ticker") || "NQ1!").toUpperCase();
      const rawDirection = read("side", "direction", "type").toLowerCase();
      const direction = rawDirection.includes("short") || rawDirection.includes("sell")
        ? "Short"
        : "Long";
      const entryPrice = number(read("entry price", "entry", "price"));
      const exitPrice = number(read("exit price", "exit", "close price"));
      const stopLoss = number(read("stop loss", "sl"));
      const takeProfit = number(read("take profit", "tp"));
      const size = number(read("qty", "size", "contracts"), 1) || 1;
      const commission = number(read("commission", "fee"));
      const calculation = autoCalculateTradeMath({
        symbol,
        entryPrice,
        exitPrice,
        stopLoss,
        takeProfit,
        size,
        commission,
        direction,
      });
      const explicitPnl = Number.parseFloat(read("pnl", "profit", "net pnl"));
      const netPnl = Number.isFinite(explicitPnl) ? explicitPnl : calculation.netPnl;
      const sourceDate = read("time", "date", "entry time") || new Date().toISOString();
      const entryDate = sourceDate.replace(" ", "T").slice(0, 16);

      return [{
        id: `csv-${Date.now()}-${index}`,
        symbol,
        direction,
        entryDate,
        entryPrice,
        exitPrice,
        stopLoss,
        takeProfit,
        size,
        grossPnl: Number((netPnl + commission).toFixed(2)),
        commission,
        netPnl,
        plannedRR: calculation.plannedRR,
        rMultiple: calculation.rMultiple,
        status: netPnl > 0 ? "Win" : "Loss",
        killzone: detectKillzoneFromTime(entryDate),
        pdArrays: ["FVG (Fair Value Gap)"],
        dailyBias: direction === "Long" ? "Bullish" : "Bearish",
        dolTarget: "",
        timeframe: "1m",
        followedPlan: true,
        psychologyTag: "A+ Setup (Disciplinado)",
        notes: "Importado desde CSV.",
        accountId: targetAccountId,
      }];
    });

    if (imported.length > 0) {
      setTrades((current) => [...imported, ...current]);
    }
    return imported.length;
  };

  const exportBackupJSON = () => {
    const backup = new Blob([JSON.stringify({ trades, accounts }, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(backup);
    const link = document.createElement("a");
    link.href = url;
    link.download = `zella-ict-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return {
    trades,
    accounts,
    isLoaded,
    addTrade,
    updateTrade,
    deleteTrade,
    addAccount,
    deleteAccount,
    importFromCSV,
    exportBackupJSON,
  };
}
