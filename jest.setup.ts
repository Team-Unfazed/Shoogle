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

// expo-crypto is a native module. Its JS side does NOT throw when the native
// side is missing — `randomUUID()` simply returns undefined — so without this
// mock every default-generated id would silently be unusable. `features/social/ids.ts`
// rejects such a value at runtime; this keeps tests on the working path.
// Deterministic and monotonic, so a failing test names a specific id.
let mockUuidCounter = 0;
jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => {
    mockUuidCounter += 1;
    return `00000000-0000-4000-8000-${mockUuidCounter.toString(16).padStart(12, '0')}`;
  }),
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
  isAvailableAsync: jest.fn().mockResolvedValue(true),
}));

// expo-image-picker is a native module that throws when its native side is
// absent. The picker adapter is driven through an injected `ExpoPickerModule`
// in tests, so this mock only has to keep the import itself from exploding.
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest
    .fn()
    .mockResolvedValue({ granted: false, canAskAgain: true, status: 'undetermined' }),
  launchImageLibraryAsync: jest.fn().mockResolvedValue({ canceled: true, assets: null }),
}));

// expo-image-manipulator is a native module too. The preparer is driven
// through an injected `ImageManipulatorModule` in tests; this only keeps the
// import alive.
jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' },
  ImageManipulator: { manipulate: jest.fn() },
}));

// AsyncStorage is a native module. The library ships an official in-memory mock
// for Jest; Supabase's session persistence uses it via lib/supabase/client.ts.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
