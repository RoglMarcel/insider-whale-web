import type { PoliticianComboTier } from '@/types';

/**
 * Congressional-signal visual hierarchy. The tier badge REPLACES the regular
 * orange COMBO badge whenever a politician combo tier is present; MEGA_SIGNAL
 * additionally renders a full-width pulsing banner above the card.
 */

const TIER_STYLE: Record<PoliticianComboTier, { bg: string; border: string; label: string; title: string }> = {
  POLITICIAN_INSIDER: {
    bg: 'var(--accent-purple)',
    border: 'var(--accent-purple)',
    label: '🏛️ + 👔 Combo',
    title: 'Politician + insider buying on the same ticker',
  },
  POLITICIAN_OPTIONS: {
    bg: 'var(--accent-blue)',
    border: 'var(--accent-blue)',
    label: '🏛️ + 🐋 Combo',
    title: 'Politician buying + unusual bullish options flow',
  },
  MEGA_SIGNAL: {
    bg: 'var(--accent-red)',
    border: 'var(--accent-red)',
    label: '🚨 MEGA',
    title: 'MEGA SIGNAL — politician + insider + options all aligned',
  },
};

/** Small tier badge for the signal card / modal header. */
export function PoliticianComboBadge({ tier, className = '' }: { tier: PoliticianComboTier; className?: string }) {
  const s = TIER_STYLE[tier];
  return (
    <span
      className={`badge ${tier === 'MEGA_SIGNAL' ? 'mega-signal-banner' : ''} ${className}`}
      style={{ color: '#fff', background: s.bg, border: 'none' }}
      title={s.title}
    >
      {s.label}
    </span>
  );
}

/** Full-width pulsing red banner for MEGA_SIGNAL — unmissable, sits above the card. */
export function MegaSignalBanner({ className = '' }: { className?: string }) {
  return (
    <div
      className={`mega-signal-banner flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2 text-center text-xs font-extrabold uppercase tracking-wide ${className}`}
      style={{
        color: '#fff',
        background: 'linear-gradient(135deg, #ff3b30 0%, #c81e14 100%)',
        border: '1px solid color-mix(in srgb, var(--accent-red) 60%, #fff 0%)',
        boxShadow: '0 0 18px rgba(255, 59, 48, 0.45)',
      }}
      title="MEGA SIGNAL — politician + insider + options confirmed"
    >
      🚨 MEGA SIGNAL — Politician + Insider + Options confirmed
    </div>
  );
}

/** "🏛️ N politicians" count badge. */
export function PoliticianCountBadge({ count, className = '' }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-bold ${className}`}
      style={{ color: 'var(--accent-purple)', background: 'color-mix(in srgb, var(--accent-purple) 16%, transparent)' }}
      title={`${count} member${count === 1 ? '' : 's'} of Congress traded this ticker`}
    >
      🏛️ {count} politician{count === 1 ? '' : 's'}
    </span>
  );
}
