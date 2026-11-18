// Lint gate for the client.
//
// no-undef is the rule this gate was added for: an undeclared `dayRollover` in
// App.vue shipped green, because <script setup> compiles to a strict-mode
// module, so the assignment threw at runtime while vite build, the unit tests
// and the e2e suite all passed.
//
// The recommended sets are enabled on top of it. They were measured first: on
// the codebase as it stood they flagged eight unused variables and nothing
// else, and those were cleared rather than silenced. Still no stylistic rules
// -- formatting is not what this gate is for.
import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import globals from 'globals'
import vueParser from 'vue-eslint-parser'

export default [
  {
    ignores: ['dist/**', 'test-results/**', 'playwright-report/**', 'public/**'],
  },
  js.configs.recommended,
  ...pluginVue.configs['flat/essential'],
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
  {
    // Specs take `test` from e2e/fixtures.js so every test runs under the
    // console guard; importing it straight from Playwright would bypass it.
    files: ['e2e/**/*.spec.js'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [{
          name: '@playwright/test',
          message: "Import test and expect from './fixtures.js' so the console guard runs.",
        }],
      }],
    },
  },
]
