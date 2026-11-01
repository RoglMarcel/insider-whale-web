import { useId, useState, type CSSProperties } from 'react';
import { Line, LineChart, CartesianGrid, Customized, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { PortfolioState } from '@/types';
import { useI18n } from '@/hooks/useI18n';
import { spreadChartLabels } from '@/lib/chart-labels';
import { GlassCard } from '@/components/UI/GlassCard';
import './four-portfolio.css';

const money = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
const pct = (n: number | null) => n == null ? '—' : `${n > 0 ? '+' : ''}${(n * 100).toFixed(2)}%`;
type SeriesKey = 'market' | 'overlay' | 'insider' | 'above80';
interface ComparisonSeries {
  key: SeriesKey;
  color: string;
  label: string;
  shortLabel: string;
  value: number | null;
  invested: number;
  drawdown: number | null;
}

export function comparisonAligned(base: PortfolioState, other: PortfolioState | undefined): boolean {
  if (!base.equity.length || !other || base.config.startingCash !== other.config.startingCash) return false;
  const policy = (s: PortfolioState) => JSON.stringify([s.config.trailArm, s.config.trailDistance,
    s.config.stopLoss, s.config.takeProfit, s.config.maxHoldDays, s.config.slippageBps,
    s.config.profitFloor ?? null, s.config.exitExecution ?? 'same_close', s.config.sigmaBarriers ?? null]);
  return policy(base) === policy(other) && base.equity.length === other.equity.length &&
    base.equity.every((p, i) => p.date === other.equity[i].date && p.benchmark === other.equity[i].benchmark);
}

interface EndpointProps {
  series: ComparisonSeries[];
  focused: SeriesKey | null;
  // Recharts Customized injects the resolved chart geometry and actual scale.
  offset?: { left: number; top: number; width: number; height: number };
  yAxisMap?: Record<string, { scale: (value: number) => number }>;
}

function EndpointLabels({ series, focused, offset, yAxisMap }: EndpointProps) {
  const scale = Object.values(yAxisMap ?? {})[0]?.scale;
  if (!offset || !scale || offset.height <= 0) return null;
  const labels = spreadChartLabels(series.filter(s => s.value != null)
    .map(s => ({ ...s, y: scale(s.value!) })), offset.top + 14, offset.top + offset.height - 14);
  const x = offset.left + offset.width;
  return <g className="portfolio-end-labels" aria-hidden="true" pointerEvents="none">
    {labels.map(s => <g key={s.key} data-series={s.key} opacity={!focused || focused === s.key ? 1 : .35}>
      <circle cx={x} cy={s.y} r={4} fill={s.color} />
      <path d={`M${x + 7},${s.y} L${x + 17},${s.labelY} H${x + 24}`} fill="none" stroke={s.color} />
      <text x={x + 30} y={s.labelY} dominantBaseline="middle" fill={s.color} fontSize={13}>
        <tspan>{s.shortLabel}</tspan><tspan dx={8} fontWeight={700}>{money(s.value!)}</tspan>
      </text>
    </g>)}
  </g>;
}

export default function PortfolioComparison({ portfolio }: { portfolio: PortfolioState }) {
  const { t } = useI18n();
  const hintId = useId();
  const [focused, setFocused] = useState<SeriesKey | null>(null);
  const [chartWidth, setChartWidth] = useState(0);
  const experiment = portfolio.insiderOnly;
  const third = experiment?.state;
  const fourth = portfolio.alertsAbove80?.state;
  const a = portfolio.equity.at(-1), b = third?.equity.at(-1);
  const aligned = comparisonAligned(portfolio, third);
  const fourthAligned = comparisonAligned(portfolio, fourth);
  const activeFocus = focused === 'above80' && !fourthAligned ? null : focused;
  const showEndpoints = chartWidth >= 900;
  const other = new Map(third?.equity.map(p => [p.date, p.equity]) ?? []);
  const fourthPoints = new Map(fourth?.equity.map(p => [p.date, p.equity]) ?? []);
  const data = aligned ? portfolio.equity.map(p => ({ date: p.date, market: p.benchmark, overlay: p.equity,
    insider: other.get(p.date)!, above80: fourthAligned ? fourthPoints.get(p.date)! : null })) : [];
  const rows: ComparisonSeries[] = aligned && third ? [
    { key: 'market', color: 'var(--portfolio-market)', label: t('pf.compare.market'), shortLabel: t('pf.compare.shortMarket'),
      value: a!.benchmark, invested: 0, drawdown: portfolio.stats.maxDrawdown.benchmark },
    { key: 'overlay', color: 'var(--portfolio-overlay)', label: t('pf.compare.overlay'), shortLabel: t('pf.compare.shortOverlay'),
      value: a!.equity, invested: a!.positionsValue, drawdown: portfolio.stats.maxDrawdown.portfolio },
    { key: 'insider', color: 'var(--portfolio-insider)', label: t('pf.compare.insider'), shortLabel: t('pf.compare.shortInsider'),
      value: b!.equity, invested: b!.positionsValue, drawdown: third.stats.maxDrawdown.portfolio },
    { key: 'above80', color: 'var(--portfolio-above80)', label: t('pf.compare.above80'), shortLabel: t('pf.compare.shortAbove80'),
      value: fourthAligned ? fourth!.equity.at(-1)!.equity : null,
      invested: fourthAligned ? fourth!.equity.at(-1)!.positionsValue : 0, drawdown: fourth?.stats.maxDrawdown.portfolio ?? null },
  ] : [];
  const focusName = rows.find(s => s.key === activeFocus)?.label;
  return <GlassCard className="portfolio-comparison four-portfolios">
    <h2 className="font-bold">{t('pf.compare.title')}</h2>
    <p className="mt-1 text-xs text-secondary">{t('pf.compare.history', { date: portfolio.meta.provenance?.policyDefinedAt ?? portfolio.alertsAbove80?.definedAt ?? experiment?.definedAt ?? '2026-11-01' })}</p>
    {!aligned ? <p className="mt-3 text-sm text-secondary">{t('pf.compare.pending')}</p> : <>
      <div className="portfolio-comparison-grid">
        {rows.map(r => <article key={r.key} aria-label={r.label} className="portfolio-summary"
          style={{ borderTopColor: r.color, '--series-color': r.color } as CSSProperties}>
          <button type="button" className="portfolio-summary-toggle" disabled={r.value == null}
            aria-label={t('pf.compare.highlight', { portfolio: r.label })} aria-describedby={`${hintId} ${hintId}-${r.key}-value ${hintId}-${r.key}-return`}
            aria-pressed={activeFocus === r.key} onClick={() => setFocused(current => current === r.key ? null : r.key)}>
            <span className="portfolio-summary-label">
              <svg className="portfolio-line-swatch" width="24" height="12" viewBox="0 0 24 12" aria-hidden="true">
                <line x1="1" x2="23" y1="6" y2="6" stroke={r.color} strokeWidth="3" strokeDasharray={r.key === 'market' ? '6 4' : undefined} />
              </svg>{r.label}
            </span>
            <span id={`${hintId}-${r.key}-value`} className="portfolio-summary-value">{r.value == null ? '—' : money(r.value)}</span>
            <span id={`${hintId}-${r.key}-return`} className="portfolio-summary-return">{r.value == null ? t('pf.compare.awaiting') : `${pct(r.value / portfolio.config.startingCash - 1)} · ${money(r.value - portfolio.config.startingCash)}`}</span>
            {r.value != null && <>
              <span className="portfolio-summary-exposure">{t('pf.compare.exposure')}: {money(r.invested)} ({r.value ? (r.invested / r.value * 100).toFixed(1) : '0.0'}%)</span>
              <span className="portfolio-summary-drawdown">{t('pf.compare.drawdown')}: {pct(r.drawdown)}</span>
            </>}
          </button>
        </article>)}
      </div>
      <div className="portfolio-comparison-controls">
        <p id={hintId} aria-live="polite">{focusName ? t('pf.compare.focused', { portfolio: focusName }) : t('pf.compare.focusHint')}</p>
        <button type="button" className="btn" aria-pressed={!activeFocus} onClick={() => setFocused(null)}>{t('pf.compare.showAll')}</button>
      </div>
      <div className="portfolio-comparison-chart" role="img" aria-label={t('pf.compare.chartLabel')}>
        <ResponsiveContainer width="100%" height="100%" onResize={width => setChartWidth(width)}>
          <LineChart data={data} accessibilityLayer margin={{ top: 18, right: showEndpoints ? 226 : 12, bottom: 8, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border-glass)" strokeDasharray="3 3" />
            <ReferenceLine y={portfolio.config.startingCash} stroke="var(--text-muted)" strokeWidth={1.2} ifOverflow="extendDomain" />
            <XAxis dataKey="date" interval="preserveStartEnd" minTickGap={chartWidth < 500 ? 44 : 35} tickFormatter={(d: string) => d.slice(5)} tick={{ fontSize: 13, fill: 'var(--text-secondary)' }} />
            <YAxis width={66} domain={['auto', 'auto']} tickFormatter={money} tick={{ fontSize: 13, fill: 'var(--text-secondary)' }} />
            <Tooltip formatter={(v: number) => money(v)} position={chartWidth < 500 ? { x: 0, y: 4 } : undefined}
              cursor={{ stroke: 'var(--text-muted)', strokeDasharray: '3 3' }}
              contentStyle={{ background: 'var(--bg-glass)', border: '1px solid var(--border-glass)', borderRadius: 8, fontSize: 13,
                maxWidth: chartWidth < 500 ? Math.max(160, chartWidth - 28) : 340, whiteSpace: 'normal' }} />
            {rows.map(r => <Line key={r.key} className={`portfolio-comparison-line portfolio-line-${r.key}`} dataKey={r.key}
              name={r.label} type="linear" stroke={r.color} strokeWidth={3}
              strokeDasharray={r.key === 'market' ? '8 5' : undefined}
              strokeOpacity={!activeFocus || activeFocus === r.key ? 1 : .28}
              dot={false} activeDot={{ r: 5 }} isAnimationActive={false} />)}
            {showEndpoints && <Customized component={<EndpointLabels series={rows} focused={activeFocus} />} />}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="portfolio-summary-exposure">{portfolio.meta.firstDate} → {a!.date} · {t('pf.compare.sameStart')}</p>
      {!fourthAligned && <p className="mt-2 text-xs text-secondary">{t('pf.compare.pending')}</p>}
    </>}
  </GlassCard>;
}
