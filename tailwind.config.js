/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        sentinel: {
          midnight: '#07111F',
          navy: '#0B1728',
          surface: '#111F33',
          surfaceElevated: '#111F33',
          surfaceSecondary: '#17283C',
          teal: '#48D9C1',
          cyan: '#65BFFF',
          mint: '#B6F3E5',
          textPrimary: '#F1F6FC',
          textSecondary: '#9AAEC4',
          textMuted: '#6E829B',
          accentHigh: '#FF647C',
          accentWarning: '#FFC36B',
          accentInfo: '#75B8FF',
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#48D9C1',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#0B1728',
          950: '#07111F',
        },
        slate: {
          850: '#111F33',
          900: '#0B1728',
          950: '#07111F',
        },
        cyber: {
          cyan: '#65BFFF',
          teal: '#48D9C1',
          purple: '#8b5cf6',
          amber: '#FFC36B',
          rose: '#FF647C',
          blue: '#75B8FF',
        },
        copper: '#D47A4A',
        spruce: '#123B3A',
        ink: '#071F20',
        mist: '#DDE8DD',
        paper: '#F4F0E6',
        fruit: '#B73945',
        numLight: '#B8D7CC',
        numDark: '#82A7A5',
      },
      borderColor: {
        'sentinel-hairline': 'rgba(159, 190, 220, 0.16)',
        'editorial-line': 'rgba(255, 255, 255, 0.18)',
        'editorial-lineLight': 'rgba(7, 31, 32, 0.15)',
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
        sans: ['Poppins', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'radar': 'radar 4s linear infinite',
      },
      keyframes: {
        radar: {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        }
      }
    },
  },
  plugins: [],
}
