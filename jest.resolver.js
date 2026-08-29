/**
 * Composed Jest resolver.
 *
 * Two resolvers are needed and Jest only accepts one:
 *
 *  1. `react-native-worklets` (a Reanimated 4 dependency) ships sources that
 *     only exist with a `.native` extension. Jest's default resolution picks
 *     those up and they fail outside a native runtime, so the worklets package
 *     supplies a resolver that strips `native` from the extension list.
 *  2. The React Native preset ships its own resolver, which handles the
 *     `react-native` subpath exports Jest would otherwise fail on.
 *
 * Setting `resolver` in jest.config.js REPLACES the preset's resolver rather
 * than adding to it, so this file applies the worklets adjustment and then
 * delegates to the React Native resolver. Removing either half breaks the
 * suite in a way whose error message points somewhere else entirely.
 */
const reactNativeResolver = require('@react-native/jest-preset/jest/resolver.js');

module.exports = (request, options) => {
  const isWorklets =
    options.basedir.includes('react-native-worklets') || request.includes('react-native-worklets');

  const resolvedOptions = isWorklets
    ? { ...options, extensions: options.extensions?.filter((ext) => !ext.includes('native')) }
    : options;

  return reactNativeResolver(request, resolvedOptions);
};
