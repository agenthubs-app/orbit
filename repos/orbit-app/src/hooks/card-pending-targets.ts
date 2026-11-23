/** The outbox kinds a confirmation card can change, and the card target collection each is (agent-design AG07). */
const KIND_COLLECTION: Readonly<Record<string, string>> = { note: "notes", task: "tasks" };

export const CARD_PENDING_KINDS = Object.keys(KIND_COLLECTION);

/** `<collection>:<id>` of each record with an edit still only on this device (the card rule's `pendingTargets`). */
export function pendingTargetsOf(mutations: readonly { kind: string; id: string }[]): string[] {
  const out = new Set<string>();
  for (const mutation of mutations) {
    const collection = KIND_COLLECTION[mutation.kind];
    if (collection && mutation.id) out.add(`${collection}:${mutation.id}`);
  }
  return [...out].sort();
}
