import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: '#0A0A0A',
          700: '#171717',
          500: '#404040',
          300: '#A3A3A3',
          200: '#D4D4D4',
          100: '#E5E5E5',
          50: '#F5F5F5',
        },
        /**
         * Lafayette maroon, sampled from lafayette.edu rather than guessed:
         * #910029 is the college's brand colour and #820024 its darker
         * state. Every accent in the app resolves through here, so the whole
         * interface moves with these four values.
         */
        accent: {
          DEFAULT: '#910029',
          600: '#910029',
          700: '#820024',
          50: '#FCF2F4',
        },
      },
      fontFamily: {
        /**
         * Headings and the wordmark. Loaded by next/font in app/layout.tsx,
         * which sets --font-display; the stack after it is what shows if that
         * ever fails to load.
         */
        display: [
          'var(--font-display)',
          'ui-serif',
          'Georgia',
          'Cambria',
          'Times New Roman',
          'serif',
        ],
        sans: [
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        mono: [
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Consolas',
          'monospace',
        ],
      },
      borderRadius: {
        sm: '4px',
        DEFAULT: '6px',
        md: '8px',
        lg: '10px',
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(0 0 0 / 0.04)',
      },
    },
  },
  plugins: [],
};

export default config;
