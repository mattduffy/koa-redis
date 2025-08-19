module.exports = {
  env: {
    es2021: true,
    node: true,
  },
  plugins: [
  ],
  extends: 'airbnb-base',
  overrides: [
  ],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  rules: {
    semi: ['error', 'never'],
    'no-console': 'off',
    'no-underscore-dangle': 'off',
    'import/extensions': 'off',
    'import/prefer-default-export': 'off',
    'max-len': ['error', { code: 100 }],
    'new-cap': 'off',
  },
}
