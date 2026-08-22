import type { Signal } from '@/types';
import { SignalCard } from './SignalCard';
import { GlassCard } from '@/components/UI/GlassCard';
import { useStore } from '@/store/useStore';
import { useSignals } from '@/hooks/useSignals';
import { SearchIcon, RefreshIcon } from '@/components/UI/icons';
import { useI18n } from '@/hooks/useI18n';

export function SignalGrid({ signals, hasSearchQuery }: { signals: Signal[]; hasSearchQuery?: boolean }) {
  const { scrapeStatus, refresh } = useSignals();
  const totalSignals = useStore((s) => s.signals.length);
  const { t } = useI18n();

  if (signals.length === 0) {
    return (
      <GlassCard className="flex flex-col items-center justify-center gap-4 px-6 py-20 text-center">
        <div
          className="flex h-16 w-16 items-center justify-center rounded-2xl text-secondary"
          style={{ background: 'var(--bg-glass)' }}
        >
          <SearchIcon size={28} />
        </div>
        <div>
          <div className="text-lg font-bold">
            {totalSignals === 0
              ? t('grid.noSignalsYet')
              : hasSearchQuery
              ? t('grid.noSearchMatch')
              : t('grid.noFilterMatch')}
          </div>
          <p className="mx-auto mt-1 max-w-md text-sm text-secondary">
            {totalSignals === 0
              ? t('grid.noSignalsYetHint')
              : hasSearchQuery
              ? t('grid.noSearchMatchHint')
              : t('grid.noFilterMatchHint')}
          </p>
        </div>
        {totalSignals === 0 && (
          <button className="btn btn-primary" onClick={() => refresh()} disabled={scrapeStatus.running}>
            <RefreshIcon size={16} className={scrapeStatus.running ? 'animate-spin' : ''} />
            {scrapeStatus.running ? t('header.scraping') : t('grid.runFirstScrape')}
          </button>
        )}
      </GlassCard>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {signals.map((signal) => (
        <SignalCard key={signal.ticker} signal={signal} />
      ))}
    </div>
  );
}
