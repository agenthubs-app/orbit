export const colors = {
  accent: "#0A5CFF",
  accentHover: "#084FDE",
  accentPress: "#0642BC",
  accentRing: "rgba(10,92,255,0.32)",
  accentSoft: "#EEF3FF",
  accentSofter: "#F5F8FF",
  amber: "#876020",
  amberSoft: "#F5EEDF",
  bg: "#FFFFFF",
  bgSoft: "#F5F7FA",
  bgSunken: "#EEF0F4",
  border: "#E6E8EE",
  border2: "#EEF0F4",
  borderStrong: "#B9BDC4",
  canvas: "#FFFFFF",
  caution: "#876020",
  hairline: "#EEF0F4",
  ink: "#0B1220",
  live: "#437563",
  liveSoft: "#E9F1EC",
  muted: "#6B7280",
  onAccent: "#FFFFFF",
  onImage: "#FFFFFF",
  imageBadgeText: "#0B1220",
  rose: "#B42318",
  roseSoft: "#F7E9EC",
  sky: "#476B92",
  skySoft: "#E9EFF5",
  surface: "#FFFFFF",
  surface2: "#F5F7FA",
  surface3: "#EEF0F4",
  text: "#0B1220",
  text2: "#3C4658",
  // Necessary small copy uses the source's readable ink-2; ink-3 is decorative.
  text3: "#6B7280",
  text4: "#8B93A5",
  tint: "#EEF3FF"
} as const;

export type OrbitColors = { readonly [Key in keyof typeof colors]: string };
export type OrbitColorScheme = "light" | "dark";

export const darkColors: OrbitColors = {
  accent: "#A2AFD3",
  accentHover: "#B1BDDB",
  accentPress: "#8F9DBE",
  accentRing: "rgba(162,175,211,0.36)",
  accentSoft: "#394156",
  accentSofter: "#2D3446",
  amber: "#C7A16D",
  amberSoft: "#352E25",
  bg: "#191C22",
  bgSoft: "#191C22",
  bgSunken: "#15181D",
  border: "#343943",
  border2: "#424955",
  borderStrong: "#626D7D",
  canvas: "#191C22",
  caution: "#C7A16D",
  hairline: "rgba(240,240,236,0.10)",
  ink: "#F0F0EC",
  live: "#89B5A0",
  liveSoft: "#25352F",
  muted: "#B2B7C1",
  onAccent: "#171C2A",
  onImage: "#FFFFFF",
  imageBadgeText: "#20242C",
  rose: "#D28D98",
  roseSoft: "#3A2930",
  sky: "#96B6D5",
  skySoft: "#273443",
  surface: "#22262E",
  surface2: "#272C35",
  surface3: "#303743",
  text: "#F0F0EC",
  text2: "#B2B7C1",
  text3: "#A4A9B4",
  text4: "#969EAB",
  tint: "#2D3446"
};

export const radius = {
  card: 12,
  control: 12,
  input: 12,
  lg: 18,
  md: 14,
  pill: 999,
  sheet: 24,
  sm: 10,
  xl: 24,
  xs: 7
} as const;

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32
} as const;

export const typography = {
  body: 15,
  caption: 12,
  display: 30,
  section: 15,
  small: 13,
  title: 22
} as const;

export const layout = {
  pageInset: 16,
  contentMax: 540,
  toolbar: 44,
  control: 44,
  primaryControl: 50,
  contentBottom: 48
} as const;

export const textStyles = {
  pageTitle: { fontSize: typography.display, lineHeight: 38, fontWeight: "900" },
  title: { fontSize: typography.title, lineHeight: 30, fontWeight: "600" },
  section: { fontSize: typography.section, lineHeight: 22, fontWeight: "800" },
  listTitle: { fontSize: 15, lineHeight: 22, fontWeight: "700" },
  body: { fontSize: typography.body, lineHeight: 23 },
  small: { fontSize: typography.small, lineHeight: 20 },
  caption: { fontSize: typography.caption, lineHeight: 18 }
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
  }
} as const;
