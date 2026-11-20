// 2026-11-20 活动图片（coverUrl）：存在活动版本的 source_payload.coverUrl（旧种子数据是 coverPath）。
// 服务端各读取口（详情 / 探す / 参加予定 / 主办方）共用这一个判断：只接受 https:// 绝对地址或站内 `/` 开头的路径
// （不接受 `//host` 协议相对地址、http、data: 等），读不懂就当没有图（null），界面保持 emoji 卡片。

const MAX_LENGTH = 2048;

/** 一个值是否是可显示的封面地址（https:// 或站内 `/…`）。 */
export function normalizeEventCoverUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || text.length > MAX_LENGTH || /\s/u.test(text)) return null;
  if (text.startsWith("/")) return text.startsWith("//") || text.includes("\\") ? null : text;
  if (!text.toLowerCase().startsWith("https://")) return null;
  try {
    const url = new URL(text);
    return url.protocol === "https:" && url.hostname ? text : null;
  } catch {
    return null;
  }
}

/** source_payload → coverUrl（`coverUrl` 优先，其次旧的 `coverPath`）。 */
export function eventCoverUrlFromPayload(payload: Readonly<Record<string, unknown>> | null | undefined): string | null {
  if (!payload || typeof payload !== "object") return null;
  return normalizeEventCoverUrl(payload.coverUrl) ?? normalizeEventCoverUrl(payload.coverPath);
}
