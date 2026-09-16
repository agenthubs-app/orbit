export type ReadPersistence =
  | "durable_normalized"
  | "encrypted_ttl_snapshot"
  | "device_only"
  | "online_only_secret";

export type MutationPolicy = "offline_queue" | "local_only" | "online_only";

export type BinaryPolicy =
  | "metadata_only"
  | "on_demand_encrypted"
  | "user_pinned_encrypted"
  | "never_local";

export interface OfflinePolicy {
  domainId: string;
  schemaVersion: number;
  registryVersion: number;
  readPersistence: ReadPersistence;
  mutationPolicy: MutationPolicy;
  binaryPolicy: BinaryPolicy;
}

export interface OfflinePolicyRegistration {
  method: string;
  pathname: string;
  action: string;
  policy: OfflinePolicy;
}
