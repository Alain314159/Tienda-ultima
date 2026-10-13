import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'happy-dom',
    globals: true,
    include: ['tests/**/*.test.js'],
    setupFiles: ['./tests/setup.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**'],
      exclude: ['src/main.ts', 'src/env.d.ts', 'src/shims/**'],
      // Umbrales anti-regresion: ~4pp por debajo de la cobertura actual.
      // Subirlos al mejorar la suite (trinquete).
      thresholds: {
        lines: 30,
        functions: 18,
        statements: 28,
        branches: 14,
      },
    },
  },
});
