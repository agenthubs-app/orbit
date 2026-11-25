// 记一步，绝不影响主流程：没配库、表还没建、写失败都只写一行日志（不带访客、账号、地址）。
import { after } from "next/server";

import { resolveModuleMode } from "../../shared/services/module-mode";
import { createConfiguredPostgresLiveRecordStore } from "../../shared/storage/configured-live-record-store";
import { createSignupFunnelStore, type SignupFunnelStore } from "./store";

let override: SignupFunnelStore | null = null;

export function setSignupFunnelStoreForTests(store: SignupFunnelStore | null): void {
  override = store;
}

function configuredStore(): SignupFunnelStore | null {
  if (override) return override;
  if (resolveModuleMode(process.env.ORBIT_MODULE_MODE ?? process.env.ORBIT_FEATURE_MODE) !== "live") return null;
  const database = createConfiguredPostgresLiveRecordStore();
  return database ? createSignupFunnelStore(database.client, database.workspaceId) : null;
}

export async function writeSignupFunnel(write: (store: SignupFunnelStore) => Promise<void>): Promise<void> {
  try {
    const store = configuredStore();
    if (store) await write(store);
  } catch (error) {
    const code = typeof (error as { code?: unknown })?.code === "string" ? (error as { code: string }).code : "unknown";
    console.warn(JSON.stringify({ event: "signup_funnel_write_failed", code }));
  }
}

/** 响应发出之后再写；不在请求里（脚本、测试）就直接写。 */
export function recordSignupFunnel(write: (store: SignupFunnelStore) => Promise<void>): void {
  try {
    after(() => writeSignupFunnel(write));
  } catch {
    void writeSignupFunnel(write);
  }
}
