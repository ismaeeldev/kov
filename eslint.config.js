import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { globalIgnores } from 'eslint/config'
import tseslint from 'typescript-eslint'

export default tseslint.config([
  globalIgnores(['dist', 'node_modules', 'supabase/functions/**']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommended, reactRefresh.configs.vite],
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      // eslint-plugin-react-hooks@7.1.1's `configs` export is still eslintrc-shaped
      // ("plugins": ["react-hooks"] as a string array), which errors under ESLint 10's
      // flat config — so the plugin/rules are wired manually here instead of via `extends`.
      ...reactHooks.configs['recommended-latest'].rules,
      // shadcn/ui-generated files (e.g. src/components/ui/button.tsx) commonly export a
      // helper constant alongside the component — matches oxlint's own "warn" severity
      // for this pattern rather than blocking the build on upstream shadcn's convention.
      'react-refresh/only-export-components': 'warn',
      // Standard convention: a leading underscore marks an intentionally-discarded
      // destructured value (e.g. narrowing motion-only props before passing the rest
      // to a plain-DOM element) — never flag these as errors.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
    languageOptions: {
      ecmaVersion: 2023,
      globals: {
        window: 'readonly',
        document: 'readonly',
      },
    },
  },
])
