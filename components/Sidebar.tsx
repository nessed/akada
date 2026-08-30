'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import AkadaMark from './notebook/AkadaMark';

/**
 * Laptop / landscape-tablet navigation. BottomNav (`lg:hidden`) covers phone
 * and portrait tablet; this covers `lg:` and up. Same three destinations —
 * this doesn't add navigation, it relocates it, so the two never drift out
 * of sync with each other.
 */
const tabs = [
  {
    href: '/dashboard',
    label: 'Today',
    icon: (
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 11l9-7 9 7" />
        <path d="M5 10v9h14v-9" />
      </svg>
    ),
  },
  {
    href: '/tasks',
    label: 'Tasks',
    icon: (
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 6h12" />
        <path d="M8 12h12" />
        <path d="M8 18h12" />
        <circle cx="4" cy="6" r="1" />
        <circle cx="4" cy="12" r="1" />
        <circle cx="4" cy="18" r="1" />
      </svg>
    ),
  },
  {
    href: '/stats',
    label: 'Stats',
    icon: (
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19V5" />
        <path d="M4 19h16" />
        <path d="M8 15v-4" />
        <path d="M12 15V8" />
        <path d="M16 15v-6" />
      </svg>
    ),
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  return (
    <aside
      className="hidden lg:flex fixed inset-y-0 left-0 z-40 w-64 flex-col border-r border-line bg-paper"
      style={{ paddingTop: 'max(env(safe-area-inset-top), 28px)', paddingBottom: 'max(env(safe-area-inset-bottom), 20px)' }}
    >
      <Link href="/dashboard" className="flex items-center gap-3 px-7 pb-8 text-ink">
        <AkadaMark size={30} />
        <div>
          <p className="m-0 font-serif text-[19px] font-medium tracking-[-0.02em] leading-none">
            Akada
          </p>
          <p className="mt-1 mb-0 text-[9px] tracking-[0.2em] uppercase text-muted font-semibold">
            Study Planner
          </p>
        </div>
      </Link>

      <nav className="flex-1 px-4">
        {tabs.map((tab) => {
          const active = pathname === tab.href || pathname?.startsWith(tab.href + '/');
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="relative flex items-center gap-3 rounded-xl px-3.5 py-3 mb-1 transition-colors"
              style={{
                color: active ? 'var(--ink)' : 'var(--muted)',
                background: active ? 'var(--bg-tint)' : 'transparent',
              }}
            >
              <span style={{ strokeWidth: active ? 1.8 : 1.4 }}>{tab.icon}</span>
              <span className="text-[14px] font-medium">{tab.label}</span>
            </Link>
          );
        })}
      </nav>

      <p className="px-7 text-[11px] text-muted-soft font-serif italic">
        Akada · made with quiet hands
      </p>
    </aside>
  );
}
