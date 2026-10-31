import { GlassCard } from '@/components/UI/GlassCard';
import { useStore } from '@/store/useStore';
import { useSignals } from '@/hooks/useSignals';
import { formatUSD } from '@/lib/format';
import { useI18n } from '@/hooks/useI18n';

function StatCard({
  label,
  value,
  accent,
  sub,
  highlight = false,
}: {
  label: string;
  value: string | number;
  accent: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <GlassCard className="summary-stat">
      <div className="min-w-0">
        <div className="summary-stat-label">
          {label}
        </div>
        <div
          className="summary-stat-value"
          style={highlight ? { color: accent } : undefined}
        >
          {value}
        </div>
        {sub && <div className="summary-stat-context">{sub}</div>}
      </div>
    </GlassCard>
  );
}

export function StatCards() {
  const { stats } = useSignals();
  const initialized = useStore((s) => s.initialized);
  const available = useStore((s) => s.initialized && (!s.scrapeStatus.error?.includes('signals.json') || s.signals.length > 0));
  const { t } = useI18n();
  return (
    // 2×2 on mobile instead of four stacked cards. Considered a horizontally
    // snapping row (DESIGN.md §7) and rejected it after comparing both: the row
    // is 72px tall but hides two of the four numbers behind a scroll gesture,
    // while the 2×2 grid shows all four in ~136px and needs no discovery.
    <div data-testid="summary-stats" className="grid grid-cols-2 gap-2 lg:grid-cols-2 lg:gap-4 xl:grid-cols-4">
      <StatCard
        label={t('stats.totalSignals')}
        value={available ? stats.total : '—'}
        accent="var(--accent-blue)"
        sub={available ? t('stats.insiderBuys', { amount: formatUSD(stats.totalVolume) }) : t(initialized ? 'ui.unavailable' : 'common.loading')}
      />
      <StatCard
        label={t('stats.highConviction')}
        value={available ? stats.high : '—'}
        accent="var(--accent-green)"
        sub={available ? t('stats.onWatch', { count: stats.watch }) : undefined}
      />
      <StatCard
        label={t('stats.unusualOptions')}
        value={available ? stats.options : '—'}
        accent="var(--accent-purple)"
        sub={available ? t('stats.tickersWithFlow') : undefined}
      />
      <StatCard
        label={t('stats.comboSignals')}
        value={available ? stats.combos : '—'}
        accent="var(--accent-blue)"
        sub={available ? t('stats.insiderPlusOptions') : undefined}
        highlight
      />
    </div>
  );
}
