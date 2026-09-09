/** Serialize full snapshots within this mounted page, without blocking other sessions. */
export function createAgentChatSessionMutationQueue() {
  const tails = new Map<string, Promise<boolean>>();
  const removing = new Set<string>();

  function enqueue(id: string, mutation: () => Promise<boolean>): Promise<boolean> {
    const next = (tails.get(id) ?? Promise.resolve(true))
      .then(mutation)
      .catch(() => false);
    tails.set(id, next);
    void next.then(() => { if (tails.get(id) === next) tails.delete(id); });
    return next;
  }

  return {
    save(id: string, mutation: () => Promise<boolean>): Promise<boolean> {
      // A delayed task/AI result must not recreate an intentionally removed chat.
      if (removing.has(id)) return Promise.resolve(false);
      return enqueue(id, mutation);
    },
    remove(id: string, mutation: () => Promise<boolean>): Promise<boolean> {
      if (removing.has(id)) return Promise.resolve(false);
      removing.add(id);
      return enqueue(id, mutation).then((removed) => {
        if (!removed) removing.delete(id);
        return removed;
      });
    },
  };
}
