// RNTL 14 no longer auto-registers its matchers, and the old
// '@testing-library/react-native/extend-expect' entrypoint was removed.
// This is the supported way to get toBeOnTheScreen / toBeDisabled / toBeBusy.
import * as matchers from '@testing-library/react-native/matchers';

expect.extend(matchers);

// Fonts are loaded asynchronously in the real app; in tests we treat them as ready
// so primitives render their final type styles rather than a loading fallback.
jest.mock('expo-font', () => ({
  useFonts: () => [true, null],
  loadAsync: jest.fn().mockResolvedValue(undefined),
  isLoaded: () => true,
}));

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn().mockResolvedValue(undefined),
  hideAsync: jest.fn().mockResolvedValue(undefined),
  setOptions: jest.fn(),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  selectionAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
  isAvailableAsync: jest.fn().mockResolvedValue(true),
}));

// AsyncStorage is a native module. The library ships an official in-memory mock
// for Jest; Supabase's session persistence uses it via lib/supabase/client.ts.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
