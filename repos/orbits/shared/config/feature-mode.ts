export const FEATURE_MODES = ["mock", "hybrid", "live"] as const;

export type FeatureMode = (typeof FEATURE_MODES)[number];

export const DEFAULT_FEATURE_MODE: FeatureMode = "mock";

function isFeatureMode(value: string): value is FeatureMode {
  return FEATURE_MODES.includes(value as FeatureMode);
}

export function resolveFeatureMode(mode = process.env.ORBIT_FEATURE_MODE): FeatureMode {
  const normalizedMode = mode?.trim().toLowerCase() ?? "";

  if (isFeatureMode(normalizedMode)) {
    return normalizedMode;
  }

  return DEFAULT_FEATURE_MODE;
}
