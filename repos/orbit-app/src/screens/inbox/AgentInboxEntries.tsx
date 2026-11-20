/**
 * agent-design AG15 (approved visual draft 15-5, 15-6; D15-4, D15-6) on the App: the three kinds of inbox entry Orbit's
 * own agent writes — a scheduled task's result, a card waiting for a click, a change another tool proposes (AG17 writes
 * those; only their row here). Cards still waiting form their own group on top; no new filter. A result opens with the
 * picked records as AG19's record cards and 「管理这条任务」; a card opens as the conversation's card, confirmed here.
 */
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";

import { readAgentCard } from "../../api/agent-v1-client";
import type { OrbitApiClient } from "../../api/client";
import type { AgentActionPreviewContract } from "../../api/contract/agent-v1";
import type { InboxNotificationDTO } from "../../api/contract/inbox-notifications";
import { MacTile, UiPressable, UiText } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";

export type AgentEntryKind = "result" | "card" | "proposal";
export const WAITING = new Set(["awaiting_confirmation", "deferred"]);

export function agentEntryKind(n: Pick<InboxNotificationDTO, "sources">): AgentEntryKind | null {
  const kind = n.sources[0]?.sourceKind;
  return kind === "automation_result" ? "result" : kind === "agent_card" ? "card" : kind === "external_proposal" ? "proposal" : null;
}

export function agentEntryTile(n: InboxNotificationDTO): { emoji: string; tone: "pink" | "apricot" | "blue" | "lav" } {
  const kind = agentEntryKind(n);
  if (kind === "proposal") return { emoji: "🤖", tone: "lav" };
  if (kind === "card") return { emoji: "🗓️", tone: "blue" };
  if (/^(需要你处理|対応が必要です|Needs you)/u.test(n.title)) return { emoji: "⚠️", tone: "apricot" };
  if (/联系|連絡|contact/iu.test(n.title)) return { emoji: "🤝", tone: "apricot" };
  return { emoji: "🎟️", tone: "pink" };
}

/** The cards behind the open card entries: which still wait (the top group). Null until all have answered. */
export function useAgentCardStates(client: OrbitApiClient, items: readonly InboxNotificationDTO[] | null | undefined, readAt?: string | null): ReadonlyMap<string, AgentActionPreviewContract | null> | null {
  const ids = useMemo(() => (items ?? []).filter((n) => { const kind = agentEntryKind(n); return (kind === "card" || kind === "proposal") && n.disposition === "open"; }).map((n) => n.target.id).sort().join("\n"), [items]);
  const loaded = Boolean(items);
  const [states, setStates] = useState<{ key: string; map: ReadonlyMap<string, AgentActionPreviewContract | null> } | null>(null);
  useEffect(() => {
    if (!loaded) return;
    const list = ids ? ids.split("\n") : [];
    if (!list.length) { setStates({ key: ids, map: new Map() }); return; }
    let alive = true;
    void Promise.all(list.map(async (id) => [id, await readAgentCard(client, id)] as const)).then((found) => {
      if (!alive) return;
      const map = new Map<string, AgentActionPreviewContract | null>();
      for (const [id, read] of found) if (read.kind !== "offline") map.set(id, read.kind === "ok" ? read.value : null);
      setStates({ key: ids, map });
    });
    return () => { alive = false; };
  // Read again when the card entries change or the caller says so (`readAt`) — never on every render (the list array is
  // rebuilt on each render, so it is not a dependency).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, ids, readAt, loaded]);
  if (!items) return null;
  return states?.key === ids ? states.map : states?.map ?? null;
}

export function waitsForClick(n: InboxNotificationDTO, cards: ReadonlyMap<string, AgentActionPreviewContract | null>): boolean {
  const kind = agentEntryKind(n);
  if ((kind !== "card" && kind !== "proposal") || n.disposition !== "open") return false;
  const card = cards.get(n.target.id);
  return card === undefined ? true : card !== null && WAITING.has(card.status);
}

/** One agent row of the list (15-5): tile, title, a small tag and the task's name; the time and the unread dot. */
export function AgentInboxRow({ n, waiting, time, onOpen }: { n: InboxNotificationDTO; waiting: boolean; time: string; onOpen(): void }) {
  const { t } = useOrbitLocale();
  const { styles } = useAgentEntryStyles();
  const tile = agentEntryTile(n);
  const kind = agentEntryKind(n);
  const hours = n.expiresAt ? Math.max(0, Math.round((Date.parse(n.expiresAt) - Date.now()) / 3_600_000)) : null;
  const rest = kind === "proposal" ? [n.object?.name ? t("scheduledTasks.proposedBy", { name: n.object.name }) : n.sources[0]?.excerpt, hours !== null ? t("scheduledTasks.hoursLeft", { n: hours }) : null].filter(Boolean).join(" · ") : n.object?.name ?? "";
  const tag = waiting ? t("scheduledTasks.tagWaiting") : t("scheduledTasks.tagTask");
  return <UiPressable accessibilityRole="button" accessibilityLabel={[n.title, tag, rest].filter(Boolean).join("、")} onPress={onOpen} style={styles.row} testID={`agent-entry-${n.id}`}>
    <MacTile emoji={tile.emoji} tone={tile.tone} size="sm" />
    <View style={styles.main}>
      <UiText style={styles.title} numberOfLines={2}>{n.title}</UiText>
      <View style={styles.subline}><UiText style={[styles.tag, waiting ? styles.tagWait : styles.tagTask]}>{tag}</UiText><UiText style={styles.sub} numberOfLines={1}>{rest}</UiText></View>
    </View>
    <View style={styles.end}><UiText style={styles.time}>{time}</UiText>{!n.readAt && n.disposition === "open" ? <View accessibilityLabel={t("typedInbox.unreadState")} style={styles.dot} /> : null}</View>
  </UiPressable>;
}

export const useAgentEntryStyles = createThemedStyles((colors) => StyleSheet.create({
  row: { alignItems: "flex-start", flexDirection: "row", gap: 12, minHeight: 56, paddingVertical: 10 },
  main: { flex: 1, gap: 3 },
  title: { color: colors.ink, fontSize: 16, fontWeight: "600", lineHeight: 22 },
  subline: { alignItems: "center", flexDirection: "row", gap: 6 },
  tag: { borderRadius: 6, fontSize: 12, fontWeight: "700", overflow: "hidden", paddingHorizontal: 6, paddingVertical: 1 },
  tagTask: { backgroundColor: colors.macBlue, color: colors.macBlueText },
  tagWait: { backgroundColor: colors.macLav, color: colors.macLavText },
  sub: { color: colors.ink3Text, flexShrink: 1, fontSize: 13, lineHeight: 19 },
  end: { alignItems: "flex-end", gap: 6 },
  time: { color: colors.ink3Text, fontSize: 13 },
  dot: { backgroundColor: colors.accentText, borderRadius: 3, height: 6, width: 6 },
  detail: { gap: 14 },
  head: { alignItems: "flex-start", flexDirection: "row", gap: 12 },
  detailTitle: { color: colors.ink, fontSize: 22, fontWeight: "700", lineHeight: 30 },
  basis: { alignSelf: "flex-start", borderColor: colors.line, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, color: colors.ink2, fontSize: 14, overflow: "hidden", paddingHorizontal: 12, paddingVertical: 6 },
  body: { color: colors.ink, fontSize: 17, lineHeight: 26 },
  actions: { flexDirection: "row" },
}));
