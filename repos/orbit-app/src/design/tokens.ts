export const colors = {
  accent: "#006DB8",
  accentHover: "#0060A3",
  accentPress: "#00528F",
  accentRing: "rgba(0,109,184,0.32)",
  accentSoft: "#E3F2FC",
  accentSofter: "#EDF8FF",
  amber: "#876020",
  amberSoft: "#F5EEDF",
  bg: "#F7F6F3",
  bgSoft: "#F7F6F3",
  bgSunken: "#F0EFEC",
  border: "#E5E4E0",
  border2: "#DADBD9",
  borderStrong: "#B9BDC4",
  canvas: "#F7F6F3",
  caution: "#876020",
  hairline: "rgba(32,36,44,0.08)",
  ink: "#20242C",
  live: "#437563",
  liveSoft: "#E9F1EC",
  muted: "#626874",
  onAccent: "#FFFFFF",
  onImage: "#FFFFFF",
  imageBadgeText: "#20242C",
  rose: "#A14B5C",
  roseSoft: "#F7E9EC",
  sky: "#476B92",
  skySoft: "#E9EFF5",
  surface: "#FFFEFC",
  surface2: "#F3F3F2",
  surface3: "#EAECEF",
  text: "#20242C",
  text2: "#626874",
  text3: "#666C76",
  text4: "#8D919A",
  tint: "#EDF8FF"
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
  control: 8,
  input: 10,
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
  display: 28,
  section: 18,
  small: 13,
  title: 22
} as const;

export const layout = {
  pageInset: 22,
  contentMax: 540,
  toolbar: 44,
  control: 44,
  primaryControl: 50,
  contentBottom: 48
} as const;

export const textStyles = {
  pageTitle: { fontSize: typography.display, lineHeight: 36, fontWeight: "700" },
  title: { fontSize: typography.title, lineHeight: 30, fontWeight: "600" },
  section: { fontSize: typography.section, lineHeight: 26, fontWeight: "600" },
  listTitle: { fontSize: 17, lineHeight: 24, fontWeight: "600" },
  body: { fontSize: typography.body, lineHeight: 23 },
  small: { fontSize: typography.small, lineHeight: 20 },
  caption: { fontSize: typography.caption, lineHeight: 18 }
} as const;

export const shadows = {
  card: {
    elevation: 0,
    boxShadow: "none"
  },
  subtle: {
    elevation: 1,
    boxShadow: "0 1px 3px rgba(18,18,28,0.05)"
  },
  webCard: {
    boxShadow: "none"
  },
  webSubtle: {
    boxShadow: "0 1px 2px rgba(18,18,28,0.05)"
  }
} as const;
