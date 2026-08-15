import { useMemo, useState } from 'react';
import { useSignals } from '@/hooks/useSignals';
import { StatCards } from './StatCards';
import { SignalGrid } from './SignalGrid';
import { FilterBar } from './FilterBar';
import { SearchIcon } from '@/components/UI/icons';
import { api, isWeb } from '@/lib/ipc';

export function Dashboard() {
  const { filteredSignals, filter } = useSignals();
  const [searchQuery, setSearchQuery] = useState('');
  const [exporting, setExporting] = useState(false);

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

  const searched = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return sorted;
    return sorted.filter((s) => {
      const tickerMatch = s.ticker.toLowerCase().includes(query);
      const companyMatch = s.companyName?.toLowerCase().includes(query);
      const insiderMatch = s.rawTrades?.some((t) => t.insiderName.toLowerCase().includes(query));
      return tickerMatch || companyMatch || insiderMatch;
    });
  }, [sorted, searchQuery]);

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <StatCards />
      
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <FilterBar />
        <div className="flex w-full items-center gap-2 md:w-auto">
          <div className="relative w-full md:max-w-xs">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-secondary">
              <SearchIcon size={18} />
            </span>
            <input
              type="text"
              className="input pl-10 pr-4 py-2"
              placeholder="Search ticker, company, or insider..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
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

      <SignalGrid signals={searched} hasSearchQuery={!!searchQuery.trim()} />
    </div>
  );
}
