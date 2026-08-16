import type { ReactNode } from 'react';
import { GlassCard } from '@/components/UI/GlassCard';
import { useSignals } from '@/hooks/useSignals';
import { LayersIcon, TrendingUpIcon, ActivityIcon } from '@/components/UI/icons';
import { formatUSD } from '@/lib/format';

function StatCard({
  icon,
  label,
  value,
  accent,
  sub,
  highlight = false,
}: {
  icon: ReactNode;
  label: string;
  value: string | number;
  accent: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <GlassCard
      className="flex items-center gap-2.5 p-3 lg:gap-4 lg:p-5"
      style={highlight ? { border: `1px solid color-mix(in srgb, ${accent} 45%, transparent)` } : undefined}
    >
      {/* The 48px icon tile is decoration; on a phone it costs a third of the
          tile width, so it shrinks and the number keeps the space. */}
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg lg:h-12 lg:w-12 lg:rounded-xl"
        style={{ background: `color-mix(in srgb, ${accent} 16%, transparent)`, color: accent }}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <div className="truncate text-xs font-medium uppercase tracking-wide text-secondary">
          {label}
        </div>
        <div
          className="text-lg font-extrabold leading-tight tabular-nums font-mono-terminal lg:text-2xl"
          style={highlight ? { color: accent } : undefined}
        >
          {value}
        </div>
        {/* The sub-line is context, not the number — it earns its row from lg up. */}
        {sub && <div className="hidden truncate text-xs text-secondary lg:block">{sub}</div>}
      </div>
    </GlassCard>
  );
}

export function StatCards() {
  const { stats } = useSignals();
  return (
    // 2×2 on mobile instead of four stacked cards. Considered a horizontally
    // snapping row (DESIGN.md §7) and rejected it after comparing both: the row
    // is 72px tall but hides two of the four numbers behind a scroll gesture,
    // while the 2×2 grid shows all four in ~136px and needs no discovery.
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-2 lg:gap-4 xl:grid-cols-4">
      <StatCard
        icon={<LayersIcon size={22} />}
        label="Total Signals"
        value={stats.total}
        accent="var(--accent-blue)"
        sub={`${formatUSD(stats.totalVolume)} insider buys`}
      />
      <StatCard
        icon={<TrendingUpIcon size={22} />}
        label="High Conviction"
        value={stats.high}
        accent="var(--accent-green)"
        sub={`${stats.watch} on watch`}
      />
      <StatCard
        icon={<ActivityIcon size={22} />}
        label="Unusual Options"
        value={stats.options}
        accent="var(--accent-purple)"
        sub="tickers with flow"
      />
      <StatCard
        icon={<span className="text-xl">⚡</span>}
        label="Combo Signals"
        value={stats.combos}
        accent="var(--accent-blue)"
        sub="insider + options"
        highlight
      />
    </div>
  );
}
