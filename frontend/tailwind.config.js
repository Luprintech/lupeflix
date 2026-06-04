/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        netflix: {
          bg: '#141414',
          surface: '#1f1f1f',
          surface2: '#2a2a2a',
          red: '#e50914',
          red2: '#b20710',
          muted: 'rgba(255,255,255,0.55)',
          border: 'rgba(255,255,255,0.1)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        card: '0 8px 30px rgba(0,0,0,0.6)',
        glow: '0 0 0 2px rgba(229,9,20,0.6)',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        fadeIn: 'fadeIn 0.4s ease forwards',
        shimmer: 'shimmer 1.6s linear infinite',
      },
    },
  },
  plugins: [],
};
