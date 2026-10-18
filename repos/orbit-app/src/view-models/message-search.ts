import type { RelationshipConversationView } from './relationship-inbox';

/** Search only the conversations already authorized by the inbox read. */
export function filterMessageConversations<T extends Pick<RelationshipConversationView, 'name' | 'organization' | 'subject' | 'preview'>>(
  rows: readonly T[], query: string,
): T[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [...rows];
  return rows.filter(row => [row.name, row.organization, row.subject, row.preview]
    .filter(Boolean).join(' ').toLocaleLowerCase().includes(needle));
}
