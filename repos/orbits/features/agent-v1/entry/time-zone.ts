/**
 * agent-design AG20a, owner's decision 8 (2026-11-20; 设计稿 §3.1 "客户端可以表达时区偏好，服务端校验后固定本轮基准"): the zone
 * a client says for this turn is used only when it is a real IANA zone; otherwise, or when none is sent (an old client),
 * the deployment's zone, exactly as before.
 */
const SHAPE = /^(?:UTC|GMT|[A-Za-z]+(?:[/_-][A-Za-z0-9+_-]+){1,3})$/u;

export function entryTimeZone(value: unknown, fallback: string): { zone: string; from: "device" | "deployment" } {
  if (typeof value !== "string" || value.length > 64 || !SHAPE.test(value)) return { from: "deployment", zone: fallback };
  try {
    const resolved = new Intl.DateTimeFormat("en-US", { timeZone: value }).resolvedOptions().timeZone;
    return resolved ? { from: "device", zone: value } : { from: "deployment", zone: fallback };
  } catch {
    return { from: "deployment", zone: fallback };
  }
}
