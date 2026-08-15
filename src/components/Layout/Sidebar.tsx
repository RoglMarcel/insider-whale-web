import { useEffect, useState } from 'react';
import { useStore, type View } from '@/store/useStore';
import { GridIcon, StarIcon, HistoryIcon, SettingsIcon, NewsIcon } from '@/components/UI/icons';

import { api } from '@/lib/ipc';

interface NavItem {
  key: View;
  label: string;
  icon: (p: { size?: number }) => JSX.Element;
}

const NAV: NavItem[] = [
  { key: 'dashboard', label: 'Alerts', icon: GridIcon },
  { key: 'news', label: 'Live News', icon: NewsIcon },
  { key: 'watchlist', label: 'Watchlist', icon: StarIcon },
  { key: 'history', label: 'History', icon: HistoryIcon },
  { key: 'settings', label: 'Settings', icon: SettingsIcon },
];

export function Sidebar() {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const watchlistCount = useStore((s) => s.watchlist.length);
  const scheduleEnabled = useStore((s) => s.settings.scheduleEnabled);
  const [version, setVersion] = useState<string>('');

  useEffect(() => {
    api.app.getVersion().then(setVersion).catch(() => undefined);
  }, []);

  return (
    <aside className="glass m-3 mr-0 flex w-60 shrink-0 flex-col rounded-2xl p-4">
      {/* Logo */}
      <div className="mb-6 flex items-center px-2 pt-1">
        <div className="leading-tight">
          <div className="text-sm font-extrabold">Insider &amp; Whale</div>
          <div className="text-xs text-secondary">Terminal</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-1">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = view === item.key;
          return (
            <button
              key={item.key}
              className={`sidebar-item ${active ? 'sidebar-item-active' : ''}`}
              onClick={() => setView(item.key)}
            >
              <Icon size={18} />
              <span className="flex-1 text-left">{item.label}</span>
              {item.key === 'watchlist' && watchlistCount > 0 && (
                <span
                  className="rounded-full px-2 py-0.5 text-[11px] font-bold"
                  style={{
                    color: 'var(--accent-blue)',
                    background: 'color-mix(in srgb, var(--accent-blue) 16%, transparent)',
                  }}
                >
                  {watchlistCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto px-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-secondary">
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: scheduleEnabled ? 'var(--accent-green)' : 'var(--text-secondary)' }}
          />
          {scheduleEnabled ? 'Auto-refresh on' : 'Auto-refresh off'}
        </div>
        {version && <span className="text-[10px] text-secondary/50 font-medium select-none">v{version}</span>}
      </div>
    </aside>
  );
}
