// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'node_modules/*', '.expo/*', 'ios/*', 'android/*'],
  },
  {
    rules: {
      // Metro + typecheck already resolve imports; this rule walks parent dirs, which sandboxed CI/macOS can refuse
      'import/no-unresolved': 'off',
      // Reanimated shared values are mutated via .value by design
      'react-hooks/immutability': 'off',
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'react-native',
              importNames: ['Animated'],
              message: 'Use react-native-reanimated. The core Animated API runs on the JS thread.',
            },
            {
              name: '@react-native-async-storage/async-storage',
              message: 'Tokens go in expo-secure-store; cache goes in src/lib/kv.js.',
            },
          ],
        },
      ],
    },
  },
]);
