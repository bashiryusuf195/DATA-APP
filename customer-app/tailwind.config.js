/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          50:  '#EEF2FF',
          100: '#E0E7FF',
          200: '#C7D2FE',
          300: '#A5B4FC',
          400: '#818CF8',
          500: '#6366F1',
          600: '#4F46E5',
          700: '#4338CA',
          800: '#3730A3',
          900: '#312E81',
        },
        surface: {
          0: '#F8FAFC',
          1: '#FFFFFF',
          2: '#F1F5F9',
        },
        ink: {
          DEFAULT: '#0F172A',
          muted:   '#64748B',
          faint:   '#94A3B8',
        },
        border: '#E2E8F0',
        success: { DEFAULT: '#059669', light: '#ECFDF5' },
        warning: { DEFAULT: '#D97706', light: '#FFFBEB' },
        danger:  { DEFAULT: '#DC2626', light: '#FEF2F2' },
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
      boxShadow: {
        card: '0 1px 3px 0 rgb(0 0 0 / 0.07), 0 1px 2px -1px rgb(0 0 0 / 0.07)',
        modal: '0 20px 60px -10px rgb(0 0 0 / 0.25)',
      },
    },
  },
  plugins: [],
}
