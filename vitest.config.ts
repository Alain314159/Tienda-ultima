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
      // Umbrales anti-regresion: ~3pp por debajo de la cobertura actual.
      // Subirlos al mejorar la suite (trinquete).
      // Actual (2026-10-14, 236 tests): lineas 46.2 / funciones 32.1 /
      // statements 43.1 / branches 24.0
      thresholds: {
        lines: 43,
        functions: 29,
        statements: 40,
        branches: 21,
      },
    },
  },
});
