/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          50:  '#EEEEFF',
          100: '#DDDEFF',
          200: '#BBBDFF',
          300: '#8888EE',
          400: '#5C5CE8',
          500: '#4444D9',
          600: '#3535D9',
          700: '#2626BB',
          800: '#1A1A99',
          900: '#101077',
        },
        wallet: {
          DEFAULT: '#1E4E7E',
          dark:    '#163A5E',
          light:   '#2B6CB0',
        },
        teal: {
          50:  '#F0FDFC',
          100: '#CCFBF7',
          400: '#2DD4BF',
          500: '#14B8A6',
          600: '#0D9488',
        },
        // Theme-sensitive colors — values come from CSS variables so they
        // automatically switch between light and dark mode.
        surface: {
          0: 'var(--surface-0)',
          1: 'var(--surface-1)',
          2: 'var(--surface-2)',
        },
        ink: {
          DEFAULT: 'var(--ink)',
          muted:   'var(--ink-muted)',
          faint:   'var(--ink-faint)',
        },
        border: 'var(--border)',
        success: { DEFAULT: '#059669', light: '#ECFDF5' },
        warning: { DEFAULT: '#D97706', light: '#FFFBEB' },
        danger:  { DEFAULT: '#DC2626', light: '#FEF2F2' },
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
        '4xl': '2rem',
      },
      boxShadow: {
        card:   '0 1px 3px 0 rgb(0 0 0 / 0.08), 0 1px 2px -1px rgb(0 0 0 / 0.06)',
        'card-md': '0 4px 12px 0 rgb(0 0 0 / 0.10), 0 2px 4px -1px rgb(0 0 0 / 0.06)',
        wallet: '0 8px 32px 0 rgb(30 78 126 / 0.30)',
        brand:  '0 4px 16px 0 rgb(53 53 217 / 0.28)',
        modal:  '0 20px 60px -10px rgb(0 0 0 / 0.25)',
      },
    },
  },
  plugins: [],
}
