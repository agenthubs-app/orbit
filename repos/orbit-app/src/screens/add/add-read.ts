// R12 人脈を追加: pure readers for the answers the add screens use loosely — the draft
// queue rows, the confirmed draft's contact and the batch's event candidates. Anything
// unreadable is left out rather than failing the page. No IO.
// ── contact drafts (§2.9) ──

export interface ContactDraftRow {
  id: string;
  displayName: string;
  organization: string;
  role: string;
  sourceLabel: string;
  createdAt: string;
}

export const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
export const record = (value: unknown): Record<string, unknown> => (typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {});

/** The draft queue rows still waiting for a decision; anything unreadable is left out. */
export function pendingDraftRows(data: unknown): ContactDraftRow[] {
  const drafts = record(data).drafts;
  if (!Array.isArray(drafts)) return [];
  return drafts.flatMap((entry) => {
    const draft = record(entry);
    const id = text(draft.id);
    const confirmation = record(draft.confirmation);
    if (!id || text(draft.status) === "confirmed" || text(confirmation.state) === "confirmed") return [];
    const source = record(draft.source);
    return [{
      id,
      displayName: text(draft.displayName),
      organization: text(draft.organization),
      role: text(draft.role),
      sourceLabel: text(source.label),
      createdAt: text(draft.createdAt),
    }];
  });
}

/** POST /api/contact-drafts/[id]/confirm answers the confirmed draft; a written contact carries its id. */
export function confirmedDraftContactId(data: unknown): string | null {
  const payload = record(data);
  const candidate = record(payload.contactCandidate);
  const draft = record(payload.confirmedDraft);
  return text(candidate.contactId) || text(draft.contactId) || null;
}

// ── v2 card batch (§2.2) ──

export interface AttributionEvent { eventId: string; title: string; startsAt: string }
export interface BatchAttribution { events: AttributionEvent[]; cards: Record<string, string | null> }
export const EMPTY_ATTRIBUTION: BatchAttribution = { cards: {}, events: [] };

export function readAttribution(data: unknown): BatchAttribution {
  const payload = record(data);
  const events = Array.isArray(payload.events)
    ? payload.events.flatMap((entry) => {
      const event = record(entry);
      const eventId = text(event.eventId);
      return eventId ? [{ eventId, startsAt: text(event.startsAt), title: text(event.title) }] : [];
    })
    : [];
  const cards: Record<string, string | null> = {};
  for (const [cardId, eventId] of Object.entries(record(payload.cards))) cards[cardId] = typeof eventId === "string" && eventId.trim() ? eventId : null;
  return { cards, events };
}

