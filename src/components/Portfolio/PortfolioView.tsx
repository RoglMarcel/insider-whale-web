import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { GlassCard } from '@/components/UI/GlassCard';
import { RefreshIcon } from '@/components/UI/icons';
import { useI18n } from '@/hooks/useI18n';
import { api } from '@/lib/ipc';
import { formatDate, formatDateTime, timeAgo } from '@/lib/format';
import { addDaysYmd, diffDaysYmd, emptyPortfolioState } from '@/lib/portfolio-rules';
import type { PortfolioState } from '@/types';
import type { TKey } from '@/lib/i18n';
import { PortfolioStatsPanel } from './PortfolioStats';
import { ClosedTradesTable, OpenPositionsTable } from './PortfolioPositions';
import { RulesCard } from './RulesCard';
import type { EquityChartPoint, TradeMarker } from './EquityChart';

// Recharts is ~100 kB and only this view draws it — same treatment as
// ScoreTrendChart, so the alerts list still paints without it.
const EquityChart = lazy(() => import('./EquityChart'));

type RangeKey = '7d' | '30d' | '90d' | '6m' | '1y' | 'max';

const RANGES: { key: RangeKey; days: number | null; label: TKey }[] = [
  { key: '7d', days: 7, label: 'pf.range.7d' },
  { key: '30d', days: 30, label: 'pf.range.30d' },
  { key: '90d', days: 90, label: 'pf.range.90d' },
  { key: '6m', days: 182, label: 'pf.range.6m' },
  { key: '1y', days: 365, label: 'pf.range.1y' },
  { key: 'max', days: null, label: 'pf.range.max' },
];

const LS = {
  range: 'pf.range',
  unit: 'pf.unit',
  log: 'pf.log',
  idle: 'pf.idle',
  markers: 'pf.markers',
};

function readLs<T extends string>(key: string, fallback: T): T {
  try {
    return (localStorage.getItem(key) as T | null) ?? fallback;
  } catch {
    return fallback;
  }
}

/** Persisted booleans live as '1'/'0' so nothing has to be JSON-parsed back. */
function readLsFlag(key: string, fallback: boolean): boolean {
  return readLs<string>(key, fallback ? '1' : '0') === '1';
}

function writeLs(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode */
  }
}

const money = (v: number): string =>
  '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Axis labels on a phone: no cents. The tooltip still carries the exact figure. */
const moneyShort = (v: number): string => '$' + Math.round(v).toLocaleString('en-US');
const pct = (v: number | null | undefined, digits = 2): string =>
  v == null ? '—' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(digits)}%`;
const sign = (v: number | null | undefined): string | undefined =>
  v == null ? undefined : v >= 0 ? 'var(--accent-green)' : 'var(--accent-red)';

function Toggle({
  options,
  value,
  onChange,
}: {
  options: { key: string; label: string; disabled?: boolean; title?: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-lg" style={{ border: '1px solid var(--border-glass)' }}>
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          disabled={o.disabled}
          title={o.title}
          onClick={() => onChange(o.key)}
          // A window we cannot compute is DISABLED, not empty: an empty chart
          // reads as "the strategy did nothing", which is a different claim.
          className="px-2.5 py-1 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-35"
          style={{
            background: value === o.key ? 'color-mix(in srgb, var(--accent-blue) 18%, transparent)' : 'transparent',
            color: value === o.key ? 'var(--accent-blue)' : 'var(--text-secondary)',
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function PortfolioView() {
  const { t, language } = useI18n();
  const [state, setState] = useState<PortfolioState>(() => emptyPortfolioState());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'sync' | 'rebuild' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [range, setRange] = useState<RangeKey>(() => readLs<RangeKey>(LS.range, 'max'));
  const [unit, setUnit] = useState<'$' | '%'>(() => readLs<'$' | '%'>(LS.unit, '%'));
  const [logScale, setLogScale] = useState(() => readLsFlag(LS.log, false));
  const [showIdle, setShowIdle] = useState(() => readLsFlag(LS.idle, false));
  const [showMarkers, setShowMarkers] = useState(() => readLsFlag(LS.markers, true));
  const [compact, setCompact] = useState(() => typeof window !== 'undefined' && window.innerWidth < 640);

  useEffect(() => {
    const onResize = () => setCompact(window.innerWidth < 640);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    let active = true;
    api.portfolio
      .getState()
      .then((s) => active && setState(s))
      .catch((e) => active && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const run = async (kind: 'sync' | 'rebuild') => {
    if (kind === 'rebuild' && !window.confirm(t('pf.action.rebuildConfirm'))) return;
    setBusy(kind);
    setError(null);
    try {
      setState(kind === 'sync' ? await api.portfolio.sync() : await api.portfolio.rebuild());
    } catch (e) {
      setError(t('pf.action.failed', { error: e instanceof Error ? e.message : String(e) }));
    } finally {
      setBusy(null);
    }
  };

  const { equity, meta, config, stats } = state;
  const spanDays = equity.length >= 2 ? diffDaysYmd(equity[0].date, equity[equity.length - 1].date) : 0;

  // A range is only offered when the history actually covers it.
  const rangeOptions = RANGES.map((r) => ({
    key: r.key,
    label: t(r.label),
    disabled: r.days != null && spanDays < r.days,
    title: r.days != null && spanDays < r.days ? t('pf.range.tooShort', { days: r.days - spanDays }) : undefined,
  }));
  const effectiveRange: RangeKey = rangeOptions.find((o) => o.key === range && !o.disabled) ? range : 'max';

  const windowed = useMemo(() => {
    const days = RANGES.find((r) => r.key === effectiveRange)?.days ?? null;
    if (days == null || !equity.length) return equity;
    const cutoff = addDaysYmd(equity[equity.length - 1].date, -days);
    const idx = equity.findIndex((p) => p.date >= cutoff);
    return idx <= 0 ? equity : equity.slice(idx - 1);
  }, [equity, effectiveRange]);

  const chartData: EquityChartPoint[] = useMemo(() => {
    if (!windowed.length) return [];
    const base = windowed[0];
    // In % mode BOTH series are re-based to 0 at the window start, which is the
    // only presentation where equal vertical distance means equal return.
    return windowed.map((p) =>
      unit === '$'
        ? { date: p.date, portfolio: p.equity, benchmark: p.benchmark, idle: p.equityIdle }
        : {
            date: p.date,
            portfolio: p.equity / base.equity - 1,
            benchmark: p.benchmark / base.benchmark - 1,
            idle: p.equityIdle / base.equityIdle - 1,
          },
    );
  }, [windowed, unit]);

  const markers: TradeMarker[] = useMemo(() => {
    if (!showMarkers || !chartData.length) return [];
    const byDate = new Map(chartData.map((p) => [p.date, p.portfolio]));
    const out: TradeMarker[] = [];
    for (const e of state.events) {
      if (e.kind !== 'buy' && e.kind !== 'sell') continue;
      const v = byDate.get(e.date);
      if (v == null) continue;
      out.push({ date: e.date, value: v, kind: e.kind });
    }
    return out;
  }, [state.events, chartData, showMarkers]);

  // The divider is drawn on a CATEGORY axis, so it has to name a date that is
  // actually a tick. `liveStart` is the first day a live signal was stored and
  // can easily be a Saturday, which no session matches — snap it forward to the
  // first session in view, or the line silently never renders.
  const liveInWindow = useMemo(() => {
    if (!meta.liveStart) return null;
    return windowed.find((p) => p.date >= (meta.liveStart as string))?.date ?? null;
  }, [windowed, meta.liveStart]);

  const last = equity[equity.length - 1] ?? null;
  const maxWindow = stats.windows.find((w) => w.key === 'max');

  // Percentages keep one decimal even on a phone: rounding them to whole points
  // turns an evenly spaced axis into −4 / −2 / +1 / +4 / +6.
  const tickFormatter = compact ? (v: number) => (unit === '$' ? moneyShort(v) : pct(v, 1)) : undefined;

  const quality: string[] = [];
  if (meta.skippedNoCash) quality.push(t('pf.quality.skipped', { n: meta.skippedNoCash }));
  if (meta.skippedCap) quality.push(t('pf.quality.capped', { n: meta.skippedCap }));
  if (meta.untradableTickers.length) quality.push(t('pf.quality.missing', { n: meta.untradableTickers.length }));
  if (meta.suspectPrices) quality.push(t('pf.quality.suspect', { n: meta.suspectPrices }));
  if (meta.restatedDays) quality.push(t('pf.quality.restated', { n: meta.restatedDays }));

  return (
    <div className="animate-fade-in flex flex-col gap-4 lg:gap-6">
      {/* ── Headline ── */}
      <GlassCard className="p-4 lg:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="grid flex-1 gap-4 sm:grid-cols-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-secondary">{t('pf.headline.value')}</div>
              <div className="font-mono-terminal text-2xl font-extrabold tabular-nums lg:text-3xl">
                {last ? money(last.equity) : '—'}
              </div>
              <div className="text-sm font-semibold tabular-nums" style={{ color: sign(maxWindow?.portfolio) }}>
                {pct(maxWindow?.portfolio)}
                {last && (
                  <span className="ml-2 font-normal text-secondary">
                    {last.equity - config.startingCash >= 0 ? '+' : '−'}
                    {money(Math.abs(last.equity - config.startingCash))}
                  </span>
                )}
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-secondary">{t('pf.headline.benchmark')}</div>
              <div className="font-mono-terminal text-2xl font-extrabold tabular-nums text-secondary lg:text-3xl">
                {last ? money(last.benchmark) : '—'}
              </div>
              <div className="text-sm font-semibold tabular-nums text-secondary">{pct(maxWindow?.benchmark)}</div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-secondary">{t('pf.headline.edge')}</div>
              <div
                className="font-mono-terminal text-2xl font-extrabold tabular-nums lg:text-3xl"
                style={{ color: sign(maxWindow?.diff) }}
              >
                {pct(maxWindow?.diff)}
              </div>
              <div className="text-xs text-secondary">
                {meta.firstDate ? t('pf.headline.sinceStart', { date: formatDate(meta.firstDate) }) : ''}
              </div>
            </div>
          </div>

          {/* Desktop can run the simulation; the hosted build reads a published
              result and must not offer buttons that cannot do anything. */}
          {!meta.readOnly && (
            <div className="flex shrink-0 flex-wrap gap-2">
              <button className="btn btn-primary" onClick={() => void run('sync')} disabled={busy !== null}>
                <RefreshIcon size={15} className={busy === 'sync' ? 'animate-spin' : ''} />
                {busy === 'sync' ? t('pf.action.syncing') : t('pf.action.sync')}
              </button>
              <button className="btn" onClick={() => void run('rebuild')} disabled={busy !== null}>
                {busy === 'rebuild' ? t('pf.action.rebuilding') : t('pf.action.rebuild')}
              </button>
            </div>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-secondary">
          {meta.priceAsOf && <span>{t('pf.headline.asOf', { date: formatDate(meta.priceAsOf) })}</span>}
          {meta.lastRun && <span>· {t('pf.meta.lastRun', { when: timeAgo(meta.lastRun, language) })}</span>}
          {meta.readOnly && <span>· {t('pf.meta.readOnly')}</span>}
        </div>

        {error && (
          <div className="mt-3 text-sm" style={{ color: 'var(--accent-red)' }}>
            {error}
          </div>
        )}
        {meta.note && <div className="mt-3 text-xs text-secondary">{meta.note}</div>}
      </GlassCard>

      {/* ── Chart ── */}
      <GlassCard className="p-4 lg:p-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <Toggle
            options={rangeOptions}
            value={effectiveRange}
            onChange={(v) => {
              setRange(v as RangeKey);
              writeLs(LS.range, v);
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Toggle
              options={[
                { key: '%', label: t('pf.chart.unitPercent') },
                { key: '$', label: t('pf.chart.unitDollar') },
              ]}
              value={unit}
              onChange={(v) => {
                setUnit(v as '$' | '%');
                writeLs(LS.unit, v);
              }}
            />
            <Toggle
              options={[
                { key: 'lin', label: t('pf.chart.scaleLinear') },
                // A log axis needs strictly positive values; the % view crosses
                // zero, so the toggle is only meaningful in the $ view.
                { key: 'log', label: t('pf.chart.scaleLog'), disabled: unit === '%' },
              ]}
              value={logScale && unit === '$' ? 'log' : 'lin'}
              onChange={(v) => {
                setLogScale(v === 'log');
                writeLs(LS.log, v === 'log' ? '1' : '0');
              }}
            />
          </div>
        </div>

        <div style={{ height: compact ? 260 : 340 }}>
          {loading ? (
            <div className="flex h-full items-center justify-center text-sm text-secondary">…</div>
          ) : chartData.length < 2 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <div className="text-sm font-semibold">{t('pf.headline.noData')}</div>
              <div className="max-w-sm text-xs text-secondary">{t('pf.headline.noDataHint')}</div>
            </div>
          ) : (
            <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-secondary">…</div>}>
              <EquityChart
                data={chartData}
                unit={unit}
                logScale={logScale && unit === '$'}
                showIdle={showIdle}
                markers={markers}
                liveFrom={liveInWindow}
                compact={compact}
                labels={{
                  portfolio: t('pf.chart.portfolio'),
                  benchmark: t('pf.chart.benchmark'),
                  idle: t('pf.chart.idle'),
                  difference: t('pf.chart.difference'),
                  liveFrom: meta.liveStart ? t('pf.chart.liveFrom', { date: formatDate(meta.liveStart) }) : '',
                }}
                formatValue={(v) => (unit === '$' ? money(v) : pct(v, 1))}
                formatTick={tickFormatter}
                formatDate={(d) => formatDate(d)}
              />
            </Suspense>
          )}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-secondary">
            <input
              type="checkbox"
              checked={showIdle}
              onChange={(e) => {
                setShowIdle(e.target.checked);
                writeLs(LS.idle, e.target.checked ? '1' : '0');
              }}
            />
            {t('pf.chart.showIdle')}
          </label>
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-secondary">
            <input
              type="checkbox"
              checked={showMarkers}
              onChange={(e) => {
                setShowMarkers(e.target.checked);
                writeLs(LS.markers, e.target.checked ? '1' : '0');
              }}
            />
            {t('pf.chart.showTrades')}
          </label>
        </div>
        <p className="mt-2 text-[11px] leading-snug text-secondary">{t('pf.chart.hint')}</p>
      </GlassCard>

      <PortfolioStatsPanel stats={stats} />

      <OpenPositionsTable positions={state.open} />
      <ClosedTradesTable trades={state.closed} />

      <RulesCard config={config} meta={meta} />

      {/* ── Data quality — visible, never swallowed ── */}
      <GlassCard className="p-4 lg:px-6">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs">
          <span className="font-semibold uppercase tracking-wide text-secondary">{t('pf.quality.title')}</span>
          <span className="text-secondary">
            {quality.length ? quality.join(' · ') : t('pf.quality.clean')}
            {meta.untradableTickers.length > 0 && (
              <> · {t('pf.quality.untradable', { tickers: meta.untradableTickers.join(', ') })}</>
            )}
          </span>
          {meta.lastRun && <span className="ml-auto text-secondary">{formatDateTime(meta.lastRun)}</span>}
        </div>
      </GlassCard>
    </div>
  );
}
