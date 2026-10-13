import pluginVue from 'eslint-plugin-vue';
import vuePrettier from '@vue/eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'android/**',
      'public/**',
      '**/*.bak',
      '**/*.bak-*',
      '**/*.mjs',
      'scripts-migrar-ts.py',
    ],
  },
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  {
    files: ['**/*.{ts,mts,cts,tsx,vue}'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        ecmaVersion: 'latest',
        sourceType: 'module',
        extraFileExtensions: ['.vue'],
      },
    },
    rules: {
      // TypeScript se valida con vue-tsc; en ESLint solo reglas de bugs
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-empty-object-type': 'off',
    },
  },
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        Capacitor: 'readonly',
      },
    },
    rules: {
      // Reglas que cazan bugs reales
      'vue/no-undef-properties': 'error',
      'vue/no-dupe-keys': 'error',
      'vue/no-duplicate-attributes': 'error',
      'vue/no-mutating-props': 'error',
      'vue/no-ref-as-operand': 'error',
      'vue/no-side-effects-in-computed-properties': 'off',
      'vue/no-reserved-keys': 'off',
      'vue/no-unused-refs': 'warn',
      'vue/no-use-v-if-with-v-for': 'warn',
      'vue/require-v-for-key': 'error',
      'vue/valid-v-for': 'error',
      'vue/valid-v-if': 'error',
      'vue/valid-v-model': 'error',

      // JS: bugs reales
      'no-use-before-define': ['error', { functions: false, classes: true, variables: true }],
      'no-shadow': 'warn',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-undef': 'error',
      'no-dupe-args': 'error',
      'no-dupe-keys': 'error',
      'no-unreachable': 'error',

      // Estilo relajado (Prettier lo maneja)
      'vue/multi-word-component-names': 'off',
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/html-self-closing': 'off',
      'vue/attributes-order': 'off',
      'vue/html-indent': 'off',
      'vue/html-closing-bracket-newline': 'off',
    },
  },
  vuePrettier,
];
