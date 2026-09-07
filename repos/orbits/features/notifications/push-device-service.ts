import { createHash } from "node:crypto";

import { createConfiguredPostgresLiveRecordStore } from "../../shared/storage/configured-live-record-store";
import type { LiveDatabaseEnv } from "../../shared/storage/live-database-config";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import type { LiveRecord, LiveRecordStoreLike } from "../../shared/storage/live-record-store";
import {
  createEncryptedPushTokenVault,
  createEphemeralPushTokenVault,
  pushTokenHash,
  type EncryptedPushToken,
  type PushTokenVault,
} from "./push-token-vault";

export const PUSH_DEVICE_COLLECTION = "pushDevices" as const;

export type PushDevicePlatform = "ios" | "android" | "web";
export type PushPermissionState = "granted" | "denied" | "undetermined";

export interface PushDevice {
  deviceId: string;
  actorId: string;
  platform: PushDevicePlatform;
  permission: PushPermissionState;
  appVersion?: string;
  registeredAt: string;
  updatedAt: string;
  revokedAt?: string;
}

export interface PushDeviceDescriptor extends Omit<PushDevice, "actorId"> {
  active: boolean;
}

interface PushDeviceRecordPayload extends Record<string, unknown> {
  encryptedToken: EncryptedPushToken;
  kind: "push_device";
  device: PushDevice;
  tokenHash: string;
}

export interface PushDeviceService {
  listActive: () => Promise<readonly (PushDeviceDescriptor & { token: string })[]>;
  register: (input: {
    deviceId: string;
    token: string;
    platform: PushDevicePlatform;
    permission?: PushPermissionState;
    appVersion?: string;
  }) => Promise<PushDeviceDescriptor>;
  revoke: (deviceId: string) => Promise<PushDeviceDescriptor | null>;
}

export interface StoragePushDeviceServiceOptions {
  actorId: string;
  store: LiveRecordStoreLike<PushDeviceRecordPayload>;
  tokenVault: PushTokenVault;
  workspaceId: string;
  now?: () => string;
}

function required(value: string, label: string, max = 256): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized || normalized.length > max) {
    throw new Error(`${label} is invalid.`);
  }
  return normalized;
}

function actorWorkspaceId(workspaceId: string, actorId: string): string {
  required(actorId, "Actor");
  return required(workspaceId, "Workspace");
}

function stableDeviceRecordId(actorId: string, deviceId: string): string {
  const digest = createHash("sha256")
    .update(`${actorId}\u0000${deviceId}`)
    .digest("hex");
  return `push-device:${digest}`;
}

function descriptor(device: PushDevice): PushDeviceDescriptor {
  const { actorId: _actorId, ...publicDevice } = device;
  return {
    ...publicDevice,
    active: !device.revokedAt,
  };
}

function recordFor(
  workspaceId: string,
  actorId: string,
  device: PushDevice,
  encryptedToken: EncryptedPushToken,
  tokenHash: string,
): LiveRecord<PushDeviceRecordPayload> {
  const recordId = stableDeviceRecordId(actorId, device.deviceId);
  return {
    collectionName: PUSH_DEVICE_COLLECTION,
    createdAt: device.registeredAt,
    evidenceIds: [],
    lifecycleState: device.revokedAt ? "archived" : "active",
    payload: {
      device,
      encryptedToken,
      kind: "push_device",
      tokenHash,
    },
    recordId,
    searchText: `${device.platform} ${device.deviceId}`,
    sourceId: device.deviceId,
    sourceLabel: "Orbit mobile push registration",
    sourceType: "mobile_push",
    updatedAt: device.updatedAt,
    userId: actorId,
    workspaceId,
  };
}

function deviceFromRecord(
  record: LiveRecord<PushDeviceRecordPayload>,
  tokenVault: PushTokenVault,
): { device: PushDevice; token: string } | null {
  const device = record.payload.device;
  const encryptedToken = record.payload.encryptedToken;
  const storedTokenHash = record.payload.tokenHash;
  if (
    !device ||
    typeof device !== "object" ||
    typeof device.deviceId !== "string" ||
    typeof device.actorId !== "string" ||
    typeof device.updatedAt !== "string" ||
    typeof storedTokenHash !== "string" ||
    !encryptedToken ||
    typeof encryptedToken !== "object" ||
    encryptedToken.algorithm !== "aes-256-gcm" ||
    typeof encryptedToken.ciphertext !== "string" ||
    typeof encryptedToken.iv !== "string" ||
    typeof encryptedToken.tag !== "string"
  ) {
    return null;
  }
  try {
    const token = tokenVault.decrypt(encryptedToken);
    return pushTokenHash(token) === storedTokenHash ? { device, token } : null;
  } catch {
    // A corrupt or undecryptable token is not eligible for delivery. Do not
    // expose ciphertext, key material, or provider details to the caller.
    return null;
  }
}

export function createStoragePushDeviceService({
  actorId,
  now = () => new Date().toISOString(),
  store,
  tokenVault,
  workspaceId,
}: StoragePushDeviceServiceOptions): PushDeviceService {
  const normalizedActorId = required(actorId, "Actor");
  const scopedWorkspaceId = actorWorkspaceId(workspaceId, normalizedActorId);

  async function read(deviceId: string) {
    const record = await store.getRecord({
      collectionName: PUSH_DEVICE_COLLECTION,
      recordId: stableDeviceRecordId(normalizedActorId, required(deviceId, "Device")),
      workspaceId: scopedWorkspaceId,
    });
    return record ? deviceFromRecord(record, tokenVault) : null;
  }

  return {
    async listActive() {
      const records = await store.listRecords({
        collectionName: PUSH_DEVICE_COLLECTION,
        lifecycleState: "active",
        userId: normalizedActorId,
        workspaceId: scopedWorkspaceId,
      });
      return records.flatMap((record) => {
        const value = deviceFromRecord(record, tokenVault);
        return value && !value.device.revokedAt && value.device.permission === "granted"
          ? [{ ...descriptor(value.device), token: value.token }]
          : [];
      });
    },
    async register(input) {
      const deviceId = required(input.deviceId, "Device");
      const token = required(input.token, "Push token", 4096);
      if (input.platform !== "ios" && input.platform !== "android" && input.platform !== "web") {
        throw new Error("Push platform is invalid.");
      }
      const permission = input.permission ?? "granted";
      if (permission !== "granted" && permission !== "denied" && permission !== "undetermined") {
        throw new Error("Push permission is invalid.");
      }
      const updatedAt = now();
      const existing = await read(deviceId);
      const device: PushDevice = {
        actorId: normalizedActorId,
        appVersion: input.appVersion ? required(input.appVersion, "App version", 64) : undefined,
        deviceId,
        permission,
        registeredAt: existing?.device.registeredAt ?? updatedAt,
        updatedAt,
        revokedAt: undefined,
        platform: input.platform,
      };
      await store.upsertRecord(
        recordFor(
          scopedWorkspaceId,
          normalizedActorId,
          device,
          tokenVault.encrypt(token),
          pushTokenHash(token),
        ),
      );
      return descriptor(device);
    },
    async revoke(deviceId) {
      const existing = await read(deviceId);
      if (!existing) return null;
      const updatedAt = now();
      const device: PushDevice = {
        ...existing.device,
        revokedAt: updatedAt,
        updatedAt,
      };
      await store.upsertRecord(
        recordFor(
          scopedWorkspaceId,
          normalizedActorId,
          device,
          tokenVault.encrypt(existing.token),
          pushTokenHash(existing.token),
        ),
      );
      return descriptor(device);
    },
  };
}

interface PushDeviceServiceGlobal {
  __orbitPushDeviceServices?: Map<string, PushDeviceService>;
  __orbitPushDeviceMemoryStores?: Map<string, LiveRecordStoreLike<PushDeviceRecordPayload>>;
}

const pushDeviceGlobal = globalThis as typeof globalThis & PushDeviceServiceGlobal;

export interface ConfiguredPushDeviceServiceOptions {
  actorId: string;
  env?: LiveDatabaseEnv;
  tokenVault?: PushTokenVault;
}

export function createPushDeviceService(
  input: ConfiguredPushDeviceServiceOptions = { actorId: "local-test-actor" },
): PushDeviceService {
  const actorId = required(input.actorId, "Actor");
  const env = input.env;
  const injectedVault = input.tokenVault;
  const configured = createConfiguredPostgresLiveRecordStore<PushDeviceRecordPayload>({
    env,
  });
  const configuredKey = (env ?? process.env).ORBIT_PUSH_TOKEN_KEY?.trim();
  if (configured && !configuredKey) {
    throw new Error(
      "ORBIT_PUSH_TOKEN_KEY is required when the push device database is configured.",
    );
  }
  const tokenVault =
    injectedVault ??
    (configuredKey
      ? createEncryptedPushTokenVault({ encryptionKeyBase64: configuredKey })
      : createEphemeralPushTokenVault());
  const baseWorkspaceId = configured?.workspaceId ?? "orbit-push-local";
  const key = `${baseWorkspaceId}\u0000${actorId}`;
  const services = pushDeviceGlobal.__orbitPushDeviceServices ?? new Map<string, PushDeviceService>();
  pushDeviceGlobal.__orbitPushDeviceServices = services;
  const existing = services.get(key);
  if (existing) return existing;
  const memoryStores = pushDeviceGlobal.__orbitPushDeviceMemoryStores ?? new Map<string, LiveRecordStoreLike<PushDeviceRecordPayload>>();
  pushDeviceGlobal.__orbitPushDeviceMemoryStores = memoryStores;
  const store = configured?.store ?? memoryStores.get(key) ?? createMemoryLiveRecordStore<PushDeviceRecordPayload>();
  if (!configured) memoryStores.set(key, store);
  const service = createStoragePushDeviceService({
    actorId,
    store,
    tokenVault,
    workspaceId: baseWorkspaceId,
  });
  services.set(key, service);
  return service;
}

export interface PushDeviceActorEnumerator {
  listOptedInActorIds: () => Promise<readonly string[]>;
}

export interface StoragePushDeviceActorEnumeratorOptions {
  sqlClient: {
    query: <TRow = Record<string, unknown>>(
      text: string,
      values?: readonly unknown[],
    ) => Promise<{ rows: readonly TRow[] }>;
  };
  workspaceId: string;
}

export function createStoragePushDeviceActorEnumerator({
  sqlClient,
  workspaceId,
}: StoragePushDeviceActorEnumeratorOptions): PushDeviceActorEnumerator {
  return {
    async listOptedInActorIds() {
      const result = await sqlClient.query<{ actor_id: string | null }>(
        `
          select distinct user_id as actor_id
          from orbit_records
          where workspace_id = $1
            and collection_name = $2
            and lifecycle_state = 'active'
            and user_id is not null
            and user_id <> ''
            and payload->'device'->>'permission' = 'granted'
            and coalesce(payload->'device'->>'revokedAt', '') = ''
          order by actor_id
        `,
        [workspaceId, PUSH_DEVICE_COLLECTION],
      );
      return result.rows.flatMap((row) =>
        typeof row.actor_id === "string" && row.actor_id.trim()
          ? [row.actor_id.trim()]
          : [],
      );
    },
  };
}

export function createConfiguredPushDeviceActorEnumerator(input: {
  env?: LiveDatabaseEnv;
} = {}): PushDeviceActorEnumerator | null {
  const configured = createConfiguredPostgresLiveRecordStore({ env: input.env });
  return configured
    ? createStoragePushDeviceActorEnumerator({
        sqlClient: configured.client,
        workspaceId: configured.workspaceId,
      })
    : null;
}

export function resetPushDeviceServicesForTests(): void {
  pushDeviceGlobal.__orbitPushDeviceServices?.clear();
  pushDeviceGlobal.__orbitPushDeviceMemoryStores?.clear();
}
