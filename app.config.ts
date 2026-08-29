import type { ExpoConfig, ConfigContext } from 'expo/config';

/**
 * Shoogle — Expo app configuration.
 *
 * Android-first. Values that differ per environment are read from the
 * environment (see `.env.local.example`); nothing secret is committed here.
 *
 * versionCode must be incremented for every Play Store upload. It is read from
 * ANDROID_VERSION_CODE so CI/EAS can bump it without touching source.
 */
const ANDROID_PACKAGE = 'com.shoogle.app';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Shoogle',
  slug: 'shoogle',
  version: '0.1.0',
  orientation: 'portrait',
  scheme: 'shoogle',
  icon: './assets/images/icon.png',
  // Light is the design's primary palette. Dark tokens exist and are tested,
  // but the app does not follow the system theme until we deliberately ship it.
  userInterfaceStyle: 'light',
  // Design token --bg (light). Keeps the frame from flashing white/black.
  backgroundColor: '#f5f6f8',
  primaryColor: '#2f7ad6',
  assetBundlePatterns: ['**/*'],
  android: {
    package: ANDROID_PACKAGE,
    versionCode: Number(process.env.ANDROID_VERSION_CODE ?? 1),
    adaptiveIcon: {
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
      backgroundColor: '#f5f6f8',
    },
    // Android 13+ predictive back. Enabled because every screen uses
    // Expo Router's own back stack.
    predictiveBackGestureEnabled: true,
    // Only permissions the foundation actually needs. Feature engineers add
    // their own here and must document why in their feature README.
    permissions: ['android.permission.INTERNET'],
    blockedPermissions: [],
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: false,
        data: [{ scheme: 'shoogle' }],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
  },
  ios: {
    bundleIdentifier: ANDROID_PACKAGE,
    supportsTablet: false,
  },
  web: {
    // Web exists only as a fast dev preview surface. It is not a product target.
    output: 'static',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-font',
    [
      'expo-splash-screen',
      {
        backgroundColor: '#f5f6f8',
        dark: { backgroundColor: '#0d0d0d' },
        image: './assets/images/splash-icon.png',
        imageWidth: 160,
      },
    ],
    [
      'expo-build-properties',
      {
        android: {
          compileSdkVersion: 36,
          targetSdkVersion: 36,
          minSdkVersion: 24,
        },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    eas: {
      projectId: process.env.EAS_PROJECT_ID,
    },
  },
});
