/**
 * The two web switches (设计稿 §3.4 rule 7; CONVENTIONS §2; agent-design AG09-1).
 *
 * - The deployment's switch `ORBIT_AGENT_WEB` (`on` / `off`; unset is off).
 * - Each user's own switch, one record per account in the generic record table (collection `agent_v1_web_settings`,
 *   payload `{ web: "on" | "off" }`; no record is on). There is no settings screen yet (a later sprint draws one); the
 *   eval sets a case's switch with `settings: { web: off }`, which only exists under ORBIT_AGENT_EVAL=1.
 * With either off, not one web request is made and the parts the user's records can answer are answered as usual.
 */
import { createConfiguredPostgresLiveRecordStore } from "../../../shared/storage/configured-live-record-store";
import type { FeatureMode } from "../../../shared/config/feature-mode";
import { evalSetting } from "../observability/trace";

export const WEB_SETTINGS_COLLECTION = "agent_v1_web_settings";

export function webSwitchOn(env: Record<string, string | undefined> = process.env): boolean {
  return env.ORBIT_AGENT_WEB?.trim().toLowerCase() === "on";
}

export interface WebSettingsStore {
  userWebOn(actorId: string): Promise<boolean>;
}

const recordIdOf = (actorId: string) => `agent-v1-web-settings:${encodeURIComponent(actorId)}`;

/** The eval's per-case switch (null outside the eval). */
function evalUserSwitch(): boolean | null {
  const value = evalSetting("web");
  return value === "off" ? false : value === "on" ? true : null;
}

export function fixedWebSettings(on: boolean): WebSettingsStore {
  return { userWebOn: async () => evalUserSwitch() ?? on };
}

export function configuredWebSettings(mode: FeatureMode): WebSettingsStore {
  const configured = mode === "mock" || mode === "hybrid" ? null : createConfiguredPostgresLiveRecordStore<Record<string, unknown>>();
  if (!configured) return fixedWebSettings(true);
  const { store, workspaceId } = configured;
  return {
    async userWebOn(actorId) {
      const forced = evalUserSwitch();
      if (forced !== null) return forced;
      const record = await store.getRecord({ collectionName: WEB_SETTINGS_COLLECTION, recordId: recordIdOf(actorId), userId: actorId, workspaceId });
      return (record?.payload as { web?: unknown } | undefined)?.web !== "off";
    },
  };
}
