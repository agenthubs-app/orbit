type AiSendIntent = { id: string; actorId: string; baseUrl: string; message: string };

// A navigation URL alone never authorizes generation. Keep only the latest click
// and its consumed state in memory; restarting the app drops the record.
let latest: (AiSendIntent & { consumed: boolean }) | null = null;

export function registerAiSendIntent(intent: AiSendIntent): void {
  latest = Object.values(intent).every(value => value.trim()) ? { ...intent, consumed: false } : null;
}

export function consumeAiSendIntent(intent: AiSendIntent): boolean {
  if (!latest || latest.id !== intent.id || latest.consumed) return false;
  const clicked = latest;
  clicked.consumed = true;
  return clicked.actorId === intent.actorId && clicked.baseUrl === intent.baseUrl && clicked.message === intent.message;
}

export function aiSendIntentOrigin(id: string): { actorId: string; baseUrl: string } | null {
  return latest?.id === id ? { actorId: latest.actorId, baseUrl: latest.baseUrl } : null;
}
