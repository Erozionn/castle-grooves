module.exports = {
  extends: [
    'plugin:@typescript-eslint/recommended',
    'plugin:import/recommended',
    'plugin:import/typescript',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
  env: {
    es6: true,
    node: true,
  },
  plugins: ['@typescript-eslint', 'import'],
  rules: {
    'no-plusplus': ['error', { allowForLoopAfterthoughts: true }],
    'arrow-parens': ['warn', 'always'],
    'function-paren-newline': 'off',
    'keyword-spacing': [
      'error',

      {
        before: true,
        after: true,
        overrides: {
          return: {
            after: true,
          },
          throw: {
            after: true,
          },
          case: {
            after: true,
          },
          if: {
            after: true,
          },
        },
      },
    ],
    'no-console': [
      'warn',
      {
        allow: ['warn', 'error'],
      },
    ],
    'no-debugger': ['warn'],
    'no-param-reassign': ['error', { props: true, ignorePropertyModificationsFor: ['state'] }],
    '@typescript-eslint/no-unused-vars': ['warn'],
    'import/extensions': [
      'error',
      'always',
      {
        js: 'never',
        jsx: 'never',
        ts: 'never',
        tsx: 'never',
      },
    ],
    'import/order': [
      'warn',
      {
        groups: ['builtin', 'external', 'internal', ['sibling', 'parent']],
        'newlines-between': 'always',
      },
    ],
    'linebreak-style': ['error', process.platform === 'win32' ? 'windows' : 'unix'],
    // 'prettier/prettier': [
    //   'error',
    //   {
    //     arrowParens: 'always',
    //     endOfLine: 'auto',
    //     printWidth: 100,
    //     semi: false,
    //     singleQuote: true,
    //     trailingComma: 'es5',
    //   },
    // ],
    'arrow-body-style': 'off',
    'prefer-arrow-callback': 'off',
  },
  settings: {
    'import/resolver': {
      typescript: {
        alwaysTryTypes: true, // always try to resolve types under `<root>@types` directory even it doesn't contain any source code, like `@types/unist`
        project: 'tsconfig.json',
      },
    },
  },
}
