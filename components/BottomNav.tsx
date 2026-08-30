'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const tabs = [
  {
    href: '/dashboard',
    label: 'Today',
    icon: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 11l9-7 9 7" />
        <path d="M5 10v9h14v-9" />
      </svg>
    ),
  },
  {
    href: '/tasks',
    label: 'Tasks',
    icon: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
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
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 19V5" />
        <path d="M4 19h16" />
        <path d="M8 15v-4" />
        <path d="M12 15V8" />
        <path d="M16 15v-6" />
      </svg>
    ),
  },
];

export default function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-40 flex justify-around items-center px-4 pt-3"
      style={{
        paddingBottom: 'calc(20px + env(safe-area-inset-bottom))',
        background:
          'linear-gradient(180deg, transparent 0%, var(--bg) 30%)',
      }}
    >
      <div className="mx-auto max-w-2xl w-full flex justify-around items-center">
        {tabs.map((tab) => {
          const active = pathname === tab.href || pathname?.startsWith(tab.href + '/');
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`relative flex flex-col items-center gap-1 px-3.5 py-1.5 ${
                active ? 'text-primary' : 'text-muted-soft'
              }`}
              style={{ strokeWidth: active ? 1.8 : 1.4 }}
            >
              {tab.icon}
              <span className="text-[10px] font-medium tracking-[0.04em]">
                {tab.label}
              </span>
              {active && (
                <span className="absolute -bottom-0.5 w-[18px] h-[1.5px] rounded-full bg-primary" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
