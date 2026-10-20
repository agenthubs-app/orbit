const PERSONAL_KEYS = [
  "orbit.onboarding.v1:",
  "orbit.cardBatch.ledger.v1:",
  "orbit.cardBatches.active.v1",
  "orbit-agent-chat-active-session-v1",
  "orbit.search.recent",
  "orbit:inbox:tab:",
];

function matches(key: string): boolean { return PERSONAL_KEYS.some(prefix => key.startsWith(prefix)); }

export function hasUnsyncedWebDrafts(): boolean {
  try { return Object.keys(window.localStorage).some(key => key.startsWith("orbit.onboarding.v1:") || key.startsWith("orbit.cardBatch.ledger.v1:")); }
  catch { return false; }
}

function deleteDatabase(name: string): Promise<boolean> {
  if (typeof indexedDB === "undefined") return Promise.resolve(true);
  return new Promise(resolve => {
    try {
      const operation = indexedDB.deleteDatabase(name);
      operation.onsuccess = () => resolve(true);
      operation.onerror = operation.onblocked = () => resolve(false);
    } catch { resolve(false); }
  });
}

/** Local personal drafts are removed when deletion is accepted and again on
 * pending page entry, so a navigation interruption cannot leave them behind. */
export async function clearWebAccountRightsData(): Promise<boolean> {
  let storageCleared = true;
  try {
    const storage = window.localStorage;
    for (const key of Object.keys(storage)) if (matches(key)) storage.removeItem(key);
  } catch { storageCleared = false; }
  const databases = await Promise.all([deleteDatabase("orbit-card-batch"), deleteDatabase("orbit-host-kiosk")]);
  return storageCleared && databases.every(Boolean);
}
