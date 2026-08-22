import { useI18n } from '@/hooks/useI18n';

/** Feature 4 — pulsing combo badge (insider buying + unusual options flow). */
export function ComboBadge({ className = '', pulse = true }: { className?: string; pulse?: boolean }) {
  const { t } = useI18n();
  return (
    <span
      className={`badge ${pulse ? 'combo-pulse' : ''} ${className}`}
      style={{ color: '#fff', background: 'var(--accent-blue)', border: 'none' }}
      title={t('badge.comboTitle')}
    >
      ⚡ {t('badge.combo')}
    </span>
  );
}
