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
      // Umbrales anti-regresion (trinquete): subir al mejorar la suite,
      // nunca bajar. Actual (2026-10-14, 260 tests): lineas 48.6 /
      // funciones 36.0 / statements 45.9 / branches 25.8
      thresholds: {
        lines: 48,
        functions: 36,
        statements: 46,
        branches: 26,
      },
    },
  },
});
