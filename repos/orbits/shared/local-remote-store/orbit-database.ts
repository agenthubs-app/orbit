import type { MockRuntimeFixtures } from "../mock/fixtures";
import { defaultMockFixtures } from "../mock/fixtures";
import {
  createBrowserLocalStorageAdapter,
  createMemoryStorageAdapter,
  createVersionedLocalRemoteStore,
  type StorageLike,
  type VersionedLocalRemoteStore,
} from "./store";

// Orbit local remote database 是对通用 versioned store 的业务封装。
// 它把 shared mock runtime fixtures 当作“未来远程数据库”的本地表集合来读写。
export const ORBIT_LOCAL_REMOTE_DATABASE_KEY =
  "orbit.local-remote-database.v2" as const;

// 改变 MockRuntimeFixtures 结构或迁移策略时必须提升 schemaVersion。
export const ORBIT_LOCAL_REMOTE_DATABASE_SCHEMA_VERSION = 2 as const;

export type OrbitLocalRemoteDatabase =
  VersionedLocalRemoteStore<MockRuntimeFixtures>;

export interface OrbitLocalRemoteDatabaseOptions {
  seed?: MockRuntimeFixtures;
  storage?: StorageLike;
}

function readSeedFromEnvironment(): MockRuntimeFixtures | null {
  const rawSeed = process.env.ORBIT_LOCAL_REMOTE_DATABASE_SEED_JSON;

  if (!rawSeed?.trim()) {
    return null;
  }

  try {
    return JSON.parse(rawSeed) as MockRuntimeFixtures;
  } catch {
    return null;
  }
}

// 默认优先使用浏览器 localStorage；非浏览器环境退回 memory adapter，保证测试和 SSR 不崩。
export function createDefaultOrbitLocalRemoteStorage(): StorageLike {
  return createBrowserLocalStorageAdapter() ?? createMemoryStorageAdapter();
}

// 创建 Orbit 业务数据库实例。seed 只用于初始化，之后状态由 adapter 中的持久化数据接管。
export function createOrbitLocalRemoteDatabase(
  options: OrbitLocalRemoteDatabaseOptions = {},
): OrbitLocalRemoteDatabase {
  const seed =
    options.seed ?? readSeedFromEnvironment() ?? defaultMockFixtures;

  return createVersionedLocalRemoteStore({
    initialState: seed,
    schemaVersion: ORBIT_LOCAL_REMOTE_DATABASE_SCHEMA_VERSION,
    storage: options.storage ?? createDefaultOrbitLocalRemoteStorage(),
    storageKey: ORBIT_LOCAL_REMOTE_DATABASE_KEY,
  });
}
