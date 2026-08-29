// Flat config consumed by `expo lint`.
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'android/*', 'ios/*', '.expo/*', 'node_modules/*', 'coverage/*'],
  },
  {
    rules: {
      /**
       * Fixtures are development-only and must never reach a production data
       * path. Tests and the fixtures folder itself are exempted below.
       *
       * See fixtures/README.md for the full rules.
       */
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/fixtures', '@/fixtures/*', '**/fixtures/index'],
              message:
                'Fixtures are development-only. Import them from a test, or from a screen guarded by isFixtureModeEnabled() that also passes showsFixtureData to <Screen>. Never import fixtures into lib/, a provider implementation, or any production data path.',
            },
          ],
          paths: [
            {
              name: 'react-native',
              importNames: ['Text'],
              message:
                "Use the design-system Text from '@/components/ui' so type styles and tones come from the tokens. Import react-native's Text only inside components/ui/Text.tsx.",
            },
          ],
        },
      ],
    },
  },
  {
    // The design-system Text primitive is the one place that may wrap RN's Text.
    files: ['components/ui/Text.tsx'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    /**
     * Route screens under app/ MAY import fixtures.
     *
     * A screen is where fixture data becomes visible, so it is also where the
     * "Fixture data" banner is rendered — that pairing is the point. What must
     * never touch fixtures is a DATA layer (lib/, provider implementations,
     * repositories), because there the fixture would be laundered into
     * something a screen believes is real. Those stay blocked by the rule above.
     *
     * The binding guarantee is not lint, it is the runtime gate:
     * `isFixtureModeEnabled()` requires __DEV__ plus an explicit flag, and both
     * non-development EAS profiles set that flag to "0". A release build cannot
     * reach this code at all. `__tests__/dev-preview.test.tsx` pins that.
     */
    files: ['app/**/*.tsx'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    // Tests and the fixtures folder may use fixtures freely.
    files: [
      '**/__tests__/**',
      '**/*.test.ts',
      '**/*.test.tsx',
      'fixtures/**',
      'jest.setup.ts',
    ],
    rules: { 'no-restricted-imports': 'off' },
  },
]);
