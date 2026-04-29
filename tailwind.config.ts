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
        paper: 'var(--paper)',
        line: {
          DEFAULT: 'var(--line)',
          strong: 'var(--line-strong)',
        },
        ink: {
          DEFAULT: 'var(--ink)',
          soft: 'var(--ink-soft)',
        },
        muted: {
          DEFAULT: 'var(--muted)',
          soft: 'var(--muted-soft)',
        },
        warn: '#B5694C',
        warnSoft: '#A38046',
        warnTint: '#F4ECDC',
        priority: '#C97A6B',
        priorityTint: '#F4DCD2',
        prioritySoft: '#A85C42',
      },
      fontFamily: {
        serif: ['var(--font-serif)', 'Iowan Old Style', 'Georgia', 'serif'],
        sans: ['var(--font-sans)', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      animation: {
        'slide-up': 'slideUp 0.26s cubic-bezier(0.2, 0.7, 0.2, 1)',
        'fade-in': 'fadeIn 0.22s ease-out',
        tick: 'tick 2.4s ease-in-out infinite',
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
        tick: {
          '0%': { opacity: '0.55' },
          '50%': { opacity: '1' },
          '100%': { opacity: '0.55' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
