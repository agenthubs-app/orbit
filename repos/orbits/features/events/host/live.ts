/**
 * R17 主催的 live 实现（Postgres + 现有 admission / operations / experience / access）。Owner: 甲 (R17).
 * 施工中：未配置数据库时返回 null（路由 503 HOST_UNCONFIGURED）。
 */
import type { HostService } from "./service";

export async function createConfiguredHostLiveService(): Promise<HostService | null> {
  return null;
}
