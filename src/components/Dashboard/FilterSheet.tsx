import { Sheet } from '@/components/UI/Sheet';
import { useSignals } from '@/hooks/useSignals';
import type { TimeRange, TypeFilter, ConvictionFilter, SortKey } from '@/types';

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

/** Full-width option buttons — a 44px row per choice beats a cramped segment. */
function Group<T extends string>({
  title,
  options,
  value,
  onChange,
}: {
  title: string;
  options: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-[13px] font-semibold uppercase tracking-wide text-secondary">{title}</div>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const active = o.key === value;
          return (
            <button
              key={o.key}
              type="button"
              onClick={() => onChange(o.key)}
              className="rounded-lg px-3.5 text-[15px] font-semibold transition-colors"
              style={{
                minHeight: 44,
                background: active ? 'var(--accent-blue)' : 'var(--bg-glass)',
                color: active ? '#fff' : 'var(--text-primary)',
                border: `1px solid ${active ? 'transparent' : 'var(--border-glass)'}`,
              }}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Mobile filter sheet — replaces four segmented controls that produced ~24px tap
 * targets and four wrapped rows above the signal list (AUDIT B1/H6).
 */
export function FilterSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { filter, setFilter } = useSignals();

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Filter"
      footer={
        <button
          type="button"
          className="btn btn-primary w-full"
          style={{ minHeight: 44 }}
          onClick={onClose}
        >
          Show results
        </button>
      }
    >
      <div className="flex flex-col gap-5">
        <Group title="Time range" options={TIME} value={filter.timeRange} onChange={(v) => setFilter({ timeRange: v })} />
        <Group title="Type" options={TYPE} value={filter.type} onChange={(v) => setFilter({ type: v })} />
        <Group title="Conviction" options={CONVICTION} value={filter.conviction} onChange={(v) => setFilter({ conviction: v })} />
        <Group title="Sort by" options={SORT} value={filter.sortBy ?? 'score'} onChange={(v) => setFilter({ sortBy: v })} />
        <div className="flex flex-col gap-2">
          <div className="text-[13px] font-semibold uppercase tracking-wide text-secondary">Highlight</div>
          <button
            type="button"
            onClick={() => setFilter({ bigPlayersOnly: !filter.bigPlayersOnly })}
            className="flex items-center justify-between rounded-lg px-3.5 text-[15px] font-semibold"
            style={{
              minHeight: 44,
              background: filter.bigPlayersOnly ? 'color-mix(in srgb, #f59e0b 14%, transparent)' : 'var(--bg-glass)',
              color: filter.bigPlayersOnly ? '#fbbf24' : 'var(--text-primary)',
              border: `1px solid ${filter.bigPlayersOnly ? 'color-mix(in srgb, #f59e0b 35%, transparent)' : 'var(--border-glass)'}`,
            }}
          >
            <span>★ Big Players Only</span>
            <span className="text-[13px] text-secondary">{filter.bigPlayersOnly ? 'On' : 'Off'}</span>
          </button>
        </div>
      </div>
    </Sheet>
  );
}
