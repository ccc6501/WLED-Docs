import type { Config } from 'tailwindcss';
import { fontFamily } from 'tailwindcss/defaultTheme';

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
    './pages/**/*.{ts,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        background: '#050505',
        foreground: '#f5f5f5',
        primary: {
          DEFAULT: '#9b87f5',
          foreground: '#050505'
        },
        muted: '#1e1e1e',
        accent: '#22d3ee',
        border: '#2a2a2a',
        destructive: '#ef4444'
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', ...fontFamily.sans],
        mono: ['var(--font-geist-mono)', ...fontFamily.mono]
      },
      boxShadow: {
        glass: '0 8px 32px rgba(0,0,0,0.45)'
      }
    }
  },
  plugins: [require('tailwindcss-animate')]
};

export default config;
