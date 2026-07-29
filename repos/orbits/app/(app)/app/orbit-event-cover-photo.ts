const themeByCode: Record<string, string> = {
  SAAS04: "cloud",
  SEMI26: "chip",
  FINTK8: "finance",
  AIFND: "ai",
  FASHN: "fashion",
  D2C03: "fashion",
  CONS5: "globe",
  XB25: "globe",
};

const coverPhotoByTheme: Record<string, string> = {
  ai: "/orbit-covers/ai.jpg",
  chip: "/orbit-covers/chip.jpg",
  cloud: "/orbit-covers/cloud.jpg",
  fashion: "/orbit-covers/fashion.jpg",
  finance: "/orbit-covers/finance.jpg",
  globe: "/orbit-covers/globe.jpg",
};

export function eventCoverPhoto(code: string): string | undefined {
  return coverPhotoByTheme[themeByCode[code] ?? "ai"];
}
