export interface OnlineOnlyLocalSyncDatabaseCapability {
  mode: "online-only";
  reason: "web-has-no-local-sync-database";
}

export async function getLocalSyncDatabaseCapability(): Promise<
  OnlineOnlyLocalSyncDatabaseCapability
> {
  return {
    mode: "online-only",
    reason: "web-has-no-local-sync-database",
  };
}
