import { earningsChipColor } from '@/lib/format';

/** Feature 5 — earnings countdown chip, shown only when earnings are ≤ 30 days out. */
export function EarningsChip({
  days,
  timing,
  className = '',
}: {
  days: number | null | undefined;
  timing?: string | null;
  className?: string;
}) {
  if (days == null || days < 0 || days > 30) return null;
  const color = earningsChipColor(days);
  return (
    <span
      className={`badge ${className}`}
      style={{ color, background: `color-mix(in srgb, ${color} 16%, transparent)` }}
      title={timing ? `Earnings ${timing === 'AMC' ? 'after market close' : 'before market open'}` : 'Upcoming earnings'}
    >
      📅 Earnings in {days}d
    </span>
  );
}
