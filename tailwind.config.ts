import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: 'var(--bg)',
          tint: 'var(--bg-tint)',
        },
        paper: {
          DEFAULT: 'var(--paper)',
          2: 'var(--paper-2)',
        },
        line: {
          DEFAULT: 'var(--line)',
          strong: 'var(--line-strong)',
          soft: 'var(--line-soft)',
        },
        ink: {
          DEFAULT: 'var(--ink)',
          soft: 'var(--ink-soft)',
        },
        muted: {
          DEFAULT: 'var(--muted)',
          soft: 'var(--muted-soft)',
        },
        primary: {
          DEFAULT: 'var(--primary)',
          contrast: 'var(--primary-contrast)',
          tint: 'var(--primary-tint)',
        },
        // Course pastel palette as Tailwind utilities (text-sage, bg-sage-tint, …)
        sage: { DEFAULT: 'var(--sage)', tint: 'var(--sage-tint)' },
        rose: { DEFAULT: 'var(--rose)', tint: 'var(--rose-tint)' },
        lav: { DEFAULT: 'var(--lav)', tint: 'var(--lav-tint)' },
        peach: { DEFAULT: 'var(--peach)', tint: 'var(--peach-tint)' },
        sky: { DEFAULT: 'var(--sky)', tint: 'var(--sky-tint)' },
        clay: { DEFAULT: 'var(--clay)', tint: 'var(--clay-tint)' },
        butter: { DEFAULT: 'var(--butter)', tint: 'var(--butter-tint)' },
        mint: { DEFAULT: 'var(--mint)', tint: 'var(--mint-tint)' },
        slate: { DEFAULT: 'var(--slate)', tint: 'var(--slate-tint)' },
        mauve: { DEFAULT: 'var(--mauve)', tint: 'var(--mauve-tint)' },
        warn: 'var(--warn)',
        warnSoft: 'var(--warn-soft)',
        warnTint: 'var(--warn-tint)',
        priority: 'var(--priority)',
        priorityTint: 'var(--priority-tint)',
        prioritySoft: 'var(--priority-soft)',
      },
      fontFamily: {
        // Three families, no picker. --font-serif resolves to Source Serif 4
        // (see :root in globals.css); the other two come straight from the
        // next/font variables layout.tsx puts on <html>.
        serif: ['var(--font-serif)', 'Source Serif 4', 'Iowan Old Style', 'Georgia', 'serif'],
        sans: ['var(--font-sans)', 'Schibsted Grotesk', '-apple-system', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'Space Mono', 'ui-monospace', 'monospace'],
      },
      animation: {
        'slide-up': 'slideUp 0.26s cubic-bezier(0.2, 0.7, 0.2, 1)',
        'fade-in': 'fadeIn 0.22s ease-out',
        rise: 'rise 0.3s cubic-bezier(0.2, 0.7, 0.2, 1)',
        // The slow pulse under a running timer and beside a caret. Never
        // faster than this: a frantic tick is the opposite of the point.
        tick: 'tick 2.4s ease-in-out infinite',
        caret: 'tick 1.2s ease-in-out infinite',
      },
      keyframes: {
        slideUp: {
          '0%': { transform: 'translateY(12px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        rise: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        tick: {
          '0%': { opacity: '0.5' },
          '50%': { opacity: '1' },
          '100%': { opacity: '0.5' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
