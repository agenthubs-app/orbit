/**
 * agent-design AG15 (approved visual draft 15-5 ④, 15-6) on the App: the detail of an entry Orbit's own agent wrote —
 * a result with the picked records as AG19's record cards and 「管理这条任务」, or a card confirmed right here.
 */
import { useRouter, type Href } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";

import { decideAgentCard, readAgentCard, regenerateAgentCard } from "../../api/agent-v1-client";
import type { AgentActionPreviewContract, AgentScheduledTaskHistoryContract } from "../../api/contract/agent-v1";
import type { InboxNotificationDTO } from "../../api/contract/inbox-notifications";
import { Button, MacTile, UiText } from "../../components/ui";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { AgentAnswerBlocks } from "../ai/cards/AgentAnswerBlocks";
import { AgentConfirmationCard } from "../ai/cards/AgentConfirmationCard";
import { readScheduledTask } from "../me/scheduled-tasks-api";
import { taskPath } from "../me/ScheduledTasksScreens";
import { agentEntryKind, agentEntryTile, useAgentEntryStyles, WAITING } from "./AgentInboxEntries";

/** The detail of an agent entry (15-5 ④, 15-6), under the entry's own header. */
export function AgentEntryDetail({ n }: { n: InboxNotificationDTO }) {
  const { t, language } = useOrbitLocale();
  const { styles } = useAgentEntryStyles();
  const kind = agentEntryKind(n)!;
  const tile = agentEntryTile(n);
  const at = new Date(n.occurredAt);
  const sameDay = at.toDateString() === new Date().toDateString();
  const when = `${sameDay ? `${t("scheduledTasks.today")} ` : `${at.getMonth() + 1}/${at.getDate()} `}${at.toLocaleTimeString(language, { hour: "2-digit", minute: "2-digit" })}`;
  const subtitle = kind === "proposal"
    ? [n.object?.name ? t("scheduledTasks.proposedBy", { name: n.object.name }) : null, when].filter(Boolean).join(" · ")
    : [n.object?.name ? t("scheduledTasks.taskName", { name: n.object.name }) : null, kind === "card" ? t("scheduledTasks.period", { when }) : when].filter(Boolean).join(" · ");
  return <View style={styles.detail} testID={`agent-entry-detail-${kind}`}>
    <View style={styles.head}><MacTile emoji={tile.emoji} tone={tile.tone} size="sm" /><View style={styles.main}><UiText accessibilityRole="header" style={styles.detailTitle}>{n.title}</UiText><UiText style={styles.sub}>{subtitle}</UiText></View></View>
    {kind === "result" ? <AgentResult n={n} /> : <AgentCard n={n} />}
  </View>;
}

function AgentResult({ n }: { n: InboxNotificationDTO }) {
  const { t, language } = useOrbitLocale();
  const client = useOrbitApiClient();
  const router = useRouter();
  const { styles } = useAgentEntryStyles();
  const [history, setHistory] = useState<AgentScheduledTaskHistoryContract | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    void readScheduledTask(client, n.target.id, language).then((read) => { if (alive) setHistory(read.kind === "ok" ? read.value : null); });
    return () => { alive = false; };
  }, [client, n.target.id, language]);
  if (history === undefined) return <UiText style={styles.sub}>{t("common.loading")}</UiText>;
  const run = history?.runs.find((item) => item.runId === n.sources[0]?.sourceId) ?? null;
  const cards = (run?.items ?? []).flatMap((item) => (item.card ? [item.card] : []));
  return <View style={styles.detail}>
    {run?.detail?.basis && cards.length ? <UiText style={styles.basis}>{run.detail.basis}</UiText> : null}
    {cards.length && run?.detail?.source ? <AgentAnswerBlocks blocks={[{ caption: run.detail.source.caption, items: [run.detail.source.card], shown: 1, size: "mini", type: "records" }]} gone={new Set()} language={language} onOpenHref={(href) => router.push(href as Href)} /> : null}
    {cards.length ? <AgentAnswerBlocks blocks={[{ items: cards, shown: cards.length, size: "full", type: "records" }]} gone={new Set()} language={language} onOpenHref={(href) => router.push(href as Href)} /> : <UiText style={styles.body}>{run?.display?.text ?? n.reason}</UiText>}
    {run?.detail?.notes.map((note) => <UiText key={note} style={styles.sub}>{note}</UiText>)}
    {history ? <View style={styles.actions}><Button label={t("scheduledTasks.manage")} onPress={() => router.push(taskPath(n.target.id) as Href)} /></View> : <UiText style={styles.sub}>{t("scheduledTasks.notFound")}</UiText>}
  </View>;
}

function AgentCard({ n }: { n: InboxNotificationDTO }) {
  const { t, language } = useOrbitLocale();
  const client = useOrbitApiClient();
  const router = useRouter();
  const { styles } = useAgentEntryStyles();
  const [card, setCard] = useState<AgentActionPreviewContract | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    void readAgentCard(client, n.target.id).then((read) => { if (alive) setCard(read.kind === "ok" ? read.value : null); });
    return () => { alive = false; };
  }, [client, n.target.id]);
  if (card === undefined) return <UiText style={styles.sub}>{t("common.loading")}</UiText>;
  if (card === null) return <UiText style={styles.body}>{t("scheduledTasks.cardGone")}</UiText>;
  return <View style={styles.detail}>
    <AgentConfirmationCard card={card} language={language} online pendingTargets={[]}
      onDecide={async (decision, operationId) => { const result = await decideAgentCard(client, card, decision, operationId); if (result.card) setCard(result.card); return result.ok; }}
      onRegenerate={async () => { const result = await regenerateAgentCard(client, card); if (result.card) setCard(result.card); return result.ok; }}
      onOpenCard={(actionId) => router.push(`/inbox?tab=notifications&open=${encodeURIComponent(actionId)}` as Href)} />
    {WAITING.has(card.status) ? <UiText style={styles.sub}>{t("scheduledTasks.hereNote")}</UiText> : null}
  </View>;
}

