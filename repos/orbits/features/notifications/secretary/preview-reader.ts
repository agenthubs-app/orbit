import type { InboxNotificationListDTO } from '../../../shared/contract/inbox-notifications';
import { createConfiguredInboxRuntime, isTypedInboxEnabled } from '../inbox-record-service-factory';

export type SecretaryPage = Pick<InboxNotificationListDTO, 'items' | 'nextCursor'>;

/** Read permission-projected inbox pages. Never filter just the first ordinary page. */
export async function readConfiguredSecretaryPages(actorId: string, workspaceId?: string): Promise<SecretaryPage[] | null> {
  if (!isTypedInboxEnabled(actorId)) return [];
  const runtime = createConfiguredInboxRuntime();
  if (!runtime || (workspaceId && runtime.workspaceId !== workspaceId)) return null;
  const pages: SecretaryPage[] = [];
  const seen = new Set<string>();
  let cursor: string | null = null;
  for (let pageNumber = 0; pageNumber < 100; pageNumber += 1) {
    const page = await runtime.service.list(actorId, { language: 'ja', limit: 50, ...(cursor ? { cursor } : {}) });
    pages.push({ items: page.items, nextCursor: page.nextCursor });
    if (!page.nextCursor) return pages;
    if (seen.has(page.nextCursor)) throw new Error('Secretary preview cursor repeated');
    seen.add(page.nextCursor);
    cursor = page.nextCursor;
  }
  throw new Error('Secretary preview page budget exceeded');
}
