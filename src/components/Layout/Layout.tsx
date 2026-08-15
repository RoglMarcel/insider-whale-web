import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { UpdateNotification } from '@/components/UI/UpdateNotification';
import { SourceHealthBanner } from '@/components/UI/SourceHealth';

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="relative z-10 flex h-full w-full overflow-hidden">
      <Sidebar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <Header />
        <main className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
          <SourceHealthBanner />
          {children}
        </main>
      </div>
      <UpdateNotification />
    </div>
  );
}
