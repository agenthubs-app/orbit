import { useLocalInboxSource, type LocalInboxState } from "./local-inbox-source";
import { useWebMirrorStatus } from "./useWebMirrorStatus";

export type { LocalInboxState } from "./local-inbox-source";

/**
 * Browser build (sprint 0118): the inbox is on the browser mirror whitelist
 * (threat model §2), so the mirror is the source whenever it is active. Without
 * it the inbox keeps its network reads.
 */
export function useLocalInbox(probe = true): LocalInboxState {
  return useLocalInboxSource(useWebMirrorStatus().mode === "local-mirror", probe);
}
