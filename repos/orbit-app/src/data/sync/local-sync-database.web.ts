import { browserMirrorEnvironment, probeWebMirror, WEB_MIRROR_DOMAIN_IDS, type WebMirrorEnvironment, type WebMirrorUnavailableReason } from "./web-mirror-storage";

// Web entry for `./local-sync-database`: the same core as native plus the browser capability probe.
export * from "./local-sync-database-core";

export type LocalSyncDatabaseCapability =
  | { mode: "local-mirror"; domains: readonly string[] }
  | { mode: "online-only"; reason: WebMirrorUnavailableReason };

/** The browser mirrors a whitelist of domains when OPFS, IndexedDB and Web Crypto are all present in a secure context. */
export async function getLocalSyncDatabaseCapability(
  environment: WebMirrorEnvironment = browserMirrorEnvironment(),
): Promise<LocalSyncDatabaseCapability> {
  const probe = probeWebMirror(environment);
  return probe.available
    ? { mode: "local-mirror", domains: WEB_MIRROR_DOMAIN_IDS }
    : { mode: "online-only", reason: probe.reason ?? "no-opfs" };
}
