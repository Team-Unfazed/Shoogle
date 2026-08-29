/**
 * Shoogle design tokens.
 *
 * SOURCE OF TRUTH: the Claude Design project "Shoogle Mobile App.dc.html",
 * design-system reference card `1d`. Every value below is transcribed from the
 * CSS custom properties in that document.
 *
 * DO NOT hard-code colours, radii, font sizes or spacing anywhere else in the
 * app. If a value you need is missing, add it here and note it in
 * docs/agent-memory/foundation-changes.md — do not inline it in a component.
 */

/** Semantic colour roles. Identical key set in light and dark. */
export interface ColorTokens {
  /** Screen background. */
  bg: string;
  /** Raised surface (cards, sheets, app bar). */
  card: string;
  /** Recessed surface (inputs, inert chips, skeleton base). */
  card2: string;
  /** Hairline borders and dividers. */
  border: string;
  /** Primary text. */
  text: string;
  /** Secondary text. */
  muted: string;
  /** Tertiary text, uppercase labels, disabled. */
  muted2: string;

  /** Social / primary action. */
  blue: string;
  blueSoft: string;
  /** SEO / success. */
  green: string;
  greenSoft: string;
  /** Website / warning. */
  amber: string;
  amberSoft: string;
  /** Error / destructive. */
  red: string;
  redSoft: string;

  /** Translucent bottom-navigation and app-bar background. */
  navBg: string;
  /** Scrim behind dialogs and bottom sheets. */
  scrim: string;
  /** Text placed on a saturated colour fill. */
  onAccent: string;
}

export const lightColors: ColorTokens = {
  bg: '#f5f6f8',
  card: '#ffffff',
  card2: '#f0f1f4',
  border: '#e4e7ec',
  text: '#101317',
  muted: '#6c737f',
  muted2: '#a0a6b0',

  blue: '#2f7ad6',
  blueSoft: '#e9f2fc',
  green: '#17a97f',
  greenSoft: '#e5f6f1',
  amber: '#e0900f',
  amberSoft: '#fdf3e0',
  red: '#d9534f',
  redSoft: '#fcebea',

  navBg: 'rgba(255,255,255,0.9)',
  scrim: 'rgba(16,19,23,0.45)',
  onAccent: '#ffffff',
};

export const darkColors: ColorTokens = {
  bg: '#0d0d0d',
  card: '#1a1a1a',
  card2: '#161616',
  border: '#2a2a2a',
  text: '#ffffff',
  muted: '#9c9a92',
  muted2: '#6b6a64',

  blue: '#378add',
  blueSoft: '#16283c',
  green: '#5dcaa5',
  greenSoft: '#132b23',
  amber: '#ef9f27',
  amberSoft: '#2e2314',
  red: '#e05a5a',
  redSoft: '#2e1717',

  navBg: 'rgba(20,20,20,0.9)',
  scrim: 'rgba(0,0,0,0.6)',
  onAccent: '#ffffff',
};

/**
 * Module accent colours, from the design system's colour card.
 * Blue = Social, Green = SEO, Amber = Website, Red = Error.
 */
export type AccentName = 'blue' | 'green' | 'amber' | 'red' | 'neutral';

/** 4pt base scale. */
export const spacing = {
  none: 0,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
  '5xl': 56,
} as const;
export type SpacingKey = keyof typeof spacing;

/** Corner radii, from the "Radii & elevation" card. */
export const radii = {
  /** Badges. */
  xs: 8,
  /** Chips, small controls. */
  sm: 11,
  /** Buttons. */
  md: 15,
  /** Inner cards, inputs. */
  lg: 16,
  /** Outer cards, dialogs. */
  xl: 20,
  /** Bottom-sheet top corners. */
  sheet: 26,
  /** Avatars, pills. */
  full: 999,
} as const;
export type RadiusKey = keyof typeof radii;

/**
 * Elevation. React Native needs both `elevation` (Android) and shadow* (iOS),
 * so these are emitted as complete style fragments rather than raw numbers.
 */
export const elevation = {
  none: {
    elevation: 0,
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
  },
  /** Cards — matches `0 2px 10px rgba(0,0,0,.07)`. */
  card: {
    elevation: 2,
    shadowColor: '#000000',
    shadowOpacity: 0.07,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
  },
  /** Sheets and dialogs. */
  overlay: {
    elevation: 12,
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -4 },
  },
} as const;
export type ElevationKey = keyof typeof elevation;

/** Font families, resolved after `useAppFonts()` reports ready. */
export const fontFamily = {
  /** Sora — display and screen titles. */
  display: 'Sora_600SemiBold',
  displayRegular: 'Sora_400Regular',
  /** Manrope — all UI text. */
  regular: 'Manrope_400Regular',
  medium: 'Manrope_500Medium',
  semibold: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
} as const;

/**
 * Type scale, transcribed from the design system's Type card.
 * Sora for display/title, Manrope for everything else.
 */
export const typography = {
  display: {
    fontFamily: fontFamily.display,
    fontSize: 29,
    lineHeight: 36,
    letterSpacing: -0.58, // -0.02em
  },
  screenTitle: {
    fontFamily: fontFamily.display,
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: -0.48, // -0.02em
  },
  cardTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 16,
    lineHeight: 22,
    letterSpacing: 0,
  },
  body: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: 0,
  },
  bodyStrong: {
    fontFamily: fontFamily.semibold,
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: 0,
  },
  caption: {
    fontFamily: fontFamily.regular,
    fontSize: 12.5,
    lineHeight: 18,
    letterSpacing: 0,
  },
  label: {
    fontFamily: fontFamily.bold,
    fontSize: 11.5,
    lineHeight: 15,
    letterSpacing: 0.8, // .07em
    textTransform: 'uppercase',
  },
} as const;
export type TypographyKey = keyof typeof typography;

/**
 * Control geometry, from the "Buttons — 54px primary, 44px min touch" card.
 * `minTouchTarget` is the Android accessibility floor; nothing pressable may
 * be smaller.
 */
export const control = {
  minTouchTarget: 44,
  buttonPrimaryHeight: 54,
  buttonSecondaryHeight: 50,
  buttonSmallHeight: 44,
  chipHeight: 38,
  inputHeight: 52,
  iconButtonSize: 44,
  tabBarHeight: 60,
  appBarHeight: 56,
} as const;

/** Motion. Kept short — the product rule is "no progress theatre". */
export const motion = {
  fast: 120,
  base: 180,
  slow: 260,
} as const;

/** Layout guards for the two target Android viewports (390x844, 412x915). */
export const layout = {
  screenPaddingX: spacing.lg,
  maxContentWidth: 560,
  cardGap: spacing.md,
} as const;
