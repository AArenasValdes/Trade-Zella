"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useTrading } from '@/context/TradingContext';
import { createClient } from '@/lib/supabase/client';
import type { Trade, TradeSourceType } from '@/types/trading';
import type { BudgetStatus } from '@/services/ai-budget-service';
import {
  Bot,
  Send,
  RotateCcw,
  Sparkles,
  AlertTriangle,
  ExternalLink,
  DollarSign,
  Clock,
} from 'lucide-react';

interface AiAnalystViewProps {
  onInspectTrade: (trade: Trade) => void;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  tokens?: number;
  costUsd?: number;
  referencedTradeIds?: string[];
  isError?: boolean;
}

let messageSequence = 0;
function createMessageId(prefix: string): string {
  messageSequence += 1;
  return `${prefix}-${messageSequence}`;
}

function getFormattedTime(): string {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const SUGGESTED_PROMPTS = [
  '¿Cuál es mi modelo más rentable en R?',
  '¿En qué horario NY tengo peor expectativa?',
  '¿Qué errores psicológicos se repiten en mis pérdidas?',
  '¿Cómo se compara mi backtesting con mi operativa real?',
  '¿Cuál ha sido mi mayor drawdown histórico?',
  '¿Qué operaciones respaldan mi mejor racha?',
];

export function AiAnalystView({ onInspectTrade }: AiAnalystViewProps) {
  const { trades } = useTrading();

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        'Hola Martín. Soy tu Analista Cuantitativo con motor **DeepSeek Flash**. Estoy listo para responder preguntas sobre tus modelos operativos, ventanas horarias de Nueva York, impacto psicológico y comparativas entre Backtesting y Real basándome exclusivamente en tus operaciones verificadas.\n\nPuedes seleccionar una pregunta sugerida o escribir tu consulta abajo.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const [inputValue, setInputValue] = useState('');
  const [selectedEnv, setSelectedEnv] = useState<TradeSourceType | 'All'>('All');
  const [isLoading, setIsLoading] = useState(false);
  const [budgetStatus, setBudgetStatus] = useState<BudgetStatus | null>(null);
  const [serverNotice, setServerNotice] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  // Fetch initial budget status from server
  useEffect(() => {
    async function loadBudget() {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        const headers: Record<string, string> = {};
        if (session?.access_token) {
          headers.Authorization = `Bearer ${session.access_token}`;
        }

        const res = await fetch('/api/ai-analyst/budget', { headers });
        if (res.ok) {
          const data = await res.json();
          if (data.budget) {
            setBudgetStatus(data.budget);
          }
        }
      } catch {
        // Ignore budget fetch errors on load
      }
    }
    loadBudget();
  }, []);

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputValue).trim();
    if (!text || isLoading) return;

    const userMessage: ChatMessage = {
      id: createMessageId('user'),
      role: 'user',
      content: text,
      timestamp: getFormattedTime(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);
    setServerNotice(null);

    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
      }

      const res = await fetch('/api/ai-analyst/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message: text,
          environment: selectedEnv,
        }),
      });

      const data = await res.json();

      if (data.budget) {
        setBudgetStatus(data.budget);
      }

      if (!res.ok) {
        const errContent = data.message || 'Error al comunicarse con el Analista IA.';
        setMessages((prev) => [
          ...prev,
          {
            id: createMessageId('err'),
            role: 'assistant',
            content: `⚠️ **Aviso del Analista:** ${errContent}`,
            timestamp: getFormattedTime(),
            isError: true,
          },
        ]);
        if (data.error === 'api_key_missing') {
          setServerNotice('DEEPSEEK_API_KEY no configurada en el servidor.');
        } else if (data.error === 'daily_limit_exceeded') {
          setServerNotice('Límite de 20 consultas diarias alcanzado.');
        } else if (data.error === 'budget_exceeded') {
          setServerNotice('Presupuesto mensual ($5.00 USD) alcanzado.');
        }
        return;
      }

      const assistantMessage: ChatMessage = {
        id: createMessageId('ast'),
        role: 'assistant',
        content: data.answer || 'Sin respuesta del modelo.',
        timestamp: getFormattedTime(),
        tokens: data.usage?.totalTokens,
        costUsd: data.usage?.estimatedCostUsd,
        referencedTradeIds: data.referencedTradeIds || [],
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: createMessageId('err'),
          role: 'assistant',
          content: '⚠️ No fue posible conectar con el servidor de análisis. Revisa tu conexión o el estado del servicio.',
          timestamp: getFormattedTime(),
          isError: true,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleClearChat = () => {
    if (confirm('¿Deseas reiniciar la conversación con el Analista IA?')) {
      setMessages([
        {
          id: 'welcome',
          role: 'assistant',
          content:
            'Conversación reiniciada. Puedes consultar cualquier aspecto sobre tus modelos, horarios o psicología.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    }
  };

  // Helper to render text with clickable [trade:ID] tags
  const renderMessageContent = (content: string, referencedIds?: string[]) => {
    const parts = content.split(/(\[trade:[a-zA-Z0-9_-]+\])/g);

    return (
      <div className="space-y-2 leading-relaxed text-xs sm:text-sm">
        {parts.map((part, index) => {
          const match = part.match(/^\[trade:([a-zA-Z0-9_-]+)\]$/);
          if (match) {
            const tradeId = match[1];
            const tradeObj = trades.find((t) => t.id === tradeId);
            return (
              <button
                key={`trade-btn-${index}`}
                onClick={() => {
                  if (tradeObj) {
                    onInspectTrade(tradeObj);
                  } else {
                    alert(`Ficha técnica del trade: ${tradeId}`);
                  }
                }}
                className="inline-flex items-center gap-1 px-2 py-0.5 mx-1 rounded-md bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 font-mono text-[11px] font-bold transition-colors cursor-pointer align-baseline"
                title={tradeObj ? `Abrir ficha técnica: ${tradeObj.symbol} (${tradeObj.entryDate})` : 'Abrir ficha técnica'}
              >
                <span>🔍</span>
                <span>{tradeObj ? `${tradeObj.symbol} #${tradeId.slice(0, 6)}` : `Trade #${tradeId.slice(0, 6)}`}</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            );
          }

          // Format bold markers and linebreaks cleanly
          const subLines = part.split('\n');
          return (
            <React.Fragment key={`text-${index}`}>
              {subLines.map((line, lIdx) => (
                <React.Fragment key={`subline-${lIdx}`}>
                  {lIdx > 0 && <br />}
                  {formatSimpleMarkdown(line)}
                </React.Fragment>
              ))}
            </React.Fragment>
          );
        })}

        {/* Trade reference drawer shortcut pills at the bottom of the message */}
        {referencedIds && referencedIds.length > 0 && (
          <div className="pt-2.5 mt-2 border-t border-white/[0.08] flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mr-1">
              Operaciones citadas:
            </span>
            {referencedIds.map((id) => {
              const trade = trades.find((t) => t.id === id);
              if (!trade) return null;
              const rBadge = trade.rMultiple !== undefined ? `${trade.rMultiple >= 0 ? '+' : ''}${trade.rMultiple}R` : '';
              return (
                <button
                  key={`ref-${id}`}
                  onClick={() => onInspectTrade(trade)}
                  className="px-2 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-white/[0.08] hover:border-cyan-500/40 text-[11px] font-mono text-zinc-300 hover:text-cyan-400 flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
                >
                  <span className={trade.status === 'Win' ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                    {trade.status === 'Win' ? 'TP' : 'SL'}
                  </span>
                  <span>{trade.symbol}</span>
                  {rBadge && <span className="text-zinc-500 text-[10px]">({rBadge})</span>}
                  <ExternalLink className="w-2.5 h-2.5 text-zinc-500" />
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4 max-w-5xl mx-auto flex flex-col h-[calc(100vh-8rem)] min-h-[550px]">
      {/* Top Header Card: Title, Provider, Budget & Limits */}
      <div className="bg-[#111114] rounded-2xl p-4 sm:p-5 border border-white/[0.08] shadow-sm shrink-0 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono tracking-wider bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-bold flex items-center gap-1">
                <Bot className="w-3 h-3" /> MARTIN OS V4b {'//'} DEEPSEEK FLASH
              </span>
              <span className="text-[11px] text-zinc-400 font-mono">Modo No-Thinking (Económico)</span>
            </div>
            <h1 className="text-lg sm:text-xl font-extrabold text-zinc-100 tracking-tight">
              Analista IA Cuantitativo
            </h1>
          </div>

          {/* Budget & Daily Queries Meter */}
          <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
            <div className="bg-zinc-900 border border-white/[0.08] px-3 py-1.5 rounded-xl flex items-center gap-2">
              <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-zinc-400 text-[11px]">Gasto mensual:</span>
              <strong className="text-zinc-100">
                ${budgetStatus ? budgetStatus.currentMonthSpentUsd.toFixed(4) : '0.0000'}
              </strong>
              <span className="text-zinc-500 text-[10px]">/ ${budgetStatus?.maxMonthlyBudgetUsd.toFixed(2) || '5.00'}</span>
            </div>

            <div className="bg-zinc-900 border border-white/[0.08] px-3 py-1.5 rounded-xl flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-zinc-400 text-[11px]">Consultas hoy:</span>
              <strong className={budgetStatus?.isDailyLimitReached ? 'text-rose-400 font-bold' : 'text-zinc-100'}>
                {budgetStatus ? budgetStatus.todayQueries : 0} / {budgetStatus?.maxDailyQueries || 20}
              </strong>
            </div>

            <button
              onClick={handleClearChat}
              title="Reiniciar conversación"
              className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/[0.08] text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Server notice banner if limit or key is triggered */}
        {serverNotice && (
          <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
            <span>{serverNotice}</span>
          </div>
        )}

        {/* Environment Filter Selector */}
        <div className="flex items-center justify-between text-xs pt-1 border-t border-white/[0.06] text-zinc-400">
          <div className="flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-wider font-semibold text-zinc-500">
              Entorno analizado:
            </span>
            <div className="flex gap-1">
              {(['All', 'real', 'backtest', 'demo', 'unclassified'] as const).map((env) => (
                <button
                  key={env}
                  onClick={() => setSelectedEnv(env)}
                  className={`px-2 py-0.5 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                    selectedEnv === env
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                      : 'bg-zinc-900/60 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                  }`}
                >
                  {env === 'All' ? 'Todos' : env === 'real' ? 'Real' : env === 'backtest' ? 'Backtesting' : env === 'demo' ? 'Demo' : 'Sin clasificar'}
                </button>
              ))}
            </div>
          </div>
          <span className="text-[10px] text-zinc-500 font-mono hidden sm:inline">
            Tarifa punta conservadora: $0.55/M in · $2.19/M out
          </span>
        </div>
      </div>

      {/* Suggested Questions Carousel / Chips */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 shrink-0 scrollbar-none">
        <span className="text-[10px] uppercase tracking-wider font-semibold text-zinc-500 shrink-0 flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-cyan-400" /> Sugerencias:
        </span>
        {SUGGESTED_PROMPTS.map((prompt, idx) => (
          <button
            key={`sug-${idx}`}
            onClick={() => handleSendMessage(prompt)}
            disabled={isLoading || Boolean(budgetStatus?.isDailyLimitReached) || Boolean(budgetStatus?.isMonthlyBudgetReached)}
            className="px-2.5 py-1 rounded-xl bg-[#111114] hover:bg-zinc-800 border border-white/[0.08] hover:border-cyan-500/40 text-zinc-300 hover:text-cyan-300 text-[11px] whitespace-nowrap transition-all cursor-pointer shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* Chat Thread Messages Box */}
      <div className="flex-1 bg-[#111114] rounded-2xl p-4 sm:p-6 border border-white/[0.08] overflow-y-auto space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.role === 'assistant' && (
              <div className="w-7 h-7 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0 mt-0.5">
                <Bot className="w-4 h-4" />
              </div>
            )}

            <div
              className={`max-w-[85%] sm:max-w-[78%] rounded-2xl p-3.5 sm:p-4 shadow-sm ${
                msg.role === 'user'
                  ? 'bg-cyan-600/20 text-zinc-100 border border-cyan-500/30'
                  : msg.isError
                  ? 'bg-rose-500/10 text-rose-200 border border-rose-500/30'
                  : 'bg-zinc-900/90 text-zinc-200 border border-white/[0.08]'
              }`}
            >
              <div className="flex items-center justify-between gap-4 mb-1 text-[10px] text-zinc-400 font-mono">
                <span className="font-semibold text-zinc-300">
                  {msg.role === 'user' ? 'Martín' : 'Analista DeepSeek Flash'}
                </span>
                <span>{msg.timestamp}</span>
              </div>

              {renderMessageContent(msg.content, msg.referencedTradeIds)}

              {msg.tokens !== undefined && (
                <div className="mt-2.5 pt-2 border-t border-white/[0.06] flex items-center justify-between text-[10px] font-mono text-zinc-500">
                  <span>{msg.tokens} tokens</span>
                  <span>≈ ${msg.costUsd?.toFixed(5)} USD</span>
                </div>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex gap-3 justify-start">
            <div className="w-7 h-7 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0 mt-0.5 animate-pulse">
              <Bot className="w-4 h-4" />
            </div>
            <div className="bg-zinc-900/80 rounded-2xl p-4 border border-white/[0.08] text-xs text-zinc-400 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
              <span>Calculando métricas y analizando operaciones en DeepSeek Flash...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Box Bar */}
      <div className="bg-[#111114] rounded-2xl p-3 border border-white/[0.08] shadow-sm shrink-0">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="flex items-end gap-2"
        >
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              budgetStatus?.isDailyLimitReached
                ? 'Límite de 20 consultas diarias alcanzado. Vuelve mañana.'
                : budgetStatus?.isMonthlyBudgetReached
                ? 'Presupuesto mensual ($5.00 USD) alcanzado.'
                : 'Pregunta sobre tu Win Rate, modelo Breaker Block, horario 9:30-10:35, drawdown... (Enter para enviar)'
            }
            disabled={isLoading || Boolean(budgetStatus?.isDailyLimitReached) || Boolean(budgetStatus?.isMonthlyBudgetReached)}
            rows={1}
            className="flex-1 bg-zinc-900 border border-white/[0.1] rounded-xl px-3.5 py-2.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-cyan-500 resize-none max-h-32 transition-colors disabled:opacity-50"
          />

          <button
            type="submit"
            disabled={!inputValue.trim() || isLoading || Boolean(budgetStatus?.isDailyLimitReached) || Boolean(budgetStatus?.isMonthlyBudgetReached)}
            className="px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 disabled:hover:bg-cyan-500 text-zinc-950 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer disabled:cursor-not-allowed shrink-0"
          >
            <span>Consultar</span>
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>

        <div className="flex items-center justify-between text-[10px] text-zinc-500 pt-2 px-1">
          <span>Respuestas basadas exclusivamente en operaciones verificadas. Sin alucinaciones de capital.</span>
          <span>Shift + Enter para salto de línea</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Basic markdown parser for bold, italics and bullet lines.
 */
function formatSimpleMarkdown(text: string): React.ReactNode {
  // Check if bullet point
  const isBullet = /^\s*[-*•]\s+/.test(text);
  const cleanLine = isBullet ? text.replace(/^\s*[-*•]\s+/, '') : text;

  // Split bold **text**
  const boldParts = cleanLine.split(/(\*\*[^*]+\*\*)/g);

  const formatted = boldParts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={`b-${idx}`} className="text-zinc-100 font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });

  if (isBullet) {
    return (
      <span className="block pl-3 text-zinc-300">
        <span className="text-cyan-400 mr-1.5">•</span>
        {formatted}
      </span>
    );
  }

  return formatted;
}
