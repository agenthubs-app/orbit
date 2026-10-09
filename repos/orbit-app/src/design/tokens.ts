import { designColors, designFont, designMotion, designRadius, designShadow } from "../api/design/tokens";

// R01: every value below comes from the generated, synced copy of
// orbits/shared/design/tokens.json (src/api/design/tokens.ts — never edit it by
// hand; change tokens.json, run `npm run design:tokens` there and
// `npm run sync:contract` here). Names are the design kit's, camelCased:
// ink-3-text → ink3Text. Text uses ink / ink2 / ink3Text / *Text / on* only;
// the raw design values (ink3, ink4, accent, mac*Ink, coral, ok) are for
// icons, decoration and ≥18px bold type (see orbits/shared/design/README.md).
export const colors = designColors.light;

export type OrbitColors = { readonly [Key in keyof typeof designColors.light]: string };
export type OrbitColorScheme = "light" | "dark";

export const darkColors: OrbitColors = designColors.dark;

export const radius = designRadius;

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32
} as const;

export const typography = designFont.size;

export const fontWeight = designFont.weight;

export const motion = designMotion;

export const layout = {
  pageInset: 16,
  contentMax: 540,
  toolbar: 44,
  control: 44,
  primaryControl: 50,
  contentBottom: 48
} as const;

export const textStyles = {
  pageTitle: { fontSize: typography.title, lineHeight: 32, fontWeight: "900" },
  title: { fontSize: typography.titleSm, lineHeight: 28, fontWeight: "800" },
  section: { fontSize: typography.cardTitle, lineHeight: 21, fontWeight: "800" },
  listTitle: { fontSize: typography.cardTitle, lineHeight: 21, fontWeight: "700" },
  body: { fontSize: typography.body, lineHeight: 22 },
  small: { fontSize: typography.bodySm, lineHeight: 20 },
  caption: { fontSize: typography.label, lineHeight: 17 }
} as const;

/**
 * Sprint 0084: the four roles a "分组标题 + 行" page stacks in one column.
 *
 * They used to sit between 15px/600 and 15px/800, so a group heading, a row you
 * can open and a field label all read the same weight and only the chevron said
 * which was which. The reversal: the heading becomes the lightest thing on the
 * page and the content becomes the heaviest.
 *
 * Kept here rather than per screen because it is one decision. `textStyles.section`
 * is deliberately untouched — 65 files read it for content-section headings all
 * over the app, and those are a different role from a list group heading.
 * Colours belong to the theme, so each use site pairs these with `text3`/`ink`.
 * No `lineHeight` on purpose: native Dynamic Type scales `fontSize` but leaves an
 * explicit `lineHeight` where it was, which clips the text at large sizes.
 */
export const rowRoleStyles = {
  groupHeading: { fontSize: 12, fontWeight: "600", letterSpacing: 0.96, textTransform: "uppercase" },
  navLabel: { fontSize: 16, fontWeight: "500" },
  fieldLabel: { fontSize: 13, fontWeight: "500" },
  fieldValue: { fontSize: 16, fontWeight: "400" }
} as const;

export const shadows = {
  card: {
    elevation: 0,
    boxShadow: "none"
  },
  subtle: {
    elevation: 0,
    boxShadow: "none"
  },
  webCard: {
    boxShadow: "none"
  },
  webSubtle: {
    boxShadow: "none"
  },
  // The design's only shadow, for floating layers (sheets, popovers).
  float: {
    elevation: 0,
    boxShadow: designShadow.float.light
  },
  floatDark: {
    elevation: 0,
    boxShadow: designShadow.float.dark
  }
} as const;

// Themed styles are built once per palette (theme.ts), so the palette tells
// which of the two floating shadows applies.
export function floatShadow(palette: OrbitColors) {
  return palette === darkColors ? shadows.floatDark : shadows.float;
}
