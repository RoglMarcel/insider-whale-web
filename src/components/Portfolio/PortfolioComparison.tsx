import { Line, LineChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from 'recharts';
import type { PortfolioState } from '@/types';
import { useI18n } from '@/hooks/useI18n';
import { GlassCard } from '@/components/UI/GlassCard';
import './four-portfolio.css';

const money = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
const pct = (n: number | null) => n == null ? '—' : `${n > 0 ? '+' : ''}${(n * 100).toFixed(2)}%`;

export function comparisonAligned(base: PortfolioState, other: PortfolioState | undefined): boolean {
  if (!base.equity.length || !other || base.config.startingCash !== other.config.startingCash) return false;
  const policy = (s: PortfolioState) => JSON.stringify([s.config.trailArm, s.config.trailDistance,
    s.config.stopLoss, s.config.takeProfit, s.config.maxHoldDays, s.config.slippageBps,
    s.config.profitFloor ?? null, s.config.exitExecution ?? 'same_close', s.config.sigmaBarriers ?? null]);
  return policy(base) === policy(other) && base.equity.length === other.equity.length &&
    base.equity.every((p,i) => p.date === other.equity[i].date && p.benchmark === other.equity[i].benchmark);
}

export default function PortfolioComparison({ portfolio }: { portfolio: PortfolioState }) {
  const { t } = useI18n();
  const experiment = portfolio.insiderOnly;
  const third = experiment?.state;
  const fourth = portfolio.alertsAbove80?.state;
  const a = portfolio.equity.at(-1), b = third?.equity.at(-1);
  const aligned = comparisonAligned(portfolio, third);
  const fourthAligned = comparisonAligned(portfolio, fourth);
  const other = new Map(third?.equity.map((p) => [p.date, p.equity]) ?? []);
  const fourthPoints = new Map(fourth?.equity.map(p => [p.date,p.equity]) ?? []);
  const data = aligned ? portfolio.equity.map((p) => ({ date: p.date, market: p.benchmark, overlay: p.equity, insider: other.get(p.date)!, above80: fourthAligned ? fourthPoints.get(p.date)! : null })) : [];
  const labels = { market: t('pf.compare.market'), overlay: t('pf.compare.overlay'), insider: t('pf.compare.insider'), above80: t('pf.compare.above80') };
  const rows = aligned && third ? [
    { color: 'var(--portfolio-market)', label: labels.market, value: a!.benchmark, invested: 0, drawdown: portfolio.stats.maxDrawdown.benchmark },
    { color: 'var(--portfolio-overlay)', label: labels.overlay, value: a!.equity, invested: a!.positionsValue, drawdown: portfolio.stats.maxDrawdown.portfolio },
    { color: 'var(--portfolio-insider)', label: labels.insider, value: b!.equity, invested: b!.positionsValue, drawdown: third.stats.maxDrawdown.portfolio },
    { color: 'var(--portfolio-above80)', label: labels.above80, value: fourthAligned ? fourth!.equity.at(-1)!.equity : null,
      invested: fourthAligned ? fourth!.equity.at(-1)!.positionsValue : 0, drawdown: fourth?.stats.maxDrawdown.portfolio ?? null },
  ] : [];
  return <GlassCard className="portfolio-comparison four-portfolios">
    <h2 className="font-bold">{t('pf.compare.title')}</h2>
    <p className="mt-1 text-xs text-secondary">{t('pf.compare.history', { date: portfolio.meta.provenance?.policyDefinedAt ?? portfolio.alertsAbove80?.definedAt ?? experiment?.definedAt ?? '2026-11-01' })}</p>
    {!aligned ? <p className="mt-3 text-sm text-secondary">{t('pf.compare.pending')}</p> : <>
      <div className="portfolio-comparison-grid">
        {rows.map((r) => <article key={r.label} aria-label={r.label} className="portfolio-summary" style={{ borderTopColor: r.color }}>
          <h3 className="portfolio-summary-label"><span className="portfolio-dot" style={{ background: r.color }} />{r.label}</h3>
          <div className="portfolio-summary-value">{r.value == null ? '—' : money(r.value)}</div>
          <div className="portfolio-summary-return">{r.value == null ? t('pf.compare.awaiting') : `${pct(r.value / portfolio.config.startingCash - 1)} · ${money(r.value - portfolio.config.startingCash)}`}</div>
          {r.value != null && <>
            <div className="portfolio-summary-exposure">{t('pf.compare.exposure')}: {money(r.invested)} ({(r.invested / r.value * 100).toFixed(1)}%)</div>
            <div className="portfolio-summary-drawdown">{t('pf.compare.drawdown')}: {pct(r.drawdown)}</div>
          </>}
        </article>)}
      </div>
      <div className="portfolio-comparison-chart" role="img" aria-label={t('pf.compare.chartLabel')}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 4, bottom: 4, left: 4 }}>
            <CartesianGrid vertical={false} stroke="var(--border-glass)" strokeDasharray="3 3" />
            <XAxis dataKey="date" minTickGap={35} tickFormatter={(d: string) => d.slice(5)} tick={{ fontSize: 11 }} />
            <YAxis width={60} domain={['auto', 'auto']} tickFormatter={money} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v: number) => money(v)} contentStyle={{ background: 'var(--bg-glass)', border: '1px solid var(--border-glass)', borderRadius: 8 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line dataKey="market" name={labels.market} stroke="var(--portfolio-market)" strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
            <Line dataKey="overlay" name={labels.overlay} stroke="var(--portfolio-overlay)" strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line dataKey="insider" name={labels.insider} stroke="var(--portfolio-insider)" strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line dataKey="above80" name={labels.above80} stroke="var(--portfolio-above80)" strokeWidth={2} strokeDasharray="2 2" dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="portfolio-summary-exposure">{portfolio.meta.firstDate} → {a!.date} · {t('pf.compare.sameStart')}</p>
      {!fourthAligned && <p className="mt-2 text-xs text-secondary">{t('pf.compare.pending')}</p>}
    </>}
  </GlassCard>;
}
