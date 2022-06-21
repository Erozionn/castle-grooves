module.exports = {
  extends: ['airbnb', 'prettier'],
  parserOptions: {
    ecmaVersion: 11,
    sourceType: 'module',
  },
  env: {
    es6: true,
    node: true,
  },
  plugins: ['compat', 'prettier'],
  rules: {
    'allowForLoopAfterthoughts': true,
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
    'no-unused-vars': ['warn'],
    'import/extensions': [
      'error',
      'always',
      {
        js: 'never',
        jsx: 'never',
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
    'prettier/prettier': [
      'error',
      {
        arrowParens: 'always',
        endOfLine: 'auto',
        printWidth: 100,
        semi: false,
        singleQuote: true,
        trailingComma: 'es5',
      },
    ],
    'arrow-body-style': 'off',
    'prefer-arrow-callback': 'off',
  },
}
