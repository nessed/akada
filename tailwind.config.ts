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
        warn: '#B5694C',
        warnSoft: '#A38046',
        warnTint: '#F4ECDC',
        priority: '#C97A6B',
        priorityTint: '#F4DCD2',
        prioritySoft: '#A85C42',
      },
      fontFamily: {
        // Default serif points at the user's --font-serif preference (Fraunces
        // by default; Cormorant/Lora/Merriweather selectable in Appearance).
        serif: ['var(--font-serif)', 'var(--font-fraunces)', 'Fraunces', 'Iowan Old Style', 'Georgia', 'serif'],
        sans: ['var(--font-sans)', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
        hand: ['var(--font-hand)', 'Caveat', 'Patrick Hand', 'cursive'],
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
