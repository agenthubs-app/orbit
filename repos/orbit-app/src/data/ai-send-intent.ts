import type { AiSessionOriginInputContract } from "../api/contract/ai-sessions";
import { aiSessionOriginInputSchema } from "../api/schema/ai-sessions";

type AiSendIntentIdentity = { id: string; actorId: string; baseUrl: string; message: string };
type AiSendIntent = AiSendIntentIdentity & { origin: AiSessionOriginInputContract };

// A navigation URL alone never authorizes generation. Keep only the latest click
// and its consumed state in memory; restarting the app drops the record.
let latest: (AiSendIntent & { consumed: boolean }) | null = null;

export function registerAiSendIntent(intent: AiSendIntent): void {
  const validIdentity = [intent.id, intent.actorId, intent.baseUrl, intent.message]
    .every(value => value.trim());
  const origin = aiSessionOriginInputSchema.safeParse(intent.origin);
  latest = validIdentity && origin.success
    ? { ...intent, origin: origin.data, consumed: false }
    : null;
}

export function consumeAiSendIntent(intent: AiSendIntentIdentity): boolean {
  if (!latest || latest.id !== intent.id || latest.consumed) return false;
  const clicked = latest;
  clicked.consumed = true;
  return clicked.actorId === intent.actorId && clicked.baseUrl === intent.baseUrl && clicked.message === intent.message;
}

export function aiSendIntentOrigin(id: string): {
  actorId: string;
  baseUrl: string;
  origin: AiSessionOriginInputContract;
} | null {
  return latest?.id === id
    ? { actorId: latest.actorId, baseUrl: latest.baseUrl, origin: latest.origin }
    : null;
}
