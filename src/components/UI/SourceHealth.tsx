import { useState } from 'react';
import { GlassCard } from '@/components/UI/GlassCard';
import { AlertIcon } from '@/components/UI/icons';
import { useSourceHealth, type SourceHealthEntry } from '@/hooks/useSourceHealth';
import { useStore } from '@/store/useStore';

const STATUS_META: Record<SourceHealthEntry['status'], { dot: string; label: string; color: string }> = {
  healthy: { dot: '✅', label: 'OK', color: 'var(--accent-green)' },
  degraded: { dot: '⚠️', label: 'Low', color: 'var(--accent-yellow)' },
  dead: { dot: '🔴', label: 'Dead', color: 'var(--accent-red)' },
  unknown: { dot: '○', label: '—', color: 'var(--text-secondary)' },
};

/**
 * Top-of-view warning banner shown only when one or more scraper sources look
 * silently broken (healthy history, now zero rows for consecutive runs).
 * Derived from persisted scrape logs — dismissible per session.
 */
export function SourceHealthBanner() {
  const { dead } = useSourceHealth();
  const setView = useStore((s) => s.setView);
  const [dismissed, setDismissed] = useState(false);
  if (dead.length === 0 || dismissed) return null;

  const names = dead.map((d) => d.label).join(', ');
  return (
    <div
      // Row layout squeezed the message into a ~120px column on a phone (1–2 words
      // per line). Stack it: message first, actions on their own row.
      className="mb-4 flex flex-col gap-3 rounded-xl px-4 py-3 text-sm md:mb-5 md:flex-row md:flex-wrap md:items-center"
      style={{
        background: 'color-mix(in srgb, var(--accent-red) 12%, transparent)',
        border: '1px solid color-mix(in srgb, var(--accent-red) 40%, transparent)',
      }}
    >
      <span className="flex min-w-0 flex-1 items-start gap-3">
        <span className="shrink-0 pt-0.5" style={{ color: 'var(--accent-red)' }}>
          <AlertIcon size={18} />
        </span>
        <span className="min-w-0">
          <span className="font-bold" style={{ color: 'var(--accent-red)' }}>
            {dead.length} scraper source{dead.length === 1 ? '' : 's'} may be broken:
          </span>{' '}
          <span className="text-secondary">{names} returned zero rows for multiple consecutive scrapes.</span>
        </span>
      </span>
      <div className="flex shrink-0 items-center gap-2">
        <button className="btn flex-1 md:flex-none" style={{ minHeight: 44 }} onClick={() => setView('settings')}>
          View sources
        </button>
        <button
          className="icon-btn shrink-0"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          title="Dismiss for this session"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

/** Compact per-source health panel — last rows, rolling median, status. */
export function SourceHealthPanel() {
  const { entries } = useSourceHealth();
  const hasData = entries.some((e) => e.status !== 'unknown');

  return (
    <GlassCard className="px-4 py-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wide text-secondary">Source Health</h3>
        <span className="text-[10px] text-secondary">last · median · status</span>
      </div>
      {!hasData ? (
        <div className="py-1 text-xs text-secondary">No scrape sessions recorded yet.</div>
      ) : (
        <div className="grid grid-cols-1 gap-x-4 gap-y-0.5 sm:grid-cols-2">
          {entries.map((e) => {
            const meta = STATUS_META[e.status];
            return (
              <div
                key={e.key}
                className="flex items-center gap-2 border-t py-1 text-xs"
                style={{ borderColor: 'var(--border-glass)' }}
              >
                <span className="min-w-0 flex-1 truncate font-medium" title={e.label}>
                  {e.label}
                </span>
                <span className="w-8 shrink-0 text-right tabular-nums">
                  {e.lastRows == null ? '—' : e.lastRows}
                </span>
                <span className="w-8 shrink-0 text-right tabular-nums text-secondary">
                  {e.status === 'unknown' ? '—' : e.median}
                </span>
                <span
                  className="w-14 shrink-0 text-right font-semibold tabular-nums"
                  style={{ color: meta.color }}
                  title={
                    e.status === 'dead' && e.consecutiveZeroRuns > 0
                      ? `${meta.label} (${e.consecutiveZeroRuns} zero runs)`
                      : meta.label
                  }
                >
                  {meta.dot}
                  {e.status === 'dead' && e.consecutiveZeroRuns > 0 ? ` ${e.consecutiveZeroRuns}` : ''}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </GlassCard>
  );
}
