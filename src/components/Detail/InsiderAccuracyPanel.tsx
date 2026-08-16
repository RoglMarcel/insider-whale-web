import type { InsiderTrackRecord, InsiderHistoricalTrade } from '@/types';
import { accuracyColor, formatPercent } from '@/lib/format';

export interface PanelInsider {
  name: string;
  role?: string | null;
  key: string;
}

function Sparkline({ trades }: { trades: InsiderHistoricalTrade[] }) {
  const pts = trades.slice(-8);
  const w = 92;
  const h = 24;
  const n = Math.max(pts.length, 1);
  return (
    <svg width={w} height={h} aria-hidden>
      {pts.map((t, i) => {
        const x = (i / Math.max(n - 1, 1)) * (w - 8) + 4;
        const win = !!t.wasProfitable3m;
        const y = win ? 7 : h - 7;
        return <circle key={i} cx={x} cy={y} r={3} fill={win ? 'var(--accent-green)' : 'var(--accent-red)'} />;
      })}
    </svg>
  );
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <div className="skeleton h-4 w-32" />
      <div className="skeleton ml-auto h-4 w-24" />
      <div className="skeleton h-6 w-24" />
    </div>
  );
}

export function InsiderAccuracyPanel({
  insiders,
  records,
  loading,
}: {
  insiders: PanelInsider[];
  records: Record<string, InsiderTrackRecord>;
  loading: boolean;
}) {
  const loaded = insiders.map((ins) => ({ ins, rec: records[ins.key] }));
  const withData = loaded.filter((x) => x.rec && x.rec.totalTrades > 0);

  // Best insider by 3-month accuracy.
  const best = withData.reduce<{ ins: PanelInsider; rec: InsiderTrackRecord } | null>((acc, cur) => {
    if (!cur.rec) return acc;
    if (!acc || cur.rec.accuracy3m > acc.rec.accuracy3m) return { ins: cur.ins, rec: cur.rec };
    return acc;
  }, null);

  return (
    <section>
      <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-secondary">Insider Track Record</h3>

      <div className="rounded-xl" style={{ border: '1px solid var(--border-glass)' }}>
        {loading && withData.length === 0 ? (
          <div className="px-4 py-1">
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </div>
        ) : loaded.length === 0 ? (
          <div className="px-4 py-5 text-sm text-secondary">No insider history for this signal.</div>
        ) : (
          loaded.map(({ ins, rec }, i) => (
            <div
              key={ins.key}
              className="flex flex-wrap items-center gap-3 px-4 py-3"
              style={i > 0 ? { borderTop: '1px solid var(--border-glass)' } : undefined}
            >
              <div className="min-w-0">
                <div className="font-semibold">{ins.name}</div>
                <div className="flex flex-wrap items-center gap-1">
                  {ins.role && (
                    <span
                      className="rounded-md px-1.5 py-0.5 text-xs"
                      style={{ background: 'var(--bg-glass)', color: 'var(--text-secondary)' }}
                    >
                      {ins.role}
                    </span>
                  )}
                  {rec?.pattern === 'routine' && (
                    <span
                      className="rounded-md px-1.5 py-0.5 text-xs"
                      title="Calendar-clustered buyer — same-month purchases across years are scheduled/habitual and historically carry little information."
                      style={{ background: 'var(--bg-glass)', color: 'var(--text-secondary)' }}
                    >
                      🔁 routine buyer
                    </span>
                  )}
                  {rec?.pattern === 'opportunistic' && (
                    <span
                      className="rounded-md px-1.5 py-0.5 text-xs font-semibold"
                      title="First-ever open-market buy on record — pattern-breaking purchases historically carry the alpha."
                      style={{
                        color: 'var(--accent-green)',
                        background: 'color-mix(in srgb, var(--accent-green) 12%, transparent)',
                      }}
                    >
                      🎯 first buy
                    </span>
                  )}
                </div>
              </div>

              {!rec ? (
                <span className="ml-auto text-sm text-secondary">Loading…</span>
              ) : rec.totalTrades === 0 ? (
                <span className="ml-auto text-sm text-secondary">{rec.error || 'Track record data unavailable'}</span>
              ) : (
                <>
                  <div className="ml-auto text-right">
                    <div className="text-sm font-bold" style={{ color: accuracyColor(rec.accuracy3m) }}>
                      Beat S&P on {rec.profitable3m} of {rec.totalTrades} ({Math.round(rec.accuracy3m * 100)}%)
                    </div>
                    <div
                      className="text-xs font-semibold"
                      style={{ color: rec.avgReturn3m >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}
                    >
                      {formatPercent(rec.avgReturn3m)} avg 3M α (vs S&P)
                    </div>
                  </div>
                  <Sparkline trades={rec.recentTrades} />
                </>
              )}
            </div>
          ))
        )}
      </div>

      {best && (
        <div className="mt-2 text-sm">
          <span className="text-secondary">Best insider on this signal: </span>
          <span className="font-semibold">{best.ins.name}</span>
          <span className="text-secondary"> — </span>
          <span style={{ color: accuracyColor(best.rec.accuracy3m) }}>
            {Math.round(best.rec.accuracy3m * 100)}% market-beat rate
          </span>
          <span className="text-secondary">, {formatPercent(best.rec.avgReturn3m)} avg 3M alpha</span>
        </div>
      )}
      {loaded.some((x) => x.rec && x.rec.totalTrades > 0) && (
        <p className="mt-2 text-xs leading-snug text-secondary">
          Outcomes are split/dividend-adjusted and measured against the S&P 500 over ~3 months. Buys on
          tickers later delisted have no price data and are excluded, so win rates skew optimistic.
        </p>
      )}
    </section>
  );
}
