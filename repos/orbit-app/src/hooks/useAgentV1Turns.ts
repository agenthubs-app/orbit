import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import { decideAgentCard, readAgentV1Document, recheckAgentCard, regenerateAgentCard, selectAgentOption } from "../api/agent-v1-client";
import type { OrbitApiClient } from "../api/client";
import type { AgentActionPreviewContract, AgentResultDocument } from "../api/contract/agent-v1";

/**
 * agent-design AG07 (设计稿 §7): the protocol-3 turns of one conversation on the App, from their result documents.
 * The App has no live channel: a turn still queued or running is read again shortly; every turn is read again when
 * the App comes to the foreground (a decision made on the web shows here then). Reading fails → offline: a waiting
 * card then shows only the count, nothing can be pressed, and no press is kept for later (设计稿 §7: never queued).
 * The documents last read online stay in memory for this conversation (never a card's items in the device copy).
 */
const POLL_MS = 1_500;
const RETRY_OFFLINE_MS = 5_000;
const remembered = new Map<string, Map<string, AgentResultDocument>>();

export interface AgentV1TurnsState {
  documents: ReadonlyMap<string, AgentResultDocument>;
  cards: ReadonlyMap<string, AgentActionPreviewContract>;
  online: boolean;
  decide(card: AgentActionPreviewContract, decision: "confirm" | "reject" | "retry" | "mark_done" | "abandon", operationId?: string): Promise<boolean>;
  regenerate(card: AgentActionPreviewContract): Promise<boolean>;
  select(requestId: string, clarificationId: string, optionId: string): Promise<boolean>;
  refresh(): void;
}

export function useAgentV1Turns(input: { client: OrbitApiClient; sessionId: string | null; requestIds: readonly string[]; enabled: boolean; pendingTargets: readonly string[]; syncedAt: string | null }): AgentV1TurnsState {
  const { client, sessionId, enabled } = input;
  const [documents, setDocuments] = useState<Map<string, AgentResultDocument>>(() => new Map(sessionId ? remembered.get(sessionId) ?? [] : []));
  const [cards, setCards] = useState<Map<string, AgentActionPreviewContract>>(() => new Map());
  const [online, setOnline] = useState(true);
  const ids = useRef<readonly string[]>(input.requestIds);
  ids.current = input.requestIds;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; if (timer.current) clearTimeout(timer.current); }, []);

  const noteCard = useCallback((card: AgentActionPreviewContract | null) => {
    if (card) setCards((current) => new Map(current).set(card.actionId, card));
  }, []);

  const readAll = useCallback(async () => {
    if (!enabled || !sessionId || !ids.current.length) return;
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    let offline = false;
    let active = false;
    const next = new Map(remembered.get(sessionId) ?? []);
    for (const requestId of ids.current) {
      const read = await readAgentV1Document(client, sessionId, requestId);
      if (read.kind === "offline") { offline = true; continue; }
      if (read.kind === "ok") {
        next.set(requestId, read.value);
        if (read.value.status === "queued" || read.value.status === "running") active = true;
      } else active = true; // Not stored yet (just sent): read again shortly.
    }
    if (!alive.current) return;
    remembered.set(sessionId, next);
    setDocuments(next);
    setOnline(!offline);
    if (offline) setCards(new Map()); // Offline the App shows what it read last, never a card it holds from a click.
    if (active || offline) timer.current = setTimeout(() => { void readAll(); }, offline ? RETRY_OFFLINE_MS : POLL_MS);
  }, [client, enabled, sessionId]);

  const key = input.requestIds.join(",");
  useEffect(() => { void readAll(); }, [key, readAll]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => { if (state === "active") void readAll(); });
    return () => subscription.remove();
  }, [readAll]);

  // 设计稿 §7: once this device's edits reached the server, the waiting cards are looked at again (a new revision when
  // a value the card showed changed); nothing is pressed for the user.
  const lastSync = useRef(input.syncedAt);
  const pendingKey = input.pendingTargets.join(",");
  useEffect(() => {
    if (!enabled || !online || input.syncedAt === lastSync.current) return;
    lastSync.current = input.syncedAt;
    const waiting = [...documents.values()].map((document) => cards.get(document.actionPreview?.actionId ?? "") ?? document.actionPreview).filter((card): card is AgentActionPreviewContract => Boolean(card && (card.status === "awaiting_confirmation" || card.status === "deferred")));
    for (const card of waiting) {
      const targets = card.operations.flatMap((op) => (op.target ? [`${op.target.collection}:${op.target.id}`] : []));
      if (targets.some((target) => input.pendingTargets.includes(target))) continue;
      void recheckAgentCard(client, card).then((result) => { if (alive.current) noteCard(result.card); });
    }
  }, [input.syncedAt, pendingKey, online, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  const decide = useCallback(async (card: AgentActionPreviewContract, decision: Parameters<AgentV1TurnsState["decide"]>[1], operationId?: string) => {
    if (!online) return false;
    const result = await decideAgentCard(client, card, decision, operationId);
    if (alive.current) noteCard(result.card);
    void readAll();
    return result.ok;
  }, [client, noteCard, online, readAll]);
  const regenerate = useCallback(async (card: AgentActionPreviewContract) => {
    if (!online) return false;
    const result = await regenerateAgentCard(client, card);
    if (alive.current) noteCard(result.card);
    return result.ok;
  }, [client, noteCard, online]);
  const select = useCallback(async (requestId: string, clarificationId: string, optionId: string) => {
    if (!online || !sessionId) return false;
    const ok = await selectAgentOption(client, { clarificationId, optionId, requestId, sessionId });
    void readAll();
    return ok;
  }, [client, online, readAll, sessionId]);
  return { cards, decide, documents, online, refresh: () => { void readAll(); }, regenerate, select };
}

/** The newer of the document's card and one this App holds from its own click or re-check. */
export function latestAgentCard(fromDocument: AgentActionPreviewContract | undefined, fromClick: AgentActionPreviewContract | undefined): AgentActionPreviewContract | null {
  if (!fromDocument) return fromClick ?? null;
  if (!fromClick) return fromDocument;
  if (fromClick.revision !== fromDocument.revision) return fromClick.revision > fromDocument.revision ? fromClick : fromDocument;
  return fromClick.updatedAt > fromDocument.updatedAt ? fromClick : fromDocument;
}
