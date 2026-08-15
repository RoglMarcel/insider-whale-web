import {
  type ScoreBreakdown as Breakdown,
  type InsiderFlowSummary,
  type EquityStatsSummary,
  type PoliticianTrade,
  type PoliticianComboTier,
  daysBetween,
  MAX_INSIDER_TIMING_MULT,
  MAX_OPTIONS_SCORE_TOTAL,
} from '@/types';
import { freshnessMeta, ageLabel, formatUSD, formatCompact, confidenceColor, timeAgo, formatDate, partyMeta } from '@/lib/format';

const POLITICIAN_COMBO_BONUS: Record<PoliticianComboTier, number> = {
  MEGA_SIGNAL: 45,
  POLITICIAN_INSIDER: 25,
  POLITICIAN_OPTIONS: 20,
};
const TIER_COLOR: Record<PoliticianComboTier, string> = {
  MEGA_SIGNAL: 'var(--accent-red)',
  POLITICIAN_INSIDER: 'var(--accent-purple)',
  POLITICIAN_OPTIONS: 'var(--accent-blue)',
};

interface FactorRow {
  label: string;
  display: string;
  fill: number; // 0..1
  color: string;
}

/** Shared left-label / right-value row so every extra section matches the factors. */
function KV({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-secondary">{label}</span>
      <span className="font-semibold tabular-nums text-right" style={color ? { color } : undefined}>
        {value}
      </span>
    </div>
  );
}

/** One politician row: name (party·chamber·committee) — buy/sell · amount · age [disclosure]. */
function PoliticianRow({ t }: { t: PoliticianTrade }) {
  const party = partyMeta(t.party);
  const isBuy = t.transactionType === 'buy';
  const ctx = [t.chamber, t.committee].filter(Boolean).join(' · ');
  const age = daysBetween(t.tradeDate);
  const lateDisclose = t.daysToDisclose > 30;
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-1.5 text-sm">
      <div className="min-w-0">
        <span className="font-semibold">{t.politician || '—'}</span>{' '}
        <span className="text-xs text-secondary">
          (<span className={party.colorClass} style={{ color: party.color }}>{party.initial}</span> · {ctx || '—'})
        </span>
      </div>
      <div className="flex shrink-0 items-baseline gap-2 tabular-nums">
        <span className="font-semibold" style={{ color: isBuy ? 'var(--accent-green)' : 'var(--accent-red)' }}>
          {isBuy ? 'Buy' : 'Sell'} · {formatUSD(t.amountMidpoint)}
        </span>
        <span className="text-xs text-secondary" title={formatDate(t.tradeDate)}>
          {age == null ? '—' : timeAgo(t.tradeDate)}
        </span>
        <span
          className="text-xs"
          style={{ color: lateDisclose ? 'var(--accent-yellow)' : 'var(--text-secondary)' }}
          title={`Disclosed ${t.daysToDisclose} day(s) after the trade`}
        >
          {lateDisclose ? `⚠ disclosed late (${t.daysToDisclose}d)` : `disclosed in ${t.daysToDisclose}d`}
        </span>
      </div>
    </div>
  );
}

export function ScoreBreakdown({
  breakdown,
  insiderFlow,
  stats,
  politicianTrades,
}: {
  breakdown: Breakdown;
  insiderFlow?: InsiderFlowSummary | null;
  stats?: EquityStatsSummary | null;
  politicianTrades?: PoliticianTrade[] | null;
}) {
  const b = breakdown;
  const fresh = freshnessMeta(b.signalAgeDays);

  const factors: FactorRow[] = [
    { label: 'Insider Rank', display: `${b.rankWeight} / 10`, fill: b.rankWeight / 10, color: 'var(--accent-blue)' },
    {
      label: 'Dollar Volume',
      display: `${b.dollarVolumePoints} / 20 pts`,
      fill: b.dollarVolumePoints / 20,
      color: 'var(--accent-blue)',
    },
    {
      label: 'Transaction Quality',
      display: `× ${b.typeModifier.toFixed(2)}`,
      fill: b.typeModifier,
      color: 'var(--accent-purple)',
    },
    {
      label: 'Cluster Bonus',
      display: `× ${b.clusterMultiplier.toFixed(1)}`,
      fill: b.clusterMultiplier / 3,
      color: 'var(--accent-purple)',
    },
    {
      label: 'Earnings Timing',
      display: `× ${b.timingMultiplier.toFixed(2)}`,
      fill: b.timingMultiplier / MAX_INSIDER_TIMING_MULT,
      color: '#ff9f0a',
    },
    {
      label: 'Options Flow',
      display: `${b.optionsScore >= 0 ? '+' : ''}${b.optionsScore.toFixed(0)} pts`,
      fill: Math.min(Math.abs(b.optionsScore) / MAX_OPTIONS_SCORE_TOTAL, 1),
      color: b.optionsScore < 0 ? 'var(--accent-red)' : 'var(--accent-green)',
    },
    {
      label: 'Signal Age',
      display: `× ${b.freshnessMultiplier.toFixed(2)} · ${ageLabel(b.signalAgeDays)}`,
      fill: b.freshnessMultiplier,
      color: fresh.color,
    },
  ];

  if (b.vixMultiplier > 1) {
    factors.push({ label: 'VIX Fear Boost', display: `× ${b.vixMultiplier.toFixed(2)}`, fill: 1, color: 'var(--accent-red)' });
  }
  if (b.trackRecordMultiplier !== 1) {
    factors.push({
      label: 'Track Record',
      display: `× ${b.trackRecordMultiplier.toFixed(2)}`,
      fill: b.trackRecordMultiplier / 1.2,
      color: b.trackRecordMultiplier >= 1 ? 'var(--accent-green)' : 'var(--accent-red)',
    });
  }
  // When a politician tier is set, the tier row shows that bonus; comboBonus
  // already holds the effective total — avoid double-counting in the factor list.
  if (b.comboBonus > 0 && !b.politicianComboTier) {
    factors.push({ label: 'Combo Bonus', display: `+ ${b.comboBonus} pts`, fill: 1, color: 'var(--accent-blue)' });
  }

  const hasFlow = !!insiderFlow && (insiderFlow.buys > 0 || insiderFlow.sells > 0 || insiderFlow.form144 > 0);
  const net = insiderFlow ? insiderFlow.buys - insiderFlow.sells : 0;
  const hasStats =
    !!stats &&
    (stats.shortPctFloat != null || stats.floatShares != null || stats.avgDollarVolume != null || stats.pctFrom52wHigh != null);

  return (
    <section>
      <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-secondary">Score Breakdown</h3>
      <div className="flex flex-col gap-2.5">
        {factors.map((f) => (
          <div key={f.label} className="grid grid-cols-[8.5rem_1fr_8rem] items-center gap-3">
            <span className="text-sm font-medium">{f.label}</span>
            <div className="h-2.5 overflow-hidden rounded-full" style={{ background: 'var(--border-glass)' }}>
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max(Math.min(f.fill, 1), 0) * 100}%`,
                  background: f.color,
                  transition: 'width 0.7s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
              />
            </div>
            <span className="text-right text-sm font-semibold tabular-nums">{f.display}</span>
          </div>
        ))}
      </div>

      <div
        className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl px-4 py-3 text-sm"
        style={{ background: 'var(--bg-glass)', border: '1px solid var(--border-glass)' }}
      >
        <span className="text-secondary">
          Raw{' '}
          <span className="font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>
            {b.rawScore.toFixed(0)}
          </span>{' '}
          / {Math.round(b.maxPossibleRaw)}
          <span className="px-2">→</span>
          Final{' '}
          <span className="font-bold" style={{ color: 'var(--text-primary)' }}>
            {b.normalizedScore.toFixed(1)}
          </span>
        </span>
        {b.confidence != null && (
          <span
            className="text-secondary"
            title="Data confidence — enrichment completeness + cross-source corroboration + authoritative sourcing. Not a judgment of the signal itself."
          >
            Confidence{' '}
            <span className="tabular-nums" style={{ color: confidenceColor(b.confidence) }}>
              {'●'.repeat(Math.max(1, Math.round(b.confidence / 25)))}
              {'○'.repeat(Math.max(0, 4 - Math.max(1, Math.round(b.confidence / 25))))}
            </span>{' '}
            {Math.round(b.confidence)}/100
          </span>
        )}
      </div>

      {/* Net insider flow — gross buys vs gross sells vs net (sell-side intel). */}
      {hasFlow && insiderFlow && (
        <div className="mt-4 rounded-xl px-4 py-3" style={{ background: 'var(--bg-glass)', border: '1px solid var(--border-glass)' }}>
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-secondary">Net Insider Flow · 90d</div>
          <div className="flex flex-col gap-1.5">
            <KV label="Gross buys" value={formatUSD(insiderFlow.buys)} color="var(--accent-green)" />
            <KV label="Gross sells" value={insiderFlow.sells > 0 ? `-${formatUSD(insiderFlow.sells)}` : '—'} color={insiderFlow.sells > 0 ? 'var(--accent-red)' : undefined} />
            <KV
              label="Net flow"
              value={`${net >= 0 ? '+' : '−'}${formatUSD(Math.abs(net))}`}
              color={net > 0 ? 'var(--accent-green)' : net < 0 ? 'var(--accent-red)' : undefined}
            />
            {insiderFlow.form144 > 0 && <KV label="Form 144 notices" value={String(insiderFlow.form144)} color="var(--accent-yellow)" />}
          </div>
        </div>
      )}

      {/* Equity stats — short interest, float, liquidity, drawdown. */}
      {hasStats && stats && (
        <div className="mt-3 rounded-xl px-4 py-3" style={{ background: 'var(--bg-glass)', border: '1px solid var(--border-glass)' }}>
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-secondary">Equity Stats</div>
          <div className="flex flex-col gap-1.5">
            {stats.shortPctFloat != null && (
              <KV
                label="Short interest"
                value={`${stats.shortPctFloat.toFixed(1)}% of float`}
                color={stats.shortPctFloat >= 20 ? '#ff9f0a' : undefined}
              />
            )}
            {stats.floatShares != null && <KV label="Float" value={`${formatCompact(stats.floatShares)} sh`} />}
            {stats.avgDollarVolume != null && (
              <KV
                label="Avg daily $ vol"
                value={formatUSD(stats.avgDollarVolume)}
                color={stats.avgDollarVolume < 500_000 ? 'var(--accent-red)' : undefined}
              />
            )}
            {stats.pctFrom52wHigh != null && (
              <KV
                label="From 52w high"
                value={`${Math.round(stats.pctFrom52wHigh)}%`}
                color={stats.pctFrom52wHigh <= -40 ? 'var(--accent-green)' : undefined}
              />
            )}
          </div>
        </div>
      )}

      {/* Congressional activity — only when trades exist. */}
      {politicianTrades && politicianTrades.length > 0 && (
        <div className="mt-3 rounded-xl px-4 py-3" style={{ background: 'var(--bg-glass)', border: '1px solid var(--border-glass)' }}>
          <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-secondary">
            🏛️ Politician Activity
          </div>
          <div className="divide-y" style={{ borderColor: 'var(--border-glass)' }}>
            {politicianTrades.slice(0, 8).map((t, i) => (
              <PoliticianRow key={`${t.politician}-${t.tradeDate}-${i}`} t={t} />
            ))}
          </div>
          {politicianTrades.some((t) => t.transactionType === 'sell') && (
            <div className="mt-2 text-xs" style={{ color: 'var(--accent-red)' }}>
              ⚠ Contra-signal — a member of Congress is selling this name
            </div>
          )}
          <div className="mt-3 flex flex-col gap-1.5 border-t pt-2.5" style={{ borderColor: 'var(--border-glass)' }}>
            <KV
              label="Politician score contribution"
              value={`+${Math.round(b.politicianScore ?? 0)} pts`}
              color={(b.politicianScore ?? 0) > 0 ? 'var(--accent-purple)' : undefined}
            />
            {b.politicianComboTier && (
              <KV
                label="Combo tier"
                value={`${b.politicianComboTier}  (+${POLITICIAN_COMBO_BONUS[b.politicianComboTier]} bonus)`}
                color={TIER_COLOR[b.politicianComboTier]}
              />
            )}
          </div>
        </div>
      )}

      {b.notes.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {b.notes.map((note, i) => (
            <span
              key={i}
              className="rounded-full px-2.5 py-1 text-xs"
              style={{
                background: 'color-mix(in srgb, var(--accent-blue) 12%, transparent)',
                color: 'var(--accent-blue)',
              }}
            >
              {note}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
