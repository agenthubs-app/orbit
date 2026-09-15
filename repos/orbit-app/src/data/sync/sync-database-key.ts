export interface SyncSessionScope {
  baseUrl: string;
  actorId: string;
  workspaceId?: string;
}

export interface SyncKeyDependencies {
  crypto: Pick<typeof import("expo-crypto"), "CryptoDigestAlgorithm" | "digestStringAsync" | "getRandomBytesAsync">;
  secureStore: Pick<typeof import("expo-secure-store"), "AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY" | "getItemAsync" | "setItemAsync" | "deleteItemAsync">;
}

export async function syncScopeDigest(scope: SyncSessionScope, native: SyncKeyDependencies): Promise<string> {
  if (!scope.baseUrl.trim() || !scope.actorId.trim()) {
    throw new Error("SYNC_SCOPE_INVALID");
  }
  return native.crypto.digestStringAsync(
    native.crypto.CryptoDigestAlgorithm.SHA256,
    JSON.stringify([scope.baseUrl, scope.actorId]),
  );
}

function keyOptions(native: SyncKeyDependencies) {
  return { keychainAccessible: native.secureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };
}

export async function loadSyncDatabaseKey(
  digest: string,
  native: SyncKeyDependencies,
  discardOrphan: () => Promise<void>,
): Promise<string> {
  const name = `orbit.sync.key.${digest}`;
  const stored = await native.secureStore.getItemAsync(name, keyOptions(native));
  if (stored !== null) {
    if (!/^[a-f0-9]{64}$/u.test(stored)) throw new Error("SYNC_KEY_INVALID");
    return stored;
  }
  // A restored encrypted file without its device key is never opened or migrated.
  await discardOrphan();
  const bytes = await native.crypto.getRandomBytesAsync(32);
  if (bytes.length !== 32) throw new Error("SYNC_KEY_INVALID");
  const key = Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
  await native.secureStore.setItemAsync(name, key, keyOptions(native));
  return key;
}

export async function deleteSyncDatabaseKey(digest: string, native: SyncKeyDependencies): Promise<void> {
  await native.secureStore.deleteItemAsync(`orbit.sync.key.${digest}`, keyOptions(native));
}
