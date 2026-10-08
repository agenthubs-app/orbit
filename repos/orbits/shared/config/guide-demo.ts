/**
 * 引导期示例模式的服务端开关（W0004，决定 D1 / D2）。纯服务端读取，不进客户端包。
 *
 * - `ORBIT_GUIDE_DEMO`：`on` / `true` / `1` 打开，其余（含未设置）一律关闭。默认关，
 *   W0008（生成计划）上线时在目标环境打开。
 * - `ORBIT_GUIDE_DEMO_SINCE`：开关首次启用的日期：`2026-10-15`（东京当天 00:00）或带时区的
 *   完整时间戳（`…Z` / `…+09:00`），
 *   用于 D2 老用户判定：账号创建早于它且首次判定时已确认联系人 ≥3 的人不进入示例。
 *   未设置或无法解析时为 null，判定退化为「已确认联系人 ≥3 即老用户」（宁可少给老用户看示例）。
 */
export interface GuideDemoConfig {
  enabled: boolean;
  since: Date | null;
}

type GuideDemoEnv = Readonly<Record<string, string | undefined>>;

const ENABLED_VALUES = new Set(["on", "true", "1"]);

export function readGuideDemoConfig(env: GuideDemoEnv = process.env): GuideDemoConfig {
  const flag = env.ORBIT_GUIDE_DEMO?.trim().toLowerCase() ?? "";
  return {
    enabled: ENABLED_VALUES.has(flag),
    since: parseGuideDemoSince(env.ORBIT_GUIDE_DEMO_SINCE),
  };
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIMESTAMP_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/i;

/**
 * `YYYY-MM-DD` 按东京当天 00:00 解释（`2026-10-15` = `2026-10-14T15:00:00Z`）；完整时间戳
 * 必须带 `Z` 或 `±HH:MM`，否则按服务器时区解释会因部署环境而异——视为无效（null）。
 * 不存在的日期（如 `2026-02-30`）也是无效。
 */
export function parseGuideDemoSince(raw: string | undefined): Date | null {
  const value = raw?.trim() ?? "";
  if (!value) return null;
  const dateOnly = DATE_ONLY.exec(value);
  if (dateOnly) {
    const [, year, month, day] = dateOnly.map(Number) as [number, number, number, number];
    const utc = new Date(Date.UTC(year, month - 1, day));
    if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) {
      return null;
    }
    return new Date(Date.UTC(year, month - 1, day) - 9 * 3_600_000);
  }
  if (!TIMESTAMP_WITH_OFFSET.test(value)) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms) : null;
}
