import { useLocalInboxSource, type LocalInboxState } from "./local-inbox-source";

export type { LocalInboxState } from "./local-inbox-source";

/** Sprint 0118, native: the device mirror is always the source for the typed inbox. `probe`: ask the server on open. */
export function useLocalInbox(probe = true): LocalInboxState {
  return useLocalInboxSource(true, probe);
}
