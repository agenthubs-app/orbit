export const colors = {
  accent: "#6359E9",
  accentHover: "#5249D6",
  accentPress: "#463DBE",
  accentRing: "rgba(99,89,233,0.32)",
  accentSoft: "#EEEDFC",
  accentSofter: "#F6F5FD",
  amber: "#C97A12",
  amberSoft: "#FBF0DE",
  bg: "#FFFFFF",
  bgSoft: "#F6F6F8",
  bgSunken: "#FAFAFB",
  border: "#ECECEF",
  border2: "#E2E2E7",
  borderStrong: "#D6D6DC",
  canvas: "#F6F6F8",
  caution: "#C97A12",
  hairline: "rgba(20,20,28,0.06)",
  ink: "#16161A",
  live: "#15A06B",
  liveSoft: "#E4F5EE",
  muted: "#62626B",
  onAccent: "#FFFFFF",
  rose: "#E0415F",
  roseSoft: "#FCE9ED",
  sky: "#2D7FF0",
  skySoft: "#E6F0FE",
  surface: "#FFFFFF",
  surface2: "#F8F8FA",
  surface3: "#F1F1F4",
  text: "#1D1D22",
  text2: "#62626B",
  text3: "#73737B",
  text4: "#ABABB3",
  tint: "#F6F5FD"
} as const;

export const radius = {
  card: 18,
  control: 10,
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
  display: 24,
  section: 17,
  small: 13,
  title: 20
} as const;

export const shadows = {
  card: {
    elevation: 2,
    boxShadow: "0 2px 8px rgba(18,18,28,0.06)"
  },
  subtle: {
    elevation: 1,
    boxShadow: "0 1px 3px rgba(18,18,28,0.05)"
  },
  webCard: {
    boxShadow: "0 1px 2px rgba(18,18,28,0.04), 0 2px 6px rgba(18,18,28,0.05)"
  },
  webSubtle: {
    boxShadow: "0 1px 2px rgba(18,18,28,0.05)"
  }
} as const;
