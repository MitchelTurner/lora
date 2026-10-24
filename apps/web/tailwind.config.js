export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#f3efe4',
        ink: '#1b1914',
        moss: '#1f6b4a',
        mossdark: '#164c35',
        line: '#e3dccb',
        card: '#fffdf8',
      },
      fontFamily: {
        serif: ['Fraunces', 'Georgia', 'serif'],
        sans: ['Figtree', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
