/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  // Composes the worklets resolver with React Native's. See jest.resolver.js —
  // setting `resolver` REPLACES the preset's, so both must be applied there.
  resolver: '<rootDir>/jest.resolver.js',
  // Android is the primary target, so tests resolve .android.* files first.
  haste: { defaultPlatform: 'android', platforms: ['android', 'ios', 'native'] },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  transformIgnorePatterns: [
    'node_modules/(?!(?:jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|standard-navigation|native-base|react-native-svg|@supabase/.*)',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  collectCoverageFrom: [
    'components/**/*.{ts,tsx}',
    'lib/**/*.{ts,tsx}',
    'theme/**/*.{ts,tsx}',
    '!**/*.d.ts',
  ],
  testPathIgnorePatterns: ['/node_modules/', '/android/', '/ios/', '/.expo/'],
};
