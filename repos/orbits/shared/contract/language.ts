export const ORBIT_LANGUAGES = ["zh", "en", "ja"] as const;

export type OrbitLanguage = (typeof ORBIT_LANGUAGES)[number];
