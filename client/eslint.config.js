// Minimal lint gate: catch identifiers that are used but never declared.
//
// This exists because an undeclared `dayRollover` in App.vue shipped green --
// <script setup> compiles to a strict-mode module, so the assignment threw at
// runtime while vite build, the unit tests and the e2e suite all passed. No
// style rules are enabled here on purpose: the client has never been linted,
// and a gate that fails on pre-existing formatting would be turned off rather
// than fixed.
import globals from 'globals'
import vueParser from 'vue-eslint-parser'

export default [
  {
    ignores: ['dist/**', 'test-results/**', 'playwright-report/**', 'public/**'],
  },
  {
    files: ['**/*.js', '**/*.vue'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        // Injected by vite.config.js `define` from package.json's version.
        __APP_VERSION__: 'readonly',
        // Compiler macros: real bindings at build time, invisible to eslint.
        defineProps: 'readonly',
        defineEmits: 'readonly',
        defineExpose: 'readonly',
        defineOptions: 'readonly',
        defineModel: 'readonly',
        withDefaults: 'readonly',
      },
    },
    rules: {
      'no-undef': 'error',
    },
  },
  {
    // Lets eslint read the <script> block of an SFC; without it a .vue file
    // cannot be parsed at all, which is how the original bug stayed hidden.
    files: ['**/*.vue'],
    languageOptions: { parser: vueParser },
  },
]
