import { useFonts } from 'expo-font';
import { Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold } from '@expo-google-fonts/manrope';
import { Sora_400Regular, Sora_600SemiBold } from '@expo-google-fonts/sora';

/**
 * Loads the two families the design system depends on: Sora (display) and
 * Manrope (UI). Bundled locally, so no network is required at launch — the app
 * still opens on a poor connection.
 */
export function useAppFonts(): [boolean, Error | null] {
  const [loaded, error] = useFonts({
    Sora_400Regular,
    Sora_600SemiBold,
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
  });
  return [loaded, error ?? null];
}
