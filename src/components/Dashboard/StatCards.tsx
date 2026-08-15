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
      className="flex items-center gap-4 p-5"
      style={highlight ? { border: `1px solid color-mix(in srgb, ${accent} 45%, transparent)` } : undefined}
    >
      <div
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
        style={{ background: `color-mix(in srgb, ${accent} 16%, transparent)`, color: accent }}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-xs font-medium uppercase tracking-wide text-secondary">{label}</div>
        <div className="text-2xl font-extrabold tabular-nums font-mono-terminal" style={highlight ? { color: accent } : undefined}>
          {value}
        </div>
        {sub && <div className="text-xs text-secondary">{sub}</div>}
      </div>
    </GlassCard>
  );
}

export function StatCards() {
  const { stats } = useSignals();
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
