/** @type {import('tailwindcss').Config} */
const channel = (name) => `rgb(var(--${name}) / <alpha-value>)`

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: channel('bg'),
        surface: channel('surface'),
        surface2: channel('surface-2'),
        line: channel('line'),
        ink: channel('ink'),
        ink2: channel('ink-2'),
        muted: channel('muted'),
        subtle: channel('subtle'),
        accent: channel('accent'),
        'accent-ink': channel('accent-ink'),
        success: channel('success'),
        danger: channel('danger'),
        warn: channel('warn'),
      },
      fontFamily: {
        display: ['Inter', 'sans-serif'],
        sans: ['Inter', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'Menlo', 'monospace'],
      },
      backgroundImage: {
        brand: 'linear-gradient(100deg, #3b82f6 0%, #22d3ee 55%, #22c55e 100%)',
        'brand-soft': 'linear-gradient(100deg, rgb(59 130 246 / 0.16), rgb(34 211 238 / 0.12) 55%, rgb(34 197 94 / 0.16))',
      },
      boxShadow: {
        card: '0 1px 0 0 rgb(255 255 255 / 0.03) inset, 0 16px 40px -24px rgb(0 0 0 / 0.8)',
        brand: '0 10px 30px -12px rgb(34 211 238 / 0.55)',
      },
      keyframes: {
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        float: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-6px)' } },
      },
      animation: { shimmer: 'shimmer 1.6s infinite', float: 'float 7s ease-in-out infinite' },
    },
  },
  plugins: [],
}
