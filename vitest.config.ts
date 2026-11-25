import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'happy-dom',
    globals: true,
    include: ['tests/**/*.test.js'],
    setupFiles: ['./tests/setup.js'],
    // mathjs/MiniSearch y happy-dom son lentos en runners CI fríos o FS lento:
    // 15s evita falsos positivos por timeout sin enmascarar cuelgos reales.
    testTimeout: 15000,
    hookTimeout: 15000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**'],
      exclude: ['src/main.ts', 'src/env.d.ts', 'src/shims/**'],
      // Umbrales anti-regresion (trinquete): subir al mejorar la suite,
      // nunca bajar. Actual (2026-10-16, 633 tests — campaña de cobertura
      // profunda por áreas): lineas 83.1 / funciones 76.7 / statements 81.1 /
      // branches 65.6. Margen de ~1 punto para no cazarnos con flakes.
      thresholds: {
        lines: 82,
        functions: 75,
        statements: 80,
        branches: 64,
      },
    },
  },
});
