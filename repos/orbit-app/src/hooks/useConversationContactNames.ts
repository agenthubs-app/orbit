import { useMemo } from "react";

import type { ConversationContactName } from "../view-models/relationship-pages";
import { useLocalContacts } from "./useLocalContacts";

/**
 * QA-C3: my own name for the person a relationship conversation is about. The server keeps the
 * account names from when the conversation started (e.g. "qa1026a"); where the conversation is
 * about one of my contacts, the inbox shows the name I know them by.
 */
export function useConversationContactNames(): ConversationContactName {
  const contacts = useLocalContacts(false);
  return useMemo(() => {
    const names = new Map<string, string>();
    for (const row of contacts.rows) {
      const name = row.card?.displayName?.trim();
      if (!name) continue;
      names.set(row.id, name);
      if (row.card?.id) names.set(row.card.id, name);
    }
    return (contactId: string) => names.get(contactId);
  }, [contacts.rows]);
}
