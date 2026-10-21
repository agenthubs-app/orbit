import type { InboxNotificationDTO, InboxNotificationListDTO } from '../../../shared/contract/inbox-notifications';
import { secretaryKind } from '../../../shared/compute/secretary-source';
import { createConfiguredInboxRuntime, isTypedInboxEnabled } from '../inbox-record-service-factory';

export type SecretaryPage = Pick<InboxNotificationListDTO, 'items' | 'nextCursor'>;

/** LF4: pages a preview may read at most (was 100 × 50 rows on every Home view). */
export const SECRETARY_PREVIEW_PAGE_BUDGET = 10;

/**
 * True once the newest-first rows already decide buildSecretaryPreview's answer: four distinct events (three shown
 * plus hasMore), each already represented by a row an older row cannot replace (an event_pick, deadline or prep —
 * only a daily recommendation can still be displaced by an older event_pick for the same event).
 */
export function secretaryPreviewDecided(items: readonly InboxNotificationDTO[]): boolean {
  const settled = new Map<string, boolean>();
  for (const item of items) {
    const kind = secretaryKind(item);
    if (!kind || item.target.status !== 'available' || item.target.kind !== 'event' || !item.target.id) continue;
    settled.set(item.target.id, (settled.get(item.target.id) ?? false) || kind !== 'daily_recommendation');
  }
  if (settled.size < 4) return false;
  return [...settled.values()].slice(0, 4).every(Boolean);
}

/** Read permission-projected inbox pages, newest first, until the preview is decided (or the page budget ends). */
export async function readConfiguredSecretaryPages(actorId: string, workspaceId?: string): Promise<SecretaryPage[] | null> {
  if (!isTypedInboxEnabled(actorId)) return [];
  const runtime = createConfiguredInboxRuntime();
  if (!runtime || (workspaceId && runtime.workspaceId !== workspaceId)) return null;
  const pages: SecretaryPage[] = [];
  const seen = new Set<string>();
  const items: InboxNotificationDTO[] = [];
  let cursor: string | null = null;
  for (let pageNumber = 0; pageNumber < SECRETARY_PREVIEW_PAGE_BUDGET; pageNumber += 1) {
    const page = await runtime.service.list(actorId, { language: 'ja', limit: 50, ...(cursor ? { cursor } : {}) });
    pages.push({ items: page.items, nextCursor: page.nextCursor });
    items.push(...page.items);
    if (!page.nextCursor || secretaryPreviewDecided(items)) return pages;
    if (seen.has(page.nextCursor)) throw new Error('Secretary preview cursor repeated');
    seen.add(page.nextCursor);
    cursor = page.nextCursor;
  }
  // Budget spent: the newest 500 rows are the preview (an older secretary row is past its usefulness for Home).
  return pages;
}
