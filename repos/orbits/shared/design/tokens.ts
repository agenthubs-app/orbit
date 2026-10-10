// 由 shared/design/tokens.json 生成，禁止手改；改源文件后运行 npm run design:tokens
// Pure constants, zero imports: this file is copied verbatim into repos/orbit-app/src/api/design/.

export const designColors = {
  light: {
    bg: "#F7F5F7",
    fogA: "rgba(206, 192, 236, 0.38)",
    fogB: "rgba(240, 205, 218, 0.34)",
    fogC: "rgba(214, 228, 246, 0.28)",
    surface: "#FFFFFF",
    surface2: "#F2EFF3",
    surface3: "#EAE6EC",
    line: "rgba(40, 30, 50, 0.06)",
    glass: "rgba(255, 255, 255, 0.62)",
    glassLine: "rgba(255, 255, 255, 0.7)",
    ink: "#1E1A24",
    ink2: "#5E5866",
    ink3: "#9C95A4",
    ink3Text: "#6F6778",
    ink4: "#C4BEC9",
    plum900: "#4F4466",
    plum700: "#6E628A",
    plum500: "#8E82A9",
    plum300: "#BDB3D2",
    plum100: "#E9E4F2",
    rose700: "#9C6C79",
    rose500: "#B98995",
    rose300: "#DDBFC6",
    rose100: "#F5E8EB",
    accent: "#6E628A",
    accentText: "#6C6087",
    accentSoft: "#E9E4F2",
    onAccent: "#FFFFFF",
    macPink: "#F8E4EA",
    macApricot: "#F7ECDD",
    macBlue: "#E2ECF8",
    macTeal: "#DCF0EA",
    macLav: "#ECE6F7",
    macPinkInk: "#A55F72",
    macApricotInk: "#9A6B33",
    macBlueInk: "#4C6D96",
    macTealInk: "#3D7D6A",
    macLavInk: "#6E5C9A",
    macPinkText: "#945465",
    macApricotText: "#8B602E",
    macBlueText: "#4A6B93",
    macTealText: "#387361",
    macLavText: "#6E5C9A",
    coral: "#E58A76",
    coralSoft: "#FBE7E1",
    coralText: "#B83E23",
    ok: "#5E9E86",
    okSoft: "#E3F1EA",
    okText: "#447361",
    onOk: "#1E1A24",
    onImage: "#FFFFFF",
    onImageBadge: "#1E1A24",
    scrim: "rgba(30, 20, 40, 0.28)",
    scrimWeb: "rgba(30, 20, 40, 0.22)"
  },
  dark: {
    bg: "#19181C",
    fogA: "rgba(120, 100, 170, 0.16)",
    fogB: "rgba(160, 100, 125, 0.12)",
    fogC: "rgba(90, 120, 170, 0.1)",
    surface: "#242328",
    surface2: "#2E2D33",
    surface3: "#393840",
    line: "rgba(255, 255, 255, 0.06)",
    glass: "rgba(44, 42, 50, 0.62)",
    glassLine: "rgba(255, 255, 255, 0.08)",
    ink: "#F3F0F6",
    ink2: "#BDB6C4",
    ink3: "#85808C",
    ink3Text: "#9A959F",
    ink4: "#5A5660",
    plum900: "#E7E0F3",
    plum700: "#CFC4E6",
    plum500: "#A79BC4",
    plum300: "#6F6589",
    plum100: "#35303F",
    rose700: "#EBC4CD",
    rose500: "#D4A3AF",
    rose300: "#7E5B64",
    rose100: "#3A2F33",
    accent: "#CFC4E6",
    accentText: "#CFC4E6",
    accentSoft: "#35303F",
    onAccent: "#1E1A24",
    macPink: "#3B2D33",
    macApricot: "#3A3229",
    macBlue: "#2B3340",
    macTeal: "#28372F",
    macLav: "#332D40",
    macPinkInk: "#EBB3C2",
    macApricotInk: "#E6C595",
    macBlueInk: "#A9C4E6",
    macTealInk: "#9FD3BF",
    macLavInk: "#C9BBEB",
    macPinkText: "#EBB3C2",
    macApricotText: "#E6C595",
    macBlueText: "#A9C4E6",
    macTealText: "#9FD3BF",
    macLavText: "#C9BBEB",
    coral: "#F29C88",
    coralSoft: "#42302C",
    coralText: "#F29C88",
    ok: "#8CC7AF",
    okSoft: "#24352D",
    okText: "#8CC7AF",
    onOk: "#19181C",
    onImage: "#FFFFFF",
    onImageBadge: "#1E1A24",
    scrim: "rgba(0, 0, 0, 0.55)",
    scrimWeb: "rgba(0, 0, 0, 0.55)"
  }
} as const;

export type DesignColorName = keyof typeof designColors.light;

// Every text × background pair that must clear 4.5:1 in both themes (RD-05).
// A "#RRGGBB" entry is a fixed colour (photo overlay, white badge), not a token.
export const designContrast = [
  ["ink", "bg"],
  ["ink", "surface"],
  ["ink", "surface2"],
  ["ink2", "bg"],
  ["ink2", "surface"],
  ["ink2", "surface2"],
  ["ink3Text", "bg"],
  ["ink3Text", "surface"],
  ["ink3Text", "surface2"],
  ["ink", "surface3"],
  ["ink2", "surface3"],
  ["accentText", "bg"],
  ["accentText", "surface"],
  ["accentText", "surface2"],
  ["accentText", "accentSoft"],
  ["onAccent", "accent"],
  ["onAccent", "accentText"],
  ["onAccent", "ink"],
  ["macPinkText", "macPink"],
  ["macApricotText", "macApricot"],
  ["macBlueText", "macBlue"],
  ["macTealText", "macTeal"],
  ["macLavText", "macLav"],
  ["macPinkText", "surface"],
  ["macApricotText", "surface"],
  ["macBlueText", "surface"],
  ["macTealText", "surface"],
  ["macLavText", "surface"],
  ["coralText", "coralSoft"],
  ["coralText", "bg"],
  ["coralText", "surface"],
  ["coralText", "surface2"],
  ["onAccent", "coralText"],
  ["okText", "okSoft"],
  ["okText", "bg"],
  ["okText", "surface"],
  ["okText", "surface2"],
  ["onOk", "ok"],
  ["onImage", "#171C2A"],
  ["onImageBadge", "#FFFFFF"]
] as const;

export const designRadius = {
  xl: 24,
  lg: 20,
  md: 14,
  sm: 10,
  sheet: 34,
  dialog: 28,
  cardWeb: 22,
  bubble: 18,
  pill: 999,
  menu: 18,
  tile: 16,
  tag: 6
} as const;

export const designSpace = {
  gap: 14,
  scale: [4, 8, 12, 14, 16, 18, 20, 22, 24, 26, 34]
} as const;

export const designFont = {
  family: {
    ja: "\"Hiragino Sans\", \"Hiragino Kaku Gothic ProN\", \"Noto Sans JP\", -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
    zh: "\"PingFang SC\", \"Noto Sans SC\", \"Hiragino Sans GB\", -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
    en: "-apple-system, BlinkMacSystemFont, \"SF Pro Text\", \"Segoe UI\", system-ui, sans-serif",
    num: "\"SF Pro Rounded\", -apple-system, \"SF Pro Display\", system-ui, sans-serif"
  },
  size: {
    display: 38,
    number: 22,
    title: 24,
    titleSm: 20,
    cardTitle: 14.5,
    body: 14,
    bodySm: 13,
    label: 11.5,
    caption: 11,
    dialogTitle: 16,
    control: 12.5,
    meta: 12
  },
  weight: {
    regular: 400,
    medium: 500,
    bold: 700,
    heavy: 800,
    black: 900
  },
  lineHeight: {
    display: 1.05,
    title: 1.35,
    body: 1.55,
    label: 1.4
  }
} as const;

export const designShadow = {
  float: {
    light: "0 10px 30px -12px rgba(60, 40, 90, 0.22)",
    dark: "0 12px 30px -10px rgba(0, 0, 0, 0.6)"
  }
} as const;

export const designMotion = {
  ease: "cubic-bezier(0.2, 0.8, 0.2, 1)",
  duration: {
    press: 150,
    swipe: 300,
    dialog: 300,
    sheet: 320,
    expand: 350,
    toastIn: 450,
    toastOut: 200,
    enter: 600,
    count: 1150,
    stagger: 40,
    shimmer: 1600
  }
} as const;
