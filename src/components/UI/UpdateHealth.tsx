import { useEffect, useState } from 'react';
import { isWeb } from '@/lib/ipc';
import { useI18n } from '@/hooks/useI18n';
import type { TKey } from '@/lib/i18n';

type Stage = { status: 'success' | 'partial' | 'failed' | 'skipped'; reason?: string; affected?: number; quarantinedTickers?: string[]; tickers?: string[]; priceAsOf?: string; checkedAt?: string; lastSuccessAt?: string; lastUpdatedAt?: string };
type Health = { stages: Record<'signals' | 'portfolio' | 'outcomes', Stage> };
const names = ['signals', 'portfolio', 'outcomes'] as const;
const reasons = new Set(['prices_unavailable', 'work_remaining', 'source_errors', 'update_failed', 'no_work', 'desktop_publish', 'not_ready', 'unavailable']);

export function UpdateHealth() {
  const [health, setHealth] = useState<Health | null>(null);
  const { t, language } = useI18n();
  useEffect(() => {
    if (!isWeb) return;
    const controller = new AbortController();
    fetch(`${import.meta.env.BASE_URL}data/update-health.json`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Unavailable');
        const data = await response.json();
        if (!names.every((name) => ['success', 'partial', 'failed', 'skipped'].includes(data?.stages?.[name]?.status))) throw new Error('Invalid status');
        setHealth(data);
      }).catch(() => {});
    return () => controller.abort();
  }, []);
  if (!isWeb) return null;
  const stamp = (value?: string) => value && Number.isFinite(Date.parse(value))
    ? new Date(value).toLocaleString(language === 'de' ? 'de-DE' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
  const incomplete = health && names.some((name) => ['partial', 'failed'].includes(health.stages[name].status));
  return (
    <section aria-label={t('updates.title')} className="mb-3 rounded-xl border border-white/10 px-3 py-2 text-xs">
      {!health ? <p className="text-secondary" role="status">{t('updates.unknown')}</p> : <>
        {incomplete && <p role="status" className="mb-2 text-amber-400">{t('updates.partial')}</p>}
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {(['signals', 'portfolio'] as const).map((name) => <p key={name}>
            <span className="font-semibold">{t(`updates.${name}`)}</span>{' · '}
            <span className="text-secondary">{t('updates.updated')} {stamp(health.stages[name].lastUpdatedAt)}</span>
          </p>)}
        </div>
        <details className="mt-2">
          <summary className="cursor-pointer text-secondary">{t('updates.details')}</summary>
          <div className="mt-2 grid gap-3 sm:grid-cols-3">
            {names.map((name) => {
              const stage = health.stages[name];
              return <div key={name}>
                <p className="font-semibold">{t(`updates.${name}`)} · {t(`updates.${stage.status === 'partial' ? 'partialStatus' : stage.status}`)}</p>
                {stage.reason && reasons.has(stage.reason) && <p className="mt-1 text-secondary">{t(`updates.${stage.reason}` as TKey)}</p>}
                {!!stage.quarantinedTickers?.length && <p className="text-secondary">{t('updates.quarantined')}: {stage.quarantinedTickers.join(', ')}</p>}
                {!!stage.affected && <p className="text-secondary">{t('updates.affected', { n: stage.affected })}</p>}
                {!!stage.tickers?.length && <p className="break-words text-secondary">{stage.tickers.join(', ')}</p>}
                {stage.priceAsOf && <p className="text-secondary">{t('updates.priceAsOf')}: {stage.priceAsOf}</p>}
                <p className="mt-1 text-secondary">{t('updates.checked')}: {stamp(stage.checkedAt)}</p>
                <p className="text-secondary">{t('updates.lastSuccess')}: {stamp(stage.lastSuccessAt)}</p>
              </div>;
            })}
          </div>
        </details>
      </>}
    </section>
  );
}
