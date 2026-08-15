import { freshnessMeta } from '@/lib/format';

/** Feature 1 — signal freshness pill (🟢 FRESH / 🟡 RECENT / 🟠 AGING / 🔴 STALE). */
export function FreshnessBadge({ ageDays, className = '' }: { ageDays: number | null | undefined; className?: string }) {
  const m = freshnessMeta(ageDays);
  return (
    <span
      className={`badge ${className}`}
      style={{ color: m.color, background: `color-mix(in srgb, ${m.color} 16%, transparent)` }}
    >
      <span aria-hidden>{m.emoji}</span>
      {m.label}
    </span>
  );
}
