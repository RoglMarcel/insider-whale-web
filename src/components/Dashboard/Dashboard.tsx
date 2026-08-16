import { useMemo, useState } from 'react';
import { useSignals } from '@/hooks/useSignals';
import { StatCards } from './StatCards';
import { SignalGrid } from './SignalGrid';
import { FilterBar, ActiveFilterChips } from './FilterBar';
import { FilterSheet } from './FilterSheet';
import { SearchIcon } from '@/components/UI/icons';
import { api, isWeb } from '@/lib/ipc';

export function Dashboard() {
  // `search` lives in the shared filter (not local state) so the stat cards above
  // describe exactly the set rendered below.
  const { filteredSignals, filter, setFilter } = useSignals();
  const searchQuery = filter.search ?? '';
  const [exporting, setExporting] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const activeFilterCount =
    (filter.timeRange !== 'all' ? 1 : 0) +
    (filter.type !== 'all' ? 1 : 0) +
    (filter.conviction !== 'all' ? 1 : 0) +
    (filter.bigPlayersOnly ? 1 : 0);

  const onExport = async () => {
    setExporting(true);
    try {
      await api.signals.exportCsv();
    } finally {
      setExporting(false);
    }
  };

  const sorted = useMemo(() => {
    const list = [...filteredSignals];
    if (filter.sortBy === 'confidence') {
      list.sort((a, b) => (b.breakdown?.confidence ?? 0) - (a.breakdown?.confidence ?? 0) || b.score - a.score);
    } else {
      list.sort((a, b) => b.score - a.score);
    }
    return list;
  }, [filteredSignals, filter.sortBy]);

  // Search is applied by filterSignals now (see SignalFilter.search), so `sorted`
  // is already the searched set.
  const searched = sorted;

  return (
    <div className="flex flex-col gap-3 animate-fade-in lg:gap-6">
      <StatCards />

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-4">
        <FilterBar />
        <div className="flex w-full items-center gap-2 md:w-auto">
          <div className="relative w-full md:max-w-xs">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-secondary">
              <SearchIcon size={18} />
            </span>
            <input
              type="text"
              className="input pl-10 pr-4"
              style={{ minHeight: 44 }}
              placeholder="Search ticker, company, insider…"
              value={searchQuery}
              onChange={(e) => setFilter({ search: e.target.value })}
            />
          </div>
          {/* Mobile: one button opens every filter option at 44px per row. */}
          <button
            type="button"
            className="btn shrink-0 md:hidden"
            style={{ minHeight: 44 }}
            onClick={() => setFilterOpen(true)}
            aria-label="Open filters"
          >
            Filter
            {activeFilterCount > 0 && (
              <span
                className="ml-0.5 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1 text-[11px] font-bold text-white"
                style={{ background: 'var(--accent-blue)' }}
              >
                {activeFilterCount}
              </span>
            )}
          </button>
          {/* CSV export writes a file via the desktop shell — not available on the web build. */}
          {!isWeb && (
            <button
              className="btn shrink-0"
              onClick={() => void onExport()}
              disabled={exporting || filteredSignals.length === 0}
              title="Export the current signals to a CSV file"
            >
              {exporting ? 'Exporting…' : 'Export CSV'}
            </button>
          )}
        </div>
      </div>

      <ActiveFilterChips />

      <SignalGrid signals={searched} hasSearchQuery={!!searchQuery.trim()} />

      <FilterSheet open={filterOpen} onClose={() => setFilterOpen(false)} />
    </div>
  );
}
