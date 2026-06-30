// FeatureMode 是 API route 层的全局运行模式开关。
// 默认使用 mock，避免本地开发或测试缺少环境变量时误连 live provider。
export const FEATURE_MODES = ["mock", "hybrid", "live"] as const;

export type FeatureMode = (typeof FEATURE_MODES)[number];

export const DEFAULT_FEATURE_MODE: FeatureMode = "mock";

function isFeatureMode(value: string): value is FeatureMode {
  // 所有外部输入都必须经过白名单，不能让任意字符串透传到 service factory。
  return FEATURE_MODES.includes(value as FeatureMode);
}

export function resolveFeatureMode(mode = process.env.ORBIT_FEATURE_MODE): FeatureMode {
  // mode 可以来自环境变量、测试注入或 query 参数；统一 trim/lowercase 后解析。
  const normalizedMode = mode?.trim().toLowerCase() ?? "";

  if (isFeatureMode(normalizedMode)) {
    return normalizedMode;
  }

  return DEFAULT_FEATURE_MODE;
}
