import type { MouseEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import { useWatchlist } from '@/hooks/useWatchlist';
import { useStore } from '@/store/useStore';
import { GlassCard } from '@/components/UI/GlassCard';
import { ScoreGauge } from '@/components/UI/ScoreGauge';
import { ConvictionBadge } from '@/components/UI/ConvictionBadge';
import { StarIcon, TrashIcon } from '@/components/UI/icons';
import { formatUSD, timeAgo, formatDateTime } from '@/lib/format';
import { api } from '@/lib/ipc';
import type { Signal } from '@/types';

const ACCENT_BLUE = '#0a84ff';
const GRID = 'rgba(128,128,128,0.2)';

export function WatchlistView() {
  const { watchlist, removeWatch } = useWatchlist();
  const openSignal = useStore((s) => s.openSignal);

  const [selectedTicker, setSelectedTicker] = useState<string>('');
  const [history, setHistory] = useState<Signal[]>([]);

  useEffect(() => {
    if (watchlist.length > 0) {
      if (!watchlist.some((w) => w.ticker === selectedTicker)) {
        setSelectedTicker(watchlist[0].ticker);
      }
    } else {
      setSelectedTicker('');
    }
  }, [watchlist, selectedTicker]);

  useEffect(() => {
    if (!selectedTicker) {
      setHistory([]);
      return;
    }
    let active = true;
    api.signals
      .getHistory(selectedTicker)
      .then((h) => active && setHistory(h))
      .catch(() => active && setHistory([]));
    return () => {
      active = false;
    };
  }, [selectedTicker]);

  const chartData = useMemo(
    () =>
      history.map((h) => ({
        time: formatDateTime(h.scrapedAt),
        score: h.score,
      })),
    [history],
  );

  if (watchlist.length === 0) {
    return (
      <GlassCard className="animate-fade-in flex flex-col items-center justify-center gap-3 px-6 py-20 text-center">
        <div
          className="flex h-16 w-16 items-center justify-center rounded-2xl"
          style={{ background: 'var(--bg-glass)', color: 'var(--accent-yellow)' }}
        >
          <StarIcon size={28} />
        </div>
        <div className="text-lg font-bold">Your watchlist is empty</div>
        <p className="max-w-md text-sm text-secondary">
          Star any signal on the dashboard to track it here with a live conviction score.
        </p>
      </GlassCard>
    );
  }

  return (
    <div className="animate-fade-in flex flex-col gap-6">
      {/* Watchlist cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {watchlist.map((item) => {
          const signal = item.signal;
          const onRemove = (e: MouseEvent) => {
            e.stopPropagation();
            void removeWatch(item.ticker);
          };
          return (
            <GlassCard
              key={item.ticker}
              hover
              onClick={() => openSignal(item.ticker)}
              className="flex items-center gap-4 p-5"
            >
              {signal ? (
                <ScoreGauge score={signal.score} size={64} stroke={7} />
              ) : (
                <div
                  className="flex h-16 w-16 items-center justify-center rounded-full text-xs text-secondary"
                  style={{ border: '2px dashed var(--border-glass)' }}
                >
                  N/A
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="text-lg font-extrabold">{item.ticker}</div>
                <div className="truncate text-xs text-secondary">
                  {signal?.companyName || 'Added ' + timeAgo(item.addedAt)}
                </div>
                <div className="mt-1.5">
                  {signal ? (
                    <ConvictionBadge level={signal.convictionLevel} />
                  ) : (
                    <span className="text-xs text-secondary">No signal in latest scrape</span>
                  )}
                </div>
                {signal && (
                  <div className="mt-1 text-xs text-secondary">{formatUSD(signal.totalDollarVolume)} insider buys</div>
                )}
              </div>
              <button className="icon-btn h-9 w-9" onClick={onRemove} title="Remove from watchlist">
                <TrashIcon size={16} />
              </button>
            </GlassCard>
          );
        })}
      </div>

      {/* Score Trend Card */}
      <GlassCard className="p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-bold uppercase tracking-wide text-secondary">Score Trend</h3>
          <div className="flex flex-wrap gap-1.5">
            {watchlist.map((w) => (
              <button
                key={w.ticker}
                onClick={() => setSelectedTicker(w.ticker)}
                className="rounded-lg px-2.5 py-1 text-xs font-semibold transition-all"
                style={
                  w.ticker === selectedTicker
                    ? { background: ACCENT_BLUE, color: '#fff' }
                    : { background: 'var(--bg-glass)', color: 'var(--text-secondary)', border: '1px solid var(--border-glass)' }
                }
              >
                {w.ticker}
              </button>
            ))}
          </div>
        </div>

        {chartData.length > 1 ? (
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <LineChart data={chartData} margin={{ top: 10, right: 16, left: -8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                <XAxis dataKey="time" tick={{ fontSize: 11 }} stroke={GRID} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} stroke={GRID} />
                <Tooltip />
                <ReferenceLine y={80} stroke="#30d158" strokeDasharray="4 4" />
                <ReferenceLine y={50} stroke="#ffd60a" strokeDasharray="4 4" />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke={ACCENT_BLUE}
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: ACCENT_BLUE }}
                  activeDot={{ r: 5 }}
                  isAnimationActive
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="py-16 text-center text-sm text-secondary">
            {selectedTicker
              ? `Not enough history for ${selectedTicker} yet — run more scrapes to build a trend.`
              : 'Add stocks to your watchlist to track their score trend.'}
          </div>
        )}
      </GlassCard>
    </div>
  );
}
