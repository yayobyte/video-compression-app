import type { TextStyle, ViewStyle } from 'react-native'

// Design tokens for the Clippress mobile app.
// Source of truth: DESIGN.md (Revolut-inspired). Mobile stands on a 4px spacing grid
// with a compact radius set and a small typography ramp so styles are always reused.

// ---- Color system ----------------------------------------------------------
// Brand: cobalt-violet (#494fdf) on near-black surfaces, teal accent for
// confirmation, muted slate for secondary text.
export const colors = {
  // canvas
  canvasDark: '#000000',
  canvasLight: '#ffffff',
  background: '#121316',
  surface: '#16181a',
  surfaceScrim: '#101114',
  card: '#292b30',
  elevated: '#35373d',
  // ink & text
  ink: '#191c1f',
  text: '#ffffff',
  textMuted: '#9b9da7',
  textDim: '#5b5e67',
  // brand / accent
  primary: '#494fdf',
  primaryBright: '#4f55f1',
  primarySoft: '#6f74ff',
  accent: '#a8ecd9',
  teal: '#00a87e',
  online: '#3fbf8f',
  // status
  danger: '#ffabb2',
  dangerDeep: '#e23b4a',
  dangerBg: '#6e2b30',
  pending: '#ffd38d',
  pendingBg: 'rgba(236,126,0,0.16)',
  // borders
  hairline: 'rgba(255,255,255,0.12)',
  hairlineStrong: 'rgba(255,255,255,0.18)',
} as const

// ---- Spacing system (4px grid) ---------------------------------------------
export const spacing = {
  xxs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  section: 40,
  block: 48,
} as const

// ---- Radius -----------------------------------------------------------------
export const radius = {
  none: 0,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 9999,
} as const

// ---- Typography --------------------------------------------------------------
// Sizes are fixed steps that components reuse; weights and letterSpacing are
// matched to DESIGN.md's Inter/Aeonik ramp (mobile runs the system font, which
// maps most closely to Inter).
const typeBase = {
  fontFamily: undefined,
}
export const typography: Record<string, TextStyle> = {
  brand: { ...typeBase, fontSize: 18, fontWeight: '800', lineHeight: 22 },
  title: { ...typeBase, fontSize: 30, fontWeight: '800', lineHeight: 36, letterSpacing: -0.4 },
  heading: { ...typeBase, fontSize: 16, fontWeight: '700', lineHeight: 22 },
  name: { ...typeBase, fontSize: 15, fontWeight: '700', lineHeight: 20 },
  body: { ...typeBase, fontSize: 14, fontWeight: '400', lineHeight: 21 },
  bodyEmphasis: { ...typeBase, fontSize: 14, fontWeight: '700', lineHeight: 21 },
  label: { ...typeBase, fontSize: 11, fontWeight: '700', letterSpacing: 2, lineHeight: 16 },
  caption: { ...typeBase, fontSize: 12, fontWeight: '400', lineHeight: 17 },
  captionEmphasis: { ...typeBase, fontSize: 12, fontWeight: '700', lineHeight: 17 },
  button: { ...typeBase, fontSize: 14, fontWeight: '800', lineHeight: 20 },
  link: { ...typeBase, fontSize: 14, fontWeight: '700', lineHeight: 20 },
  micro: { ...typeBase, fontSize: 10, fontWeight: '700', lineHeight: 14 },
  // TextInput must NOT carry a lineHeight — iOS centers it via the native field,
  // and a fixed lineHeight pushes the text off-center vertically.
  input: { ...typeBase, fontSize: 14, fontWeight: '400' },
}

// ---- Reusable building blocks ------------------------------------------------
// Common ViewStyle fragments every screen can compose.
export const surfaces: Record<string, ViewStyle> = {
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  pill: {
    backgroundColor: colors.card,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  field: {
    backgroundColor: colors.elevated,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  divider: {
    height: 1,
    backgroundColor: colors.textMuted,
    opacity: 0.4,
  },
}

export const buttons: Record<string, ViewStyle> = {
  primary: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: 'center',
  },
  secondary: {
    backgroundColor: colors.elevated,
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: 'center',
  },
  link: {
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  pill: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
}

// Gap helpers — use instead of raw numbers in layouts.
export const gaps = {
  xxs: spacing.xxs,
  sm: spacing.sm,
  md: spacing.md,
  lg: spacing.lg,
  xl: spacing.xl,
  xxl: spacing.xxl,
} as const