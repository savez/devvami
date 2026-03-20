import jsdoc from 'eslint-plugin-jsdoc'
import { fixupPluginRules } from '@eslint/compat'
import prettierConfig from 'eslint-config-prettier'

export default [
  {
    ignores: ['node_modules/**', 'dist/**', 'coverage/**'],
  },
  {
    files: ['src/**/*.js', 'tests/**/*.js'],
    plugins: {
      jsdoc: fixupPluginRules(jsdoc),
    },
    rules: {
      // JSDoc rules — enforce type documentation on public APIs
      'jsdoc/require-jsdoc': [
        'error',
        {
          require: {
            FunctionDeclaration: true,
            MethodDefinition: false,
            ClassDeclaration: false,
          },
          publicOnly: true,
        },
      ],
      'jsdoc/require-param': 'warn',
      'jsdoc/require-param-type': 'warn',
      'jsdoc/require-returns': 'warn',
      'jsdoc/require-returns-type': 'warn',
      'jsdoc/valid-types': 'error',
      // General
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['error'] }],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
  prettierConfig,
]
