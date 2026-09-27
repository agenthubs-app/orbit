/**
 * 示例时钟（W0004 定义，W0005 起单独成文件）：东京的今天 11:40。
 *
 * 从 `demo-persona.ts` 挪出来，是为了让 `demo-mode-core.tsx`（人脉页等也要挂的示例 Provider）
 * 不必连带打包首页示例数据及其依赖。`demo-persona.ts` 原样转出这两个名字。
 */

/** 示例时钟的钟点（东京时间）。 */
export const DEMO_CLOCK_TIME = "11:40";

/** 以 Asia/Tokyo 为准的 `YYYY-MM-DD`（与 iOrbit 概览的 `iorbitDayKey` 同一口径）。 */
function tokyoDayKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { day: "2-digit", month: "2-digit", timeZone: "Asia/Tokyo", year: "numeric" }).format(date);
}

/** 示例时钟：东京的今天 11:40（日期跟着真实日期走，跨午夜也换到新的一天）。 */
export function demoNow(real: Date = new Date()): Date {
  return new Date(`${tokyoDayKey(real)}T${DEMO_CLOCK_TIME}:00+09:00`);
}
