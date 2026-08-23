import { useState } from 'react';
import { GlassCard } from '@/components/UI/GlassCard';
import { useI18n } from '@/hooks/useI18n';
import { formatDate } from '@/lib/format';
import type { PortfolioConfig, PortfolioMeta } from '@/types';
import type { TKey } from '@/lib/i18n';

/**
 * The rulebook and the assumptions, in plain language.
 *
 * This card is the reason anyone should believe the numbers above it: it states
 * every parameter the curve was actually computed with (they come from the run
 * metadata, not from the live settings, so a chart can never be labelled with
 * values it was not built from) and it names the things the simulation does NOT
 * model. It is not optional decoration — a performance chart without its
 * assumptions is a marketing graphic.
 */

const p1 = (v: number): string => (v * 100).toFixed(1).replace(/\.0$/, '');
const p2 = (v: number): string => (v * 100).toFixed(2).replace(/0$/, '').replace(/\.$/, '');

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-0.5 py-2 sm:grid-cols-[13rem_1fr] sm:gap-3" style={{ borderTop: '1px solid var(--border-glass)' }}>
      <dt className="text-xs font-semibold uppercase tracking-wide text-secondary">{label}</dt>
      <dd className="text-sm">{value}</dd>
    </div>
  );
}

export function RulesCard({ config, meta }: { config: PortfolioConfig; meta: PortfolioMeta }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  const assumptions: TKey[] = [
    'pf.assume.cash',
    'pf.assume.prices',
    'pf.assume.lookahead',
    'pf.assume.backfill',
    'pf.assume.fractional',
    'pf.assume.tax',
    'pf.assume.sample',
  ];

  return (
    <GlassCard className="p-4 lg:p-6">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <h3 className="text-sm font-bold uppercase tracking-wide text-secondary">{t('pf.rules.title')}</h3>
        <span className="btn shrink-0 px-3 py-1 text-xs">{open ? t('pf.rules.hide') : t('pf.rules.show')}</span>
      </button>

      {open && (
        <div className="mt-3">
          <dl className="flex flex-col">
            <Line label={t('pf.rules.capital')} value={`$${config.startingCash.toLocaleString('en-US')}`} />
            <Line label={t('pf.rules.entry')} value={t('pf.rules.entryValue', { score: config.entryScore })} />
            <Line
              label={t('pf.rules.sizing')}
              value={t('pf.rules.sizingValue', {
                base: p1(config.baseWeight),
                entry: config.entryScore,
                max: p1(config.maxWeight),
                min: p1(config.minWeight),
              })}
            />
            <Line
              label={t('pf.rules.exits')}
              value={t('pf.rules.exitsValue', {
                tp: p1(config.takeProfit),
                sl: p1(config.stopLoss),
                trailDist: p1(config.trailDistance),
                trailArm: p1(config.trailArm),
                hold: config.maxHoldDays,
              })}
            />
            <Line
              label={t('pf.rules.limits')}
              value={t('pf.rules.limitsValue', {
                max: config.maxPositions,
                cooldown: config.reentryCooldownDays,
                ticket: config.minTicket,
              })}
            />
            <Line
              label={t('pf.rules.cash')}
              value={config.cashPolicy === 'spy' ? t('pf.rules.cashSpy') : t('pf.rules.cashIdle')}
            />
            <Line label={t('pf.rules.costs')} value={t('pf.rules.costsValue', { slip: p2(config.slippageBps / 10_000) })} />
            <Line
              label={t('pf.rules.benchmark')}
              value={t('pf.rules.benchmarkValue', { capital: config.startingCash.toLocaleString('en-US') })}
            />
          </dl>

          <p className="mt-2 text-xs text-secondary">{t('pf.rules.priority')}</p>

          <h4 className="mb-2 mt-5 text-sm font-bold uppercase tracking-wide text-secondary">{t('pf.assume.title')}</h4>
          <ul className="flex flex-col gap-1.5 text-xs leading-relaxed text-secondary">
            {assumptions.map((key) => (
              <li key={key} className="flex gap-2">
                <span aria-hidden="true">·</span>
                <span>{t(key)}</span>
              </li>
            ))}
          </ul>

          <p className="mt-4 text-[11px] text-secondary">
            {meta.backfillStart && meta.liveStart
              ? t('pf.meta.backfill', { from: formatDate(meta.backfillStart), live: formatDate(meta.liveStart) })
              : meta.backfillStart
                ? t('pf.meta.backfillOnly', { from: formatDate(meta.backfillStart) })
                : ''}
          </p>
        </div>
      )}
    </GlassCard>
  );
}
