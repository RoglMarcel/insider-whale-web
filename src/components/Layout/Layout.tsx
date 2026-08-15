import { useState, type ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { UpdateNotification } from '@/components/UI/UpdateNotification';
import { SourceHealthBanner } from '@/components/UI/SourceHealth';

export function Layout({ children }: { children: ReactNode }) {
  // Mobile nav drawer state — the sidebar is a static column on lg+, an
  // off-canvas drawer below that (see Sidebar).
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="relative z-10 flex h-full w-full overflow-hidden">
      {/* Backdrop behind the mobile drawer */}
      {navOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setNavOpen(false)}
          aria-hidden="true"
        />
      )}
      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <Header onMenuClick={() => setNavOpen(true)} />
        <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 lg:px-8">
          <SourceHealthBanner />
          {children}
        </main>
      </div>
      <UpdateNotification />
    </div>
  );
}
