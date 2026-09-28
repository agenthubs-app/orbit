import { useCallback, useEffect, useMemo, useState } from "react";

import type { AiSessionSummaryItemContract } from "../api/contract/ai-session-page";
import { mirrorFreshness, type MirrorFreshness } from "../data/sync/mirror-freshness";
import { aiSessionMessages, aiSessionRows, type LocalAiMessage } from "../view-models/ai-sessions-local";
import { useMirrorProbe } from "./useMirrorProbe";
import { useSyncedCollection } from "./useSyncedCollection";

/**
 * Sprint 0118 (AI B3): the AI session list from the device mirror (sync
 * domain "ai-sessions"), shared by the native and browser hooks.
 */
export interface LocalAiSessionsState {
  available: boolean;
  rows: readonly AiSessionSummaryItemContract[];
  freshness: MirrorFreshness;
  refresh(): Promise<unknown>;
}

export function useLocalAiSessionsSource(available: boolean, probe: boolean): LocalAiSessionsState {
  const state = useSyncedCollection<Record<string, unknown>>({ kind: "ai_session" });
  const refresh = state.refresh;
  useMirrorProbe(refresh, available && probe);
  const freshness = mirrorFreshness(state, available);
  const rows = useMemo(() => (available ? aiSessionRows(state.records) : []), [available, state.records]);
  return useMemo(() => ({ available, rows, freshness, refresh }),
    [available, rows, freshness.readable, freshness.offline, freshness.loading, freshness.failure, freshness.lastSyncedAt, freshness.refreshing, refresh]);
}

/**
 * One AI session's messages from the device mirror (sync domain
 * "ai-session-messages"). Opening marks the session as opened on this device,
 * so from the next sync on its messages are kept here (the most recently opened
 * 20 sessions; see AI_OPENED_SESSION_LIMIT). The cards of the last online page
 * read are kept with it for offline display.
 */
export interface LocalAiConversationState {
  available: boolean;
  messages: readonly LocalAiMessage[];
  freshness: MirrorFreshness;
  /** The cached cards of the last online read, once loaded; null when none are kept. */
  cards: unknown | null;
  saveCards(cards: unknown): void;
  refresh(): Promise<unknown>;
}

export function useLocalAiConversationSource(available: boolean, sessionId: string | null): LocalAiConversationState {
  const state = useSyncedCollection<Record<string, unknown>>({ kind: "ai_session_message" });
  const { refresh, currentSession } = state;
  const freshness = mirrorFreshness(state, available);
  const [cards, setCards] = useState<{ sessionId: string; cards: unknown | null } | null>(null);
  const opened = available && sessionId && freshness.readable ? sessionId : null;
  useEffect(() => {
    const session = currentSession();
    if (!opened || !session) return;
    let active = true;
    void (async () => {
      const receipt = await session.openAiSession(opened);
      const kept = await session.readAiSessionCards(opened);
      if (!active) return;
      setCards({ sessionId: opened, cards: kept });
      // A newly opened session is fetched by a sync that names it: finish any sync already running, then start one.
      if (receipt?.added) { await refresh(); if (active) void refresh(); }
    })();
    return () => { active = false; };
  }, [opened, currentSession, refresh]);
  const messages = useMemo(() => (available && sessionId ? aiSessionMessages(state.records, sessionId) : []), [available, sessionId, state.records]);
  const saveCards = useCallback((value: unknown) => {
    const session = currentSession();
    if (!session || !sessionId || !available) return;
    void session.saveAiSessionCards(sessionId, value);
    setCards({ sessionId, cards: value });
  }, [available, currentSession, sessionId]);
  return useMemo(() => ({
    available, messages, freshness, cards: cards && cards.sessionId === sessionId ? cards.cards : null, saveCards, refresh,
  }), [available, messages, freshness.readable, freshness.offline, freshness.loading, freshness.failure, freshness.lastSyncedAt, freshness.refreshing, cards, sessionId, saveCards, refresh]);
}
