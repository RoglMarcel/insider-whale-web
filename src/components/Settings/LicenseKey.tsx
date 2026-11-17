import { useRef, useState } from 'react';
import { GlassCard } from '@/components/UI/GlassCard';
import { useI18n } from '@/hooks/useI18n';
import { formatDate } from '@/lib/format';
import { readLicenseKey } from '@/lib/licenseKey';
import { useAccessSession } from '@/components/Access/AccessContext';

/**
 * The key holder's own license key: hidden until asked for, then confirmed,
 * then shown with a copy button. The key comes from this device only — the
 * access service keeps nothing but a hash (see `src/lib/licenseKey.ts`).
 */
export function LicenseKey() {
  const { t, language } = useI18n();
  const session = useAccessSession();
  const [stage, setStage] = useState<'hidden' | 'confirm' | 'shown'>('hidden');
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle');
  const field = useRef<HTMLElement>(null);
  const key = readLicenseKey();
  const expires = session?.expiresAt == null ? t('set.licenseNoExpiry')
    : t('set.licenseValidUntil', { date: formatDate(new Date(session.expiresAt).toISOString(), language) });

  const copyKey = async () => {
    try {
      await navigator.clipboard.writeText(key!);
      setCopy('copied');
    } catch {
      if (field.current) getSelection()?.selectAllChildren(field.current);
      setCopy('failed');
    }
  };
  const hide = () => { setStage('hidden'); setCopy('idle'); };

  return <GlassCard className="p-5 license-key">
    <h3 className="section-title">{t('set.licenseTitle')}</h3>
    <p className="mb-3 text-xs text-secondary">{t('set.licenseHint')} {expires}.</p>
    {!key ? <p className="text-sm text-secondary">{t('set.licenseMissing')}</p>
      : stage === 'hidden' ? <button type="button" className="btn" onClick={() => setStage('confirm')}>{t('set.licenseShow')}</button>
      : stage === 'confirm' ? <div role="alertdialog" aria-labelledby="license-confirm" className="flex flex-col gap-3">
          <p id="license-confirm" className="text-sm">{t('set.licenseConfirm')}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn" onClick={() => setStage('shown')} autoFocus>{t('set.licenseReveal')}</button>
            <button type="button" className="btn" onClick={hide}>{t('set.licenseCancel')}</button>
          </div>
        </div>
      : <div className="flex flex-col gap-2">
          {/* Wraps instead of scrolling, so the whole key is visible on a phone; one tap selects it all. */}
          <code ref={field} aria-label={t('set.licenseTitle')} className="block select-all break-all rounded-lg px-3 py-2 font-mono text-sm"
            style={{ background: 'var(--bg-glass)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)' }}>{key}</code>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn" onClick={() => void copyKey()}>{copy === 'copied' ? t('set.licenseCopied') : t('set.licenseCopy')}</button>
            <button type="button" className="btn" onClick={hide}>{t('set.licenseHide')}</button>
          </div>
          {copy === 'failed' && <p className="text-xs text-secondary" role="status">{t('set.licenseCopyFailed')}</p>}
        </div>}
  </GlassCard>;
}
