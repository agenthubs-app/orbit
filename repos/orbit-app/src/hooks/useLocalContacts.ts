import { useLocalContactsSource, type LocalContactsState } from "./local-contacts-source";

export type { LocalContactsState } from "./local-contacts-source";

/**
 * Sprint 0116, native: the device mirror is always the source for contacts.
 * `probe`: ask the server on open (the page's primary list/detail); chips on
 * other pages only read.
 */
export function useLocalContacts(probe = true): LocalContactsState {
  return useLocalContactsSource(true, probe);
}
