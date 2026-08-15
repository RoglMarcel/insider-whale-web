import { type ConvictionLevel, type FreshnessLevel, getFreshnessLevel } from '@/types';

/** Compact USD: $5.2M, $450K, $12,340. */
export function formatUSD(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

export function formatPrice(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  return `${sign}$${abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

/** Compact count (no $): 14.7B, 408M, 25K, 950. For share/float counts. */
export function formatCompact(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(0)}K`;
  return `${sign}${abs.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

/** Data-confidence colour: green > 75, yellow 50–75, red < 50. */
export function confidenceColor(confidence: number | null | undefined): string {
  if (confidence == null || !Number.isFinite(confidence)) return 'var(--text-secondary)';
  if (confidence > 75) return 'var(--accent-green)';
  if (confidence >= 50) return 'var(--accent-yellow)';
  return 'var(--accent-red)';
}

export function formatPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

/** Party display: single-letter initial + a colour class (Dem blue / Rep red / Ind grey). */
export function partyMeta(party: string | null | undefined): { initial: string; colorClass: string; color: string } {
  const p = (party ?? '').toLowerCase();
  if (p.startsWith('d')) return { initial: 'D', colorClass: 'text-blue-400', color: 'var(--accent-blue)' };
  if (p.startsWith('r')) return { initial: 'R', colorClass: 'text-red-400', color: 'var(--accent-red)' };
  if (p.startsWith('i')) return { initial: 'I', colorClass: 'text-gray-400', color: 'var(--text-secondary)' };
  return { initial: '—', colorClass: 'text-gray-400', color: 'var(--text-secondary)' };
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return 'never';
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return 'never';
  const sec = Math.round((Date.now() - d) / 1000);
  if (sec < 60) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}

export function convictionColor(level: ConvictionLevel): string {
  switch (level) {
    case 'HIGH':
      return 'var(--accent-green)';
    case 'WATCH':
      return 'var(--accent-yellow)';
    default:
      return 'var(--text-secondary)';
  }
}

export function scoreColor(score: number): string {
  if (score >= 80) return 'var(--accent-green)';
  if (score >= 50) return 'var(--accent-yellow)';
  return 'var(--text-secondary)';
}

export function convictionLabel(level: ConvictionLevel): string {
  switch (level) {
    case 'HIGH':
      return 'High Conviction';
    case 'WATCH':
      return 'Watch';
    default:
      return 'Low Signal';
  }
}

// ── Feature 1 — freshness badge meta ──
export interface FreshnessMeta {
  level: FreshnessLevel;
  label: string;
  emoji: string;
  color: string;
}

export function freshnessMeta(ageDays: number | null | undefined): FreshnessMeta {
  const level = getFreshnessLevel(ageDays ?? null);
  switch (level) {
    case 'fresh':
      return { level, label: 'Fresh', emoji: '🟢', color: 'var(--accent-green)' };
    case 'recent':
      return { level, label: 'Recent', emoji: '🟡', color: 'var(--accent-yellow)' };
    case 'aging':
      return { level, label: 'Aging', emoji: '🟠', color: '#ff9f0a' };
    default:
      return { level, label: 'Stale', emoji: '🔴', color: 'var(--accent-red)' };
  }
}

export function ageLabel(ageDays: number | null | undefined): string {
  if (ageDays == null) return 'unknown age';
  if (ageDays < 1) return '< 24h ago';
  const d = Math.round(ageDays);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}

// ── Feature 5 — earnings countdown chip color ──
export function earningsChipColor(days: number | null | undefined): string {
  if (days == null) return 'var(--text-secondary)';
  if (days <= 7) return 'var(--accent-red)';
  if (days <= 15) return 'var(--accent-yellow)';
  return 'var(--text-secondary)';
}

// ── Feature 6 — accuracy tier color ──
export function accuracyColor(accuracy: number): string {
  if (accuracy > 0.65) return 'var(--accent-green)';
  if (accuracy >= 0.5) return 'var(--accent-yellow)';
  return 'var(--text-secondary)';
}
