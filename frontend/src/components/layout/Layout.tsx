import type { ReactNode } from 'react';
import { Navbar } from './Navbar';

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-netflix-bg">
      <Navbar />
      <main className="min-h-screen">{children}</main>
      <footer className="border-t border-netflix-border px-4 py-8 text-center text-xs text-netflix-muted sm:px-12">
        LupeFlix — tu biblioteca personal de cine y series.
      </footer>
    </div>
  );
}
