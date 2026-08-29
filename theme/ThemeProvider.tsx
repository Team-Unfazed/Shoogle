import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';

import {
  control,
  darkColors,
  elevation,
  layout,
  lightColors,
  motion,
  radii,
  spacing,
  typography,
  fontFamily,
  type AccentName,
  type ColorTokens,
} from './tokens';

export interface Theme {
  scheme: 'light' | 'dark';
  colors: ColorTokens;
  spacing: typeof spacing;
  radii: typeof radii;
  elevation: typeof elevation;
  typography: typeof typography;
  fontFamily: typeof fontFamily;
  control: typeof control;
  motion: typeof motion;
  layout: typeof layout;
  /** Resolve a module accent to its fill + soft background pair. */
  accent: (name: AccentName) => { fg: string; bg: string };
}

function buildTheme(scheme: 'light' | 'dark'): Theme {
  const colors = scheme === 'dark' ? darkColors : lightColors;
  return {
    scheme,
    colors,
    spacing,
    radii,
    elevation,
    typography,
    fontFamily,
    control,
    motion,
    layout,
    accent: (name) => {
      switch (name) {
        case 'blue':
          return { fg: colors.blue, bg: colors.blueSoft };
        case 'green':
          return { fg: colors.green, bg: colors.greenSoft };
        case 'amber':
          return { fg: colors.amber, bg: colors.amberSoft };
        case 'red':
          return { fg: colors.red, bg: colors.redSoft };
        case 'neutral':
        default:
          return { fg: colors.muted2, bg: colors.card2 };
      }
    },
  };
}

const lightTheme = buildTheme('light');
const darkTheme = buildTheme('dark');

const ThemeContext = createContext<Theme>(lightTheme);

export interface ThemeProviderProps {
  children: React.ReactNode;
  /** Force a scheme. Used by tests and by the dark-mode preview in Settings. */
  forceScheme?: 'light' | 'dark';
  /**
   * Follow the device theme. OFF by default: light is the design's primary
   * palette, and following the system silently turned the whole app black on a
   * phone set to dark mode. Dark tokens are complete and tested - turn this on
   * only when we deliberately decide to ship dark mode.
   */
  followSystem?: boolean;
}

export function ThemeProvider({ children, forceScheme, followSystem = false }: ThemeProviderProps) {
  const system = useColorScheme();
  const scheme = forceScheme ?? (followSystem && system === 'dark' ? 'dark' : 'light');
  const value = useMemo(() => (scheme === 'dark' ? darkTheme : lightTheme), [scheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Access the active theme. Always available — defaults to light outside a provider. */
export function useTheme(): Theme {
  return useContext(ThemeContext);
}
