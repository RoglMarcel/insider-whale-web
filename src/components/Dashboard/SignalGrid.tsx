import type { Signal } from '@/types';
import { SignalCard } from './SignalCard';
import { GlassCard } from '@/components/UI/GlassCard';
import { useStore } from '@/store/useStore';
import { useSignals } from '@/hooks/useSignals';
import { SearchIcon, RefreshIcon } from '@/components/UI/icons';

export function SignalGrid({ signals, hasSearchQuery }: { signals: Signal[]; hasSearchQuery?: boolean }) {
  const { scrapeStatus, refresh } = useSignals();
  const totalSignals = useStore((s) => s.signals.length);

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
              ? 'No signals yet'
              : hasSearchQuery
              ? 'No signals match your search'
              : 'No signals match this filter'}
          </div>
          <p className="mx-auto mt-1 max-w-md text-sm text-secondary">
            {totalSignals === 0
              ? 'Run a scrape to pull the latest insider buys and unusual options flow, score them, and rank by conviction.'
              : hasSearchQuery
              ? 'Try searching for a different ticker, company, or insider name.'
              : 'Try a different conviction filter to see more results.'}
          </p>
        </div>
        {totalSignals === 0 && (
          <button className="btn btn-primary" onClick={() => refresh()} disabled={scrapeStatus.running}>
            <RefreshIcon size={16} className={scrapeStatus.running ? 'animate-spin' : ''} />
            {scrapeStatus.running ? 'Scraping…' : 'Run first scrape'}
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
