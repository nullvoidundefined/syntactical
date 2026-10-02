// Tailwind 3 theme for NativeWind 4: the obsidian/signal palette and fonts
// that src/index.css declared in a Tailwind 4 @theme block.
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        obsidian: '#05060a',
        surface: '#0d0f14',
        'surface-raised': '#12151c',
        line: '#1c1f26',
        ink: '#e6e8eb',
        muted: '#7c828c',
        signal: '#39e88f',
        danger: '#ff5470',
        amber: '#e0a458',
        violet: '#b98ee8',
        cyan: '#5fb8e0',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'Menlo', 'monospace'],
      },
    },
  },
};
