import { useEffect, useState } from 'react';
import { useI18n } from '@/hooks/useI18n';
import { useStore } from '@/store/useStore';
import type { ValuationResult, ValuationSourceResult } from '@/types';
import { formatPrice, formatPercent } from '@/lib/format';
import { ExternalLinkIcon, AlertIcon } from '@/components/UI/icons';

function SourceCard({ source }: { source: ValuationSourceResult }) {
  const { t } = useI18n();
  const name = source.source === 'alphaspread' ? 'AlphaSpread (DCF)' : 'ValueInvesting.io';
  const upside = source.upsidePct;
  const upColor =
    upside == null ? 'var(--text-secondary)' : upside >= 0 ? 'var(--accent-green)' : 'var(--accent-red)';

  return (
    <div
      className="flex-1 rounded-xl p-4"
      style={{ background: 'var(--bg-glass)', border: '1px solid var(--border-glass)' }}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-bold">{name}</span>
        <a
          href={source.url}
          target="_blank"
          rel="noreferrer"
          className="text-secondary hover:opacity-70"
          title={t('val.openSource')}
        >
          <ExternalLinkIcon size={15} />
        </a>
      </div>

      {source.error ? (
        <div className="flex items-center gap-2 text-sm text-secondary">
          <AlertIcon size={16} />
          {source.error}
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between">
            <span className="text-xs uppercase tracking-wide text-secondary">{t('val.fairValue')}</span>
            <span className="text-lg font-extrabold">{formatPrice(source.fairValue)}</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-xs uppercase tracking-wide text-secondary">{t('val.current')}</span>
            <span className="font-semibold">{formatPrice(source.currentPrice)}</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-xs uppercase tracking-wide text-secondary">{t('val.upside')}</span>
            <span className="font-bold" style={{ color: upColor }}>
              {formatPercent(upside)}
            </span>
          </div>
          {source.label && (
            <div className="mt-1 text-xs font-semibold uppercase tracking-wide" style={{ color: upColor }}>
              {source.label}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ValuationSection({ ticker }: { ticker: string }) {
  const fetchValuation = useStore((s) => s.fetchValuation);
  const [data, setData] = useState<ValuationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const { t } = useI18n();

  useEffect(() => {
    let active = true;
    setLoading(true);
    setData(null);
    fetchValuation(ticker)
      .then((r) => active && setData(r))
      .catch(() => active && setData(null))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [ticker, fetchValuation]);

  return (
    <section>
      <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-secondary">{t('val.title')}</h3>

      {loading ? (
        <div
          className="flex items-center gap-3 rounded-xl px-4 py-6 text-sm text-secondary"
          style={{ background: 'var(--bg-glass)', border: '1px solid var(--border-glass)' }}
        >
          <span
            className="h-4 w-4 animate-spin rounded-full border-2"
            style={{ borderColor: 'var(--border-glass)', borderTopColor: 'var(--accent-blue)' }}
          />
          {t('val.fetching')}
        </div>
      ) : data && data.sources.length > 0 ? (
        <div className="flex flex-col gap-3 sm:flex-row">
          {data.sources.map((s, i) => (
            <SourceCard key={i} source={s} />
          ))}
        </div>
      ) : (
        <div
          className="rounded-xl px-4 py-5 text-sm text-secondary"
          style={{ background: 'var(--bg-glass)', border: '1px solid var(--border-glass)' }}
        >
          {t('val.unavailable', { ticker })}
        </div>
      )}
      <p className="mt-2 text-xs text-secondary">
        {t('val.disclaimer')}
      </p>
    </section>
  );
}
