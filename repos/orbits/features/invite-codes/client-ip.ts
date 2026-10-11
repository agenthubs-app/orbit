/**
 * R15 公开预览与兑换的客户端 IP（DESIGN add-and-invite §6 第 3 条，复核 M7）。Owner: 甲 (R15).
 * Used by: `handlers.ts`（限流桶的主体）。
 *
 * 只认平台写入的 `x-real-ip`（Vercel 在边缘覆盖写入，客户端伪造无效）；没有这个头（本机）时用固定桶 `local`。
 * **不读** `x-forwarded-for`（客户端可以任意伪造）。原始 IP 只在内存里用来算 HMAC，不落库、不进日志。
 */
export const INVITE_LOCAL_IP_BUCKET = "local";

export function inviteClientIp(headers: Pick<Headers, "get">): string {
  const value = headers.get("x-real-ip")?.trim() ?? "";
  // IPv4 / IPv6 字面量的字符；别的（空、过长、带逗号的列表）一律当作没有。
  return value && value.length <= 64 && /^[0-9A-Fa-f:.]+$/u.test(value) ? value : INVITE_LOCAL_IP_BUCKET;
}
