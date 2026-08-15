import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '@/store/useStore';
import { useWatchlist } from '@/hooks/useWatchlist';
import { type Signal, type InsiderTrackRecord, type SignalPerformance, type NewsItem, classifyTransaction, normalizeInsiderName } from '@/types';
import { api } from '@/lib/ipc';
import { ScoreGauge } from '@/components/UI/ScoreGauge';
import { ConvictionBadge } from '@/components/UI/ConvictionBadge';
import { ComboBadge } from '@/components/UI/ComboBadge';
import { PoliticianComboBadge, MegaSignalBanner } from '@/components/UI/PoliticianBadges';
import { ScoreBreakdown } from './ScoreBreakdown';
import { InsiderTable } from './InsiderTable';
import { InsiderAccuracyPanel, type PanelInsider } from './InsiderAccuracyPanel';
import { OptionsFlow } from './OptionsFlow';
import { ValuationSection } from './ValuationSection';
import { XIcon, StarIcon, UsersIcon } from '@/components/UI/icons';
import { formatUSD, formatDate, accuracyColor, formatPercent } from '@/lib/format';

function getTradingViewSymbol(ticker: string): string {
  const base = ticker.replace('$', '').split('-')[0].trim().toUpperCase();
  const cryptoMap: Record<string, string> = {
    'BTC': 'BTCUSD',
    'ETH': 'ETHUSD',
    'SOL': 'SOLUSD',
    'ADA': 'ADAUSD',
    'XRP': 'XRPUSD',
    'DOGE': 'DOGEUSD',
    'DOT': 'DOTUSD',
    'LTC': 'LTCUSD',
    'LINK': 'LINKUSD',
    'AVAX': 'AVAXUSD',
    'SHIB': 'SHIBUSD',
    'BNB': 'BNBUSD'
  };
  return cryptoMap[base] || base;
}

function TradingViewChart({ ticker, theme }: { ticker: string; theme: string }) {
  const symbol = getTradingViewSymbol(ticker);
  return (
    <div 
      className="w-full overflow-hidden rounded-xl"
      style={{ 
        height: '550px',
        border: '1px solid var(--border-glass)',
        background: 'var(--bg-glass)',
        boxShadow: 'var(--shadow-glass)'
      }}
    >
      <iframe
        src={`https://s.tradingview.com/widgetembed/?symbol=${symbol}&theme=${theme}&style=1&timezone=exchange&interval=D&withdateranges=1&details=1&hide_side_toolbar=0&allow_symbol_change=1`}
        style={{ width: '100%', height: '100%', border: 'none' }}
        title={`TradingView Chart for ${symbol}`}
      />
    </div>
  );
}

function InfoCell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-xl px-3 py-2" style={{ background: 'var(--bg-glass)', border: '1px solid var(--border-glass)' }}>
      <div className="text-[11px] uppercase tracking-wide text-secondary">{label}</div>
      <div className="text-sm font-semibold">{children}</div>
    </div>
  );
}

export function SignalModal() {
  const theme = useStore((s) => s.theme);
  const selectedTicker = useStore((s) => s.selectedTicker);
  const chartOnly = useStore((s) => s.chartOnly);
  const closeSignal = useStore((s) => s.closeSignal);
  const storeSignals = useStore((s) => s.signals);
  const fetchTrackRecord = useStore((s) => s.fetchTrackRecord);
  const loadSignals = useStore((s) => s.loadSignals);
  const { isWatched, toggleWatch } = useWatchlist();
  const [signal, setSignal] = useState<Signal | null>(null);
  const [loadingSignal, setLoadingSignal] = useState(true);
  const [records, setRecords] = useState<Record<string, InsiderTrackRecord>>({});
  const [trLoading, setTrLoading] = useState(false);
  const fetchedRef = useRef<string | null>(null);

  const [localEarningsDate, setLocalEarningsDate] = useState<string | null>(null);
  const [localDaysToEarnings, setLocalDaysToEarnings] = useState<number | null>(null);
  const [localEarningsTiming, setLocalEarningsTiming] = useState<string | null>(null);
  const [performance, setPerformance] = useState<SignalPerformance | null>(null);
  const [tickerNews, setTickerNews] = useState<NewsItem[]>([]);

  useEffect(() => {
    if (!selectedTicker) {
      setSignal(null);
      setLoadingSignal(false);
      return;
    }
    if (chartOnly) {
      setSignal(null);
      setLoadingSignal(false);
      return;
    }
    setLoadingSignal(true);
    const local = storeSignals.find((s) => s.ticker === selectedTicker);
    if (local) {
      setSignal(local);
      setLoadingSignal(false);
    } else {
      setSignal(null);
    }
    let active = true;
    api.signals
      .getByTicker(selectedTicker)
      .then((s) => {
        if (active) {
          if (s) {
            setSignal(s);
          } else {
            setSignal(null);
          }
          setLoadingSignal(false);
        }
      })
      .catch(() => {
        if (active) {
          setSignal(null);
          setLoadingSignal(false);
        }
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTicker, chartOnly]);

  useEffect(() => {
    if (signal) {
      setLocalEarningsDate(signal.earningsDate ?? null);
      setLocalDaysToEarnings(signal.daysToEarnings ?? null);
      setLocalEarningsTiming(signal.earningsTiming ?? null);
    } else {
      setLocalEarningsDate(null);
      setLocalDaysToEarnings(null);
      setLocalEarningsTiming(null);
    }
  }, [signal]);

  useEffect(() => {
    if (!signal || signal.earningsDate) return;
    let active = true;
    api.earnings
      .fetch(signal.ticker)
      .then((res) => {
        if (active && res.earningsDate) {
          setLocalEarningsDate(res.earningsDate);
          if (res.daysToEarnings !== undefined) setLocalDaysToEarnings(res.daysToEarnings ?? null);
          if (res.earningsTiming !== undefined) setLocalEarningsTiming(res.earningsTiming ?? null);
          void loadSignals();
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [signal, loadSignals]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeSignal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeSignal]);

  // Feature 2 + 7 — "follow this signal" P&L and ticker-tagged news.
  useEffect(() => {
    if (!selectedTicker || chartOnly) {
      setPerformance(null);
      setTickerNews([]);
      return;
    }
    let active = true;
    api.signals.getPerformance(selectedTicker).then((p) => active && setPerformance(p)).catch(() => undefined);
    api.news.getForTicker(selectedTicker).then((n) => active && setTickerNews(n)).catch(() => undefined);
    return () => {
      active = false;
    };
  }, [selectedTicker, chartOnly]);

  // Unique scoring-eligible insiders on this signal (for track records).
  const insiders = useMemo<(PanelInsider & { url?: string; role?: string })[]>(() => {
    if (!signal) return [];
    const map = new Map<string, PanelInsider & { url?: string; role?: string }>();
    for (const t of signal.rawTrades) {
      if (classifyTransaction(t.transactionType).modifier <= 0) continue;
      const key = normalizeInsiderName(t.insiderName);
      if (!key || map.has(key)) continue;
      map.set(key, { name: t.insiderName, role: t.role, key, url: t.insiderUrl });
    }
    return [...map.values()];
  }, [signal]);

  // Feature 6 — lazily fetch track records once per ticker.
  useEffect(() => {
    if (!signal) {
      fetchedRef.current = null;
      setRecords({});
      setTrLoading(false);
      return;
    }
    if (fetchedRef.current === signal.ticker) return;
    const ticker = signal.ticker;
    fetchedRef.current = ticker;
    setRecords({});
    if (insiders.length === 0) return;
    setTrLoading(true);
    void Promise.all(
      insiders.map(async (ins) => {
        const fallbackRec: InsiderTrackRecord = {
          insiderName: ins.name,
          insiderRole: ins.role || null,
          totalTrades: 0,
          profitable3m: 0,
          profitable6m: 0,
          accuracy3m: 0,
          accuracy6m: 0,
          avgReturn3m: 0,
          lastUpdated: new Date().toISOString(),
          recentTrades: [],
          error: 'Track record data unavailable',
        };
        const rec = await fetchTrackRecord(ins.name, ins.role, ins.url).catch(() => null);
        if (fetchedRef.current === ticker) {
          setRecords((prev) => ({ ...prev, [ins.key]: rec || fallbackRec }));
        }
      }),
    ).finally(() => {
      if (fetchedRef.current === ticker) {
        setTrLoading(false);
      }
    });
  }, [signal, insiders, fetchTrackRecord]);

  const best = useMemo(() => {
    let top: InsiderTrackRecord | null = null;
    for (const ins of insiders) {
      const rec = records[ins.key];
      if (rec && rec.totalTrades > 0 && (!top || rec.accuracy3m > top.accuracy3m)) top = rec;
    }
    return top;
  }, [records, insiders]);

  if (!selectedTicker) return null;
  const watched = isWatched(selectedTicker);
  const earningsFill =
    localDaysToEarnings != null && localDaysToEarnings >= 0 && localDaysToEarnings <= 30
      ? (30 - localDaysToEarnings) / 30
      : 0;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4"
      style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)' }}
      onClick={closeSignal}
    >
      <div
        className="glass animate-scale-in flex max-h-[95vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl sm:max-h-[88vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-4 px-6 py-5" style={{ borderBottom: '1px solid var(--border-glass)' }}>
          {!chartOnly && signal && <ScoreGauge score={signal.score} size={72} stroke={7} />}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-extrabold font-mono-terminal">{selectedTicker}</h2>
              {!chartOnly && signal?.bigPlayer && (
                <span
                  className="inline-flex items-center gap-0.5 px-2 py-0.5 text-[10px] font-extrabold uppercase rounded select-none shadow-[0_0_12px_rgba(255,179,0,0.45)]"
                  style={{
                    background: 'linear-gradient(135deg, #FFE082 0%, #FFB300 50%, #FFA000 100%)',
                    color: '#000000',
                    border: '1px solid #FFC107',
                    fontWeight: 900,
                    letterSpacing: '0.02em',
                  }}
                >
                  ★ Big Player
                </span>
              )}
              {!chartOnly && signal && <ConvictionBadge level={signal.convictionLevel} />}
              {!chartOnly && signal?.breakdown?.politicianComboTier ? (
                <PoliticianComboBadge tier={signal.breakdown.politicianComboTier} />
              ) : (
                !chartOnly && signal?.comboSignal && <ComboBadge pulse={false} />
              )}
            </div>
            <p className="truncate text-sm text-secondary">
              {!chartOnly && signal?.companyName || `${selectedTicker} Asset Chart`}
              {!chartOnly && signal?.sector ? ` · ${signal.sector}` : ''}
            </p>
            {!chartOnly && signal && (
              <p className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-secondary">
                <span className="inline-flex items-center gap-1">
                  <UsersIcon size={13} /> {signal.insiderCount} insiders
                </span>
                <span>{formatUSD(signal.totalDollarVolume)} bought</span>
                {best && (
                  <span style={{ color: accuracyColor(best.accuracy3m) }}>
                    Top insider: beat S&P on {Math.round(best.accuracy3m * 100)}% of {best.totalTrades} buys (3mo)
                  </span>
                )}
              </p>
            )}
          </div>

          <button
            className="btn"
            onClick={() => void toggleWatch(selectedTicker)}
            style={watched ? { color: 'var(--accent-yellow)' } : undefined}
          >
            <StarIcon size={16} filled={watched} />
            {watched ? 'Watching' : 'Add to Watchlist'}
          </button>
          <button className="icon-btn" onClick={closeSignal} aria-label="Close">
            <XIcon size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-7 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6">
          {chartOnly ? (
            <TradingViewChart ticker={selectedTicker} theme={theme} />
          ) : loadingSignal ? (
            <div className="py-16 flex flex-col items-center justify-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent-blue)] border-t-transparent" />
              <span className="text-xs text-secondary font-medium">Loading signal…</span>
            </div>
          ) : signal ? (
            <>
              {/* Congressional MEGA_SIGNAL — unmissable pulsing banner. */}
              {signal.breakdown?.politicianComboTier === 'MEGA_SIGNAL' && <MegaSignalBanner />}

              {/* Politician combo tiers (purple / blue) — replace the orange COMBO banner. */}
              {signal.breakdown?.politicianComboTier === 'POLITICIAN_INSIDER' && (
                <div
                  className="rounded-xl px-4 py-3 text-sm font-semibold"
                  style={{
                    color: 'var(--accent-purple)',
                    background: 'color-mix(in srgb, var(--accent-purple) 14%, transparent)',
                    border: '1px solid color-mix(in srgb, var(--accent-purple) 35%, transparent)',
                  }}
                >
                  🏛️ + 👔 POLITICIAN + INSIDER — congressional buying alongside insider buying
                </div>
              )}
              {signal.breakdown?.politicianComboTier === 'POLITICIAN_OPTIONS' && (
                <div
                  className="rounded-xl px-4 py-3 text-sm font-semibold"
                  style={{
                    color: 'var(--accent-blue)',
                    background: 'color-mix(in srgb, var(--accent-blue) 14%, transparent)',
                    border: '1px solid color-mix(in srgb, var(--accent-blue) 35%, transparent)',
                  }}
                >
                  🏛️ + 🐋 POLITICIAN + OPTIONS — congressional buying alongside unusual bullish flow
                </div>
              )}

              {/* Feature 4 — regular combo banner (only when no politician tier fired). */}
              {signal.comboSignal && !signal.breakdown?.politicianComboTier && (
                <div
                  className="rounded-xl px-4 py-3 text-sm font-semibold"
                  style={{
                    color: 'var(--accent-blue)',
                    background: 'color-mix(in srgb, var(--accent-blue) 14%, transparent)',
                    border: '1px solid color-mix(in srgb, var(--accent-blue) 35%, transparent)',
                  }}
                >
                  ⚡ COMBO SIGNAL DETECTED — Insider Buying + Unusual Options Flow on the same ticker
                </div>
              )}

              {/* Feature 13 — net bearish options flow */}
              {(signal.breakdown?.optionsScore ?? 0) < 0 && (
                <div
                  className="rounded-xl px-4 py-3 text-sm font-semibold"
                  style={{
                    color: 'var(--accent-red)',
                    background: 'color-mix(in srgb, var(--accent-red) 12%, transparent)',
                    border: '1px solid color-mix(in srgb, var(--accent-red) 30%, transparent)',
                  }}
                >
                  🐻 NET BEARISH OPTIONS FLOW — put-dominated activity is weighing on this signal
                </div>
              )}

              {/* Features 1 + 5 — dates & earnings */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <InfoCell label="Trade Date">{formatDate(signal.tradeDate)}</InfoCell>
                <InfoCell label="Filing Date">
                  <span className="inline-flex items-center gap-1">
                    {formatDate(signal.filingDate)}
                    {signal.lateFiling && (
                      <span title="Filed unusually late after the trade — potentially suspicious">⚠️</span>
                    )}
                  </span>
                </InfoCell>
                <InfoCell label="Earnings">
                  {localEarningsDate ? (
                    <div>
                       <div>
                         {formatDate(localEarningsDate)}
                         {localEarningsTiming ? ` · ${localEarningsTiming}` : ''}
                         {localDaysToEarnings != null && localDaysToEarnings >= 0 ? ` (${localDaysToEarnings}d)` : ''}
                       </div>
                       {earningsFill > 0 && (
                         <div className="mt-1 h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--border-glass)' }}>
                           <div className="h-full rounded-full" style={{ width: `${earningsFill * 100}%`, background: 'var(--accent-yellow)' }} />
                         </div>
                       )}
                    </div>
                  ) : (
                    <span className="text-secondary">—</span>
                  )}
                </InfoCell>
              </div>

              {/* Feature 2 — "follow this signal" P&L since the signal first appeared */}
              {performance && performance.returnPct != null && (
                <div
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl px-4 py-3 text-sm"
                  style={{ background: 'var(--bg-glass)', border: '1px solid var(--border-glass)' }}
                >
                  <span className="text-secondary">Since signal ({formatDate(performance.sinceDate)}):</span>
                  <span
                    className="font-bold tabular-nums"
                    style={{ color: (performance.returnPct ?? 0) >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}
                  >
                    {formatPercent(performance.returnPct)}
                  </span>
                  {performance.alphaPct != null && (
                    <span
                      className="text-xs tabular-nums"
                      style={{ color: performance.alphaPct >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}
                    >
                      {formatPercent(performance.alphaPct)} vs S&P
                    </span>
                  )}
                </div>
              )}

              {/* TradingView Chart */}
              <TradingViewChart ticker={selectedTicker} theme={theme} />

              <ScoreBreakdown
                breakdown={signal.breakdown}
                insiderFlow={signal.insiderFlow}
                stats={signal.stats}
                politicianTrades={signal.politicianTrades}
              />
              <InsiderAccuracyPanel insiders={insiders} records={records} loading={trLoading} />
              <InsiderTable trades={signal.rawTrades} trackRecords={records} loading={trLoading} />
              <OptionsFlow options={signal.optionsActivity} />
              <ValuationSection ticker={selectedTicker} />

              {/* Feature 7 — news mentioning this ticker */}
              {tickerNews.length > 0 && (
                <section>
                  <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-secondary">Recent Mentions</h3>
                  <div className="flex flex-col gap-2">
                    {tickerNews.slice(0, 5).map((n) => (
                      <a
                        key={n.id}
                        href={n.url}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-xl px-4 py-2.5 text-sm hover:opacity-80"
                        style={{ background: 'var(--bg-glass)', border: '1px solid var(--border-glass)' }}
                      >
                        <div>{n.text}</div>
                        <div className="mt-1 text-[11px] text-secondary">{formatDate(n.timestamp)} · @WhaleInsider</div>
                      </a>
                    ))}
                  </div>
                </section>
              )}
            </>
          ) : (
            <TradingViewChart ticker={selectedTicker} theme={theme} />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
