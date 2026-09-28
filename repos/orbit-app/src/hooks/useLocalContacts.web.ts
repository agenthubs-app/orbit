import { useLocalContactsSource, type LocalContactsState } from "./local-contacts-source";
import { useWebMirrorStatus } from "./useWebMirrorStatus";

export type { LocalContactsState } from "./local-contacts-source";

/**
 * Browser build (sprint 0116): contacts are on the browser mirror whitelist
 * (threat model §2), so the mirror is the source whenever it is active. Without
 * it (non-secure context, missing OPFS/IndexedDB/Web Crypto, open failure) the
 * screens keep their network reads.
 */
export function useLocalContacts(probe = true): LocalContactsState {
  return useLocalContactsSource(useWebMirrorStatus().mode === "local-mirror", probe);
}
