import { deleteWebKeyStoreText, readWebKeyStoreText, writeWebKeyStoreText } from "../data/sync/web-mirror-key";
import { browserMirrorEnvironment, probeWebMirror } from "../data/sync/web-mirror-storage";
import { createOfflineIdentityStorage } from "./offline-identity";

// Browser: the record sits next to the mirror keys in IndexedDB and only exists where
// the local mirror itself can exist (secure context + OPFS + IndexedDB + Web Crypto).
// Elsewhere offline cold start stays off and the browser keeps its online-only login.
// Same-origin script can read it, as the 0077 threat model states for the mirror.
function available(): IDBFactory | null {
  const environment = browserMirrorEnvironment();
  return probeWebMirror(environment).available ? environment.indexedDB ?? null : null;
}

export const offlineIdentityStorage = createOfflineIdentityStorage({
  async delete(key) {
    const indexedDB = available();
    if (indexedDB) await deleteWebKeyStoreText(key, { indexedDB });
  },
  async get(key) {
    const indexedDB = available();
    return indexedDB ? readWebKeyStoreText(key, { indexedDB }) : null;
  },
  async set(key, value) {
    const indexedDB = available();
    if (indexedDB) await writeWebKeyStoreText(key, value, { indexedDB });
  }
});
