// local-remote store 是“本地像远程数据库一样使用”的最小存储抽象。
// 它不绑定浏览器 localStorage：测试、服务端和未来远程数据库都可以实现 StorageLike。
export interface StorageLike {
  getItem: (key: string) => string | null;
  removeItem: (key: string) => void;
  setItem: (key: string, value: string) => void;
}

// 持久化时统一包一层 envelope，避免不同 schemaVersion 的旧数据被误读。
export interface VersionedLocalRemoteStoreEnvelope<TState> {
  schemaVersion: number;
  state: TState;
  storageKind: "local-remote-database";
}

// feature service 只依赖这个接口，不需要知道背后是 memory、localStorage 还是未来远程 adapter。
export interface VersionedLocalRemoteStore<TState> {
  getState: () => TState;
  replaceState: (nextState: TState) => TState;
  reset: () => TState;
  schemaVersion: number;
  storageKey: string;
  updateState: (recipe: (draft: TState) => void) => TState;
}

export interface VersionedLocalRemoteStoreOptions<TState> {
  initialState: TState;
  schemaVersion: number;
  storage: StorageLike;
  storageKey: string;
}

// 通过 JSON clone 切断调用方和 store 内部状态的引用关系。
// 这个 store 存的是 mock/runtime DTO，要求必须是可 JSON 序列化的数据。
function cloneJson<TValue>(value: TValue): TValue {
  return JSON.parse(JSON.stringify(value)) as TValue;
}

// encodeEnvelope 是唯一写入格式；读端会验证 schemaVersion 和 storageKind。
function encodeEnvelope<TState>(
  schemaVersion: number,
  state: TState,
): string {
  return JSON.stringify({
    schemaVersion,
    state,
    storageKind: "local-remote-database",
  } satisfies VersionedLocalRemoteStoreEnvelope<TState>);
}

// 只接受当前 schemaVersion 的 envelope。旧版本、错误 key 或手写坏数据都会被忽略。
function isEnvelopeForSchema<TState>(
  value: unknown,
  schemaVersion: number,
): value is VersionedLocalRemoteStoreEnvelope<TState> {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { schemaVersion?: unknown }).schemaVersion === schemaVersion &&
    (value as { storageKind?: unknown }).storageKind ===
      "local-remote-database" &&
    "state" in value
  );
}

// 读取失败时返回 null，而不是抛错；上层会用 initialState 重新种子化。
function readEnvelope<TState>(
  storage: StorageLike,
  storageKey: string,
  schemaVersion: number,
): VersionedLocalRemoteStoreEnvelope<TState> | null {
  const raw = storage.getItem(storageKey);

  if (!raw) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(raw);

    return isEnvelopeForSchema<TState>(parsed, schemaVersion) ? parsed : null;
  } catch {
    return null;
  }
}

// memory adapter 用于 node test、server-side fallback 和不支持 localStorage 的环境。
export function createMemoryStorageAdapter(
  initialEntries: Readonly<Record<string, string>> = {},
): StorageLike {
  const entries = new Map(Object.entries(initialEntries));

  return {
    getItem(key) {
      return entries.get(key) ?? null;
    },
    removeItem(key) {
      entries.delete(key);
    },
    setItem(key, value) {
      entries.set(key, value);
    },
  };
}

// 浏览器 adapter 只在 window/localStorage 存在且接口完整时启用。
// API route 和 server component 不能直接读用户浏览器 localStorage。
export function createBrowserLocalStorageAdapter(): StorageLike | null {
  if (typeof window === "undefined") {
    return null;
  }

  const maybeLocalStorage = window.localStorage;

  if (
    !maybeLocalStorage ||
    typeof maybeLocalStorage.getItem !== "function" ||
    typeof maybeLocalStorage.removeItem !== "function" ||
    typeof maybeLocalStorage.setItem !== "function"
  ) {
    return null;
  }

  return maybeLocalStorage;
}

// 创建一个版本化 store：第一次读取会写入 initialState，之后所有更新都会重新持久化。
export function createVersionedLocalRemoteStore<TState>({
  initialState,
  schemaVersion,
  storage,
  storageKey,
}: VersionedLocalRemoteStoreOptions<TState>): VersionedLocalRemoteStore<TState> {
  // persist 总是先 clone 再写入，防止调用方修改返回对象污染已保存状态。
  function persist(nextState: TState): TState {
    const clonedState = cloneJson(nextState);
    storage.setItem(storageKey, encodeEnvelope(schemaVersion, clonedState));

    return cloneJson(clonedState);
  }

  // readState 会优先读取当前 schema 的持久化数据；没有数据时自动 seed。
  function readState(): TState {
    const envelope = readEnvelope<TState>(storage, storageKey, schemaVersion);

    if (envelope) {
      return cloneJson(envelope.state);
    }

    return persist(initialState);
  }

  return {
    getState() {
      return readState();
    },
    replaceState(nextState) {
      return persist(nextState);
    },
    reset() {
      return persist(initialState);
    },
    schemaVersion,
    storageKey,
    updateState(recipe) {
      // updateState 给调用方一个 draft，但最终仍通过 persist clone 后落盘。
      const draft = readState();
      recipe(draft);

      return persist(draft);
    },
  };
}
