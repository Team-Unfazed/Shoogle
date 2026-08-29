# Android release

**Shoogle has not been published to Google Play.** Nothing in this document
claims otherwise — it describes the configuration that exists and the steps that
still need doing.

## What is configured

| Item | Value | Where |
|---|---|---|
| Application ID | `com.shoogle.app` | `app.config.ts` |
| App name | Shoogle | `app.config.ts` |
| Version name | `0.1.0` | `app.config.ts` |
| versionCode | `ANDROID_VERSION_CODE` env, default `1` | `app.config.ts` |
| compileSdk / targetSdk | 36 | `expo-build-properties` plugin |
| minSdk | 24 (Android 7.0) | `expo-build-properties` plugin |
| Adaptive icon | foreground + background + monochrome | `assets/images/` |
| Splash | `expo-splash-screen`, light `#f5f6f8` / dark `#0d0d0d` | `app.config.ts` |
| Deep link scheme | `shoogle://` | `app.config.ts` |
| Predictive back | enabled | `app.config.ts` |
| Permissions | `INTERNET` only | `app.config.ts` |

`versionCode` is read from the environment so CI can bump it without touching
source. The `production` EAS profile also sets `autoIncrement`.

## Build profiles (`eas.json`)

| Profile | Output | Fixtures |
|---|---|---|
| `development` | debug APK, dev client | enabled |
| `preview` | release APK, internal distribution | disabled |
| `production` | AAB for Play | disabled |

Fixture data is disabled in both `preview` and `production`, and
`isFixtureModeEnabled()` additionally requires `__DEV__`. A release binary
cannot render fixture data.

## Steps still required before a Play release

1. **`eas login` and `eas init`** — produces the project id. Put it in
   `.env.local` as `EAS_PROJECT_ID`.
2. **Signing key.** Let EAS generate and manage the upload keystore
   (recommended), or supply your own. The keystore must never be committed —
   `*.keystore` and `*.jks` are git-ignored.
3. **Replace the placeholder icons.** `assets/images/` still holds the
   `create-expo-app` defaults. Shoogle needs its own adaptive icon
   (foreground/background/monochrome) and splash mark.
4. **Play Console setup** — create the app, complete the store listing, content
   rating, data safety form, and target-audience declaration.
5. **Privacy policy URL.** Required by Play for any app that handles accounts.
6. **Data safety declaration.** Must accurately list what the connected
   providers collect. Fill this in only after the integrations exist — declaring
   data flows that do not exist yet would be inaccurate.
7. **`eas submit`** to the internal testing track first
   (`eas.json` already defaults to `track: internal`, `releaseStatus: draft`).

## Expo Go vs a development build

Everything in the foundation runs in **Expo Go**. No custom development build is
needed yet.

That will change the first time a feature needs a native module Expo Go does not
bundle. Likely triggers:

| Feature | Native need | Expo Go? |
|---|---|---|
| Google Sign-In (native) | `@react-native-google-signin/google-signin` | **No** — needs a dev build |
| In-app purchases | Play Billing | **No** — needs a dev build |
| Push notifications (production) | FCM credentials | Partly — dev build recommended |
| OAuth via system browser | `expo-auth-session` + `expo-web-browser` | **Yes** |
| Image picking | `expo-image-picker` | **Yes** |
| Secure token storage | `expo-secure-store` | **Yes** |

If you hit one of these, **stop and tell the team before changing the
architecture.** The command is:

```bash
eas build --profile development --platform android
```

Then install that APK and run `npx expo start --dev-client`. Expo Go and a
development build can coexist; the rest of the team is not forced to switch.

## Play policy notes to verify before building billing

Google Play requires Play Billing for most in-app digital purchases, with
carve-outs that change. **Confirm the current policy before implementing** —
run the `api-researcher` agent against the Play billing policy rather than
assuming. Billing is owned by Aryan.
