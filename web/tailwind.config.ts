import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        surface: '#0b0d10',
        panel: '#111418',
      },
    },
  },
  plugins: [],
};

export default config;
