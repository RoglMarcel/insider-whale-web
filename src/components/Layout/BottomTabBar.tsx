import { useStore, type View } from '@/store/useStore';
import { GridIcon, StarIcon, HistoryIcon, SettingsIcon, NewsIcon } from '@/components/UI/icons';

interface Tab {
  key: View;
  label: string;
  icon: (p: { size?: number }) => JSX.Element;
}

/** Same five destinations as the sidebar, in the same order. */
const TABS: Tab[] = [
  { key: 'dashboard', label: 'Alerts', icon: GridIcon },
  { key: 'news', label: 'News', icon: NewsIcon },
  { key: 'watchlist', label: 'Watch', icon: StarIcon },
  { key: 'history', label: 'History', icon: HistoryIcon },
  { key: 'settings', label: 'Settings', icon: SettingsIcon },
];

/**
 * Bottom tab bar — the mobile navigation (DESIGN.md §8).
 *
 * Replaces the hamburger drawer below `md`, which cost two taps per view and put
 * the trigger in the hardest corner to reach with a thumb. Hidden from `md` up,
 * where the drawer (and above `lg`, the static sidebar) takes over, so the
 * desktop layout is untouched.
 *
 * Each button is a full-height 44px+ target and carries its own safe-area
 * padding so it clears the iPhone home indicator.
 */
export function BottomTabBar() {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const watchlistCount = useStore((s) => s.watchlist.length);

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 flex md:hidden"
      style={{
        paddingBottom: 'var(--sa-bottom)',
        background: 'var(--bg-glass)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        borderTop: '1px solid var(--border-glass)',
      }}
    >
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const active = view === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            aria-current={active ? 'page' : undefined}
            onClick={() => setView(tab.key)}
            className="relative flex flex-1 flex-col items-center justify-center gap-0.5 transition-colors"
            style={{
              height: 'var(--tabbar-h)',
              color: active ? 'var(--accent-blue)' : 'var(--text-secondary)',
            }}
          >
            <span className="relative flex items-center justify-center">
              <Icon size={22} />
              {tab.key === 'watchlist' && watchlistCount > 0 && (
                <span
                  className="absolute -right-2.5 -top-1.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-[11px] font-bold tabular-nums text-white"
                  style={{ background: 'var(--accent-blue)' }}
                >
                  {watchlistCount > 99 ? '99+' : watchlistCount}
                </span>
              )}
            </span>
            <span className="text-xs" style={{ fontWeight: active ? 700 : 500 }}>
              {tab.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
