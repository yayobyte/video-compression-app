import { colors, radius, spacing } from '../../shared/tokens'
import type { TextStyle, ViewStyle } from 'react-native'

// Re-export the shared token objects so existing imports keep working and
// mobile/App.tsx still gets them from `./src/theme`.
export { colors, radius, spacing }

// Design tokens for the Clippress mobile app.
// Source of truth: shared/tokens.ts (extracted from DESIGN.md, Revolut-inspired).
// Mobile stands on the shared 4px spacing grid, radius set, and color palette,
// adding platform-specific typography (system font, line-height-free inputs) and
// reusable composite styles below.

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
  name: { ...typeBase, fontSize: 14, fontWeight: '200', lineHeight: 20 },
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