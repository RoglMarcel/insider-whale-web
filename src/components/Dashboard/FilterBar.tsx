import type { TimeRange, TypeFilter, ConvictionFilter, SortKey } from '@/types';
import { useSignals } from '@/hooks/useSignals';

const TIME: { key: TimeRange; label: string }[] = [
  { key: '24h', label: 'Today' },
  { key: '48h', label: '48h' },
  { key: 'week', label: 'This Week' },
  { key: 'all', label: 'All' },
];

const TYPE: { key: TypeFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'openmarket', label: 'Open Market' },
  { key: 'options', label: 'Options' },
  { key: 'combo', label: 'Combo' },
];

const CONVICTION: { key: ConvictionFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'HIGH', label: 'High' },
  { key: 'WATCH', label: 'Watch' },
];

const SORT: { key: SortKey; label: string }[] = [
  { key: 'score', label: 'Score' },
  { key: 'confidence', label: 'Confidence' },
];

function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  size?: 'md' | 'sm';
}) {
  return (
    <div
      className="inline-flex rounded-xl p-1"
      style={{ background: 'var(--bg-glass)', border: '1px solid var(--border-glass)' }}
    >
      {options.map((o) => {
        const active = o.key === value;
        return (
          <button
            key={o.key}
            onClick={() => onChange(o.key)}
            className={`rounded-lg font-semibold transition-all ${size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-sm'}`}
            style={
              active
                ? { background: 'var(--accent-blue)', color: '#fff' }
                : { color: 'var(--text-secondary)', background: 'transparent' }
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function FilterBar() {
  const { filter, setFilter } = useSignals();
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-row items-center justify-between gap-4 flex-wrap">
        <Segmented options={TIME} value={filter.timeRange} onChange={(v) => setFilter({ timeRange: v })} />
        <button
          onClick={() => setFilter({ bigPlayersOnly: !filter.bigPlayersOnly })}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-all duration-150 border select-none ${
            filter.bigPlayersOnly
              ? 'bg-amber-500/10 text-amber-400 border-amber-500/30 shadow-[0_0_12px_rgba(245,158,11,0.15)]'
              : 'text-secondary bg-transparent hover:bg-[rgba(255,255,255,0.04)] hover:text-white border-transparent'
          }`}
        >
          <span style={filter.bigPlayersOnly ? { color: '#fbbf24' } : undefined}>★</span>
          Big Players Only
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-secondary">Type</span>
          <Segmented size="sm" options={TYPE} value={filter.type} onChange={(v) => setFilter({ type: v })} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-secondary">Conviction</span>
          <Segmented
            size="sm"
            options={CONVICTION}
            value={filter.conviction}
            onChange={(v) => setFilter({ conviction: v })}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-secondary">Sort</span>
          <Segmented
            size="sm"
            options={SORT}
            value={filter.sortBy ?? 'score'}
            onChange={(v) => setFilter({ sortBy: v })}
          />
        </div>
      </div>
    </div>
  );
}
