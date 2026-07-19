/** @type {import('tailwindcss').Config} */
const cssVarColor = (name) => ({ opacityValue }) => (
  opacityValue === undefined
    ? `var(${name})`
    : `color-mix(in srgb, var(${name}) calc(${opacityValue} * 100%), transparent)`
);

module.exports = {
  content: ['./index.html', './App.tsx', './components/**/*.{ts,tsx}', './contexts/**/*.{ts,tsx}', './hooks/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        theme: {
          bg: cssVarColor('--app-bg'),
          glass: cssVarColor('--glass-bg'),
          border: cssVarColor('--glass-border'),
          text: cssVarColor('--text-main'),
          muted: cssVarColor('--text-muted'),
          primary: cssVarColor('--primary'),
        },
      },
      animation: {
        breathe: 'breathe 4s ease-in-out infinite',
        float: 'float 6s ease-in-out infinite',
      },
      keyframes: {
        breathe: {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.03)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
      },
    },
  },
  plugins: [],
};
