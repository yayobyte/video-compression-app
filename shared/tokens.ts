// Platform-neutral design tokens shared by the web app and the mobile app.
//
// This is the single source of truth for color, spacing, and radius. Mobile
// builds its StyleSheet from these (`mobile/src/theme.ts`); web generates CSS
// custom properties from them (`src/main.tsx`) so both platforms share the
// same palette, spacing grid, and radius set.
//
// Source of truth: DESIGN.md (Revolut-inspired). Mobile stands on a 4px
// spacing grid with a compact radius set.

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

// ---- CSS custom-property generation (web) -----------------------------------
// Convert the token objects above into a `:root { --t-… }` block for the web
// app. `main.tsx` injects this string so the web palette is derived from the
// same source file as the mobile theme.
const kebab = (value: string) => value.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)

export const tokenCssVars = (): string => {
  const colorVars = Object.entries(colors).map(([key, value]) => `  --t-${kebab(key)}: ${value};`)
  const spacingVars = Object.entries(spacing).map(([key, value]) => `  --t-space-${kebab(key)}: ${value}px;`)
  const radiusVars = Object.entries(radius).map(([key, value]) => `  --t-radius-${kebab(key)}: ${value}px;`)
  return `:root {\n${[...colorVars, ...spacingVars, ...radiusVars].join('\n')}\n}`
}
