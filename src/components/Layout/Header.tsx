import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '@/store/useStore';
import { useSignals } from '@/hooks/useSignals';
import { LanguageToggle } from '@/components/UI/LanguageToggle';
import { VixIndicator } from '@/components/UI/VixIndicator';
import { RefreshIcon, BellIcon } from '@/components/UI/icons';
import { timeAgo } from '@/lib/format';
import { isWeb } from '@/lib/ipc';
import { useI18n } from '@/hooks/useI18n';
import type { TKey } from '@/lib/i18n';

const VIEW_META: Record<string, { title: TKey; subtitle: TKey }> = {
  dashboard: { title: 'view.dashboard.title', subtitle: 'view.dashboard.subtitle' },
  news: { title: 'view.news.title', subtitle: 'view.news.subtitle' },
  watchlist: { title: 'view.watchlist.title', subtitle: 'view.watchlist.subtitle' },
  history: { title: 'view.history.title', subtitle: 'view.history.subtitle' },
  settings: { title: 'view.settings.title', subtitle: 'view.settings.subtitle' },
};

export function Header({ onMenuClick }: { onMenuClick?: () => void }) {
  const view = useStore((s) => s.view);
  const signals = useStore((s) => s.signals);
  const openSignal = useStore((s) => s.openSignal);
  const { scrapeStatus, lastScrapeAt, refresh } = useSignals();
  const { t, language } = useI18n();
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
    <header
      className="flex items-center gap-2 px-4 py-3 select-none lg:gap-4 lg:px-8 lg:py-5"
      // Drag regions only mean something in an Electron frame; in the browser they
      // are inert and can swallow pointer interaction.
      style={isWeb ? undefined : ({ WebkitAppRegion: 'drag' } as any)}
    >
      {/* Hamburger — drawer only exists in the md–lg band; below md the bottom tab
          bar navigates directly, so the trigger would be dead weight. */}
      <button
        type="button"
        className="icon-btn hidden shrink-0 md:inline-flex lg:hidden"
        aria-label={t('nav.openMenu')}
        onClick={() => onMenuClick?.()}
        style={isWeb ? undefined : ({ WebkitAppRegion: 'no-drag' } as any)}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M3 6h18M3 12h18M3 18h18" />
        </svg>
      </button>

      <div className="min-w-0 flex-1">
        <h1 className="truncate text-xl font-extrabold tracking-tight lg:text-2xl">{t(meta.title)}</h1>
        {/* The subtitle only ever truncated on a phone; it earns its line from md up. */}
        <p className="hidden truncate text-xs text-secondary md:block lg:text-sm">{t(meta.subtitle)}</p>
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

      {/* Data freshness. On the hosted build this is the ONLY cue for how old the
          data is (the client never scrapes and the Refresh button is hidden), so
          it must survive on a phone — previously it was `hidden sm:block`. */}
      <div className="shrink-0 text-right">
        <div className="hidden text-xs uppercase tracking-wide text-secondary sm:block">{t('header.lastScrape')}</div>
        <div className="text-xs font-semibold tabular-nums sm:text-sm">{timeAgo(lastScrapeAt, language)}</div>
      </div>

      {/* Interactive controls */}
      <div className="flex items-center gap-2 lg:gap-4" style={isWeb ? undefined : ({ WebkitAppRegion: 'no-drag' } as any)}>
        {/* Notification bell — HIGH conviction list */}
        <div className="relative" ref={bellRef}>
          <button
            type="button"
            className="icon-btn relative"
            title={t('header.highSignalsTitle', { count: highSignals.length })}
            aria-label={t('header.notifications')}
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
                {t('header.highConviction')}
              </div>
              {highSignals.length === 0 ? (
                <div className="px-3 py-4 text-sm text-secondary">{t('header.noHighConviction')}</div>
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

        <LanguageToggle />

        {/* Manual refresh — desktop/Electron only. On the web the data comes from
            the scheduled GitHub Actions scrape, so an in-app refresh does nothing. */}
        {!isWeb && (
          <button className="btn btn-primary shrink-0" onClick={() => refresh()} disabled={running}>
            <RefreshIcon size={16} className={running ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">{running ? t('header.scraping') : t('header.refresh')}</span>
          </button>
        )}
      </div>
    </header>
  );
}
