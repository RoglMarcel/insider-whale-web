import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '@/store/useStore';
import { useSignals } from '@/hooks/useSignals';
import { ThemeToggle } from '@/components/UI/ThemeToggle';
import { VixIndicator } from '@/components/UI/VixIndicator';
import { RefreshIcon, BellIcon } from '@/components/UI/icons';
import { timeAgo } from '@/lib/format';

const VIEW_META: Record<string, { title: string; subtitle: string }> = {
  dashboard: { title: 'Alerts', subtitle: 'Ranked insider & whale conviction signals' },
  news: { title: 'Live News Feed', subtitle: 'Real-time alerts and research from @WhaleInsider' },
  watchlist: { title: 'Watchlist', subtitle: 'Your saved tickers with live scores' },
  history: { title: 'History', subtitle: 'Past scrape sessions & score trends' },
  settings: { title: 'Settings', subtitle: 'Schedule, filters, sources & data' },
};

export function Header() {
  const view = useStore((s) => s.view);
  const signals = useStore((s) => s.signals);
  const openSignal = useStore((s) => s.openSignal);
  const { scrapeStatus, lastScrapeAt, refresh } = useSignals();
  const meta = VIEW_META[view] ?? VIEW_META.dashboard;
  const running = scrapeStatus.running;

  const [bellOpen, setBellOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);

  const highSignals = useMemo(
    () =>
      signals
        .filter((s) => s.convictionLevel === 'HIGH')
        .slice()
        .sort((a, b) => b.score - a.score),
    [signals],
  );

  useEffect(() => {
    if (!bellOpen) return;
    const onDown = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setBellOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setBellOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [bellOpen]);

  return (
    <header className="flex items-center gap-4 px-8 py-5 select-none" style={{ WebkitAppRegion: 'drag' } as any}>
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl font-extrabold tracking-tight">{meta.title}</h1>
        <p className="truncate text-sm text-secondary">{meta.subtitle}</p>
      </div>

      {/* Live scrape phase */}
      {running && (
        <div className="hidden items-center gap-2 text-sm text-secondary md:flex">
          <span className="h-2 w-2 animate-pulse rounded-full" style={{ background: 'var(--accent-blue)' }} />
          <span className="max-w-[16rem] truncate">{scrapeStatus.phase}</span>
          {scrapeStatus.totalSources > 0 && (
            <span className="tabular-nums">
              ({scrapeStatus.completedSources.length}/{scrapeStatus.totalSources})
            </span>
          )}
        </div>
      )}

      {/* Last scrape */}
      <div className="hidden text-right sm:block">
        <div className="text-xs uppercase tracking-wide text-secondary">Last scrape</div>
        <div className="text-sm font-semibold">{timeAgo(lastScrapeAt)}</div>
      </div>

      {/* Interactive controls */}
      <div className="flex items-center gap-4" style={{ WebkitAppRegion: 'no-drag' } as any}>
        {/* Notification bell — HIGH conviction list */}
        <div className="relative" ref={bellRef}>
          <button
            type="button"
            className="icon-btn relative"
            title={`${highSignals.length} high-conviction signals`}
            aria-label="Notifications"
            aria-expanded={bellOpen}
            onClick={() => setBellOpen((o) => !o)}
          >
            <BellIcon size={18} />
            {highSignals.length > 0 && (
              <span
                className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1 text-[11px] font-bold text-white"
                style={{ background: 'var(--accent-red)' }}
              >
                {highSignals.length}
              </span>
            )}
          </button>
          {bellOpen && (
            <div
              className="absolute right-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-xl shadow-lg"
              style={{
                background: 'var(--bg-elevated, var(--bg-card, #1a1a1e))',
                border: '1px solid var(--border-glass)',
              }}
            >
              <div className="px-3 py-2 text-xs font-bold uppercase tracking-wide text-secondary" style={{ borderBottom: '1px solid var(--border-glass)' }}>
                High conviction
              </div>
              {highSignals.length === 0 ? (
                <div className="px-3 py-4 text-sm text-secondary">No high-conviction signals</div>
              ) : (
                <ul className="max-h-80 overflow-y-auto">
                  {highSignals.map((s) => (
                    <li key={s.ticker}>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-white/5"
                        onClick={() => {
                          setBellOpen(false);
                          openSignal(s.ticker);
                        }}
                      >
                        <span className="font-bold tabular-nums">{s.ticker}</span>
                        <span className="tabular-nums font-semibold" style={{ color: 'var(--accent-green)' }}>
                          {s.score.toFixed(0)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <VixIndicator />

        <ThemeToggle />

        {/* Manual refresh */}
        <button className="btn btn-primary" onClick={() => refresh()} disabled={running}>
          <RefreshIcon size={16} className={running ? 'animate-spin' : ''} />
          {running ? 'Scraping…' : 'Refresh'}
        </button>
      </div>
    </header>
  );
}
