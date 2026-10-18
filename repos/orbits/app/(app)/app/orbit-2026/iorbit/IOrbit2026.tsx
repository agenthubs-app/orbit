"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import type { AiPageContextContract } from "../../../../../shared/contract/ai-sessions";
import type { PlanGoalListItem, PlanIntakeListItem } from "../../../../../shared/contract/plan-v2";
import { planDoneHref, planFlowHref, planNewGoalHref, planOverviewHref, planReviewHref, planTaskSegmentHref } from "../../../../../shared/compute/plan-href";
import { planIntakeListResponseSchema, planV2SummaryResponseSchema } from "../../../../../shared/api-schema/plan-v2";
import type { OrbitAgentHistoryView, OrbitAgentSuggestView } from "../../orbit-agent-route-view-model";
import type { OrbitHomeViewModel } from "../../orbit-home-route-view-model";
import { useOrbitLanguage } from "../../orbit-language-context";
import { ShellPage } from "../shell/slots";
import { Button, Card, Chip, ConfirmDialog, ContextMenu, Drawer, Icon, IconButton, ListRow, Orbit2026Scope, SearchField, Toggle } from "../ui";
import { AgentActionStatusCard } from "../../agent/agent-action-status-card";
import { AgentTaskInteractionCard } from "../../agent/agent-task-interaction-card";
import { CONSOLE_STYLES } from "../../agent/iorbit-0918/console-styles";
import { AgentMessageCopyButton, PanelCards, ThinkingIndicator } from "../../agent/iorbit-0918/iorbit-rich-components";
import { useAgentChat } from "../../agent/iorbit-0918/use-agent-chat";
import { useAgentHistory } from "../../agent/iorbit-0918/use-agent-history";
import { contactPageContextSource, loadContactPageContext } from "./page-context";
import { readIOrbitEntityDraft, type IOrbitEntityDraft } from "./entity-draft";
import styles from "./IOrbit2026.module.css";

const AgentMarkdown = dynamic(() => import("../../agent/agent-markdown"), {
  loading: () => <div aria-hidden className="orbit-agent-markdown" />,
});

type HistoryStore = ReturnType<typeof useAgentHistory>;
const STARTER_SUGGESTIONS: OrbitAgentSuggestView[] = [
  { icon: "💼", label: "今、誰に連絡すべき？", q: "今、誰に連絡すべきか、理由と次の一歩を教えて。" },
  { icon: "🔍", label: "参加する価値があるイベントは？", q: "参加する価値があるイベントを、理由とともに教えて。" },
  { icon: "📇", label: "関係の次の行動を整理して", q: "人脈との関係で次にすべきことを整理して。" },
  { icon: "🧭", label: "新しいプランを考えたい", q: "新しい目標に向けたプランを考えるのを手伝って。" },
];

function tokyoDate(value: string): string | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
}

function historySections(history: HistoryStore): [string, OrbitAgentHistoryView[]][] {
  const dates = new Map(history.storedSessions.map((session) => [session.id, session.updatedAt || session.createdAt]));
  const today = tokyoDate(new Date().toISOString())!;
  const todayDay = Date.parse(`${today}T00:00:00Z`) / 86_400_000;
  const mondayDay = todayDay - ((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7);
  const groups = new Map<string, OrbitAgentHistoryView[]>([
    ["ピン留め", []], ["今日", []], ["今週", []], ["それ以前", []],
  ]);
  for (const item of history.storedHistory) {
    const day = tokyoDate(dates.get(item.sessionId ?? "") ?? "");
    const ordinal = day ? Date.parse(`${day}T00:00:00Z`) / 86_400_000 : -Infinity;
    const section = item.pinned ? "ピン留め" : ordinal === todayDay ? "今日" : ordinal >= mondayDay ? "今週" : "それ以前";
    groups.get(section)!.push(item);
  }
  return [...groups].filter(([, items]) => items.length > 0);
}

function HistoryRow({ item, history, onPick }: { item: OrbitAgentHistoryView; history: HistoryStore; onPick: (item: OrbitAgentHistoryView) => void }) {
  const menuAnchor = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(item.title);
  const id = item.sessionId;
  const copy = () => {
    if (id && typeof window !== "undefined") void navigator.clipboard?.writeText(`${window.location.origin}/app/agent?session=${encodeURIComponent(id)}`);
  };
  return (
    <div className={styles.historyRow}>
      {renaming ? (
        <form className={styles.rename} onSubmit={(event) => { event.preventDefault(); history.renameHistorySession(item, title); setRenaming(false); }}>
          <input autoFocus aria-label="会話の名前" value={title} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") setRenaming(false); }} />
          <Button size="sm" label="保存" type="submit" disabled={!title.trim()} />
        </form>
      ) : (
        <div className={styles.historyEntry}>
          <button className={`btn ${styles.historyEntryMain}`} type="button" onClick={() => onPick(item)}><Icon name={item.pinned ? "pin" : "chat"} size={16} /><span><b>{item.title}</b><small>{item.date}</small></span></button>
          <Button ref={menuAnchor} icon="more" size="sm" label="操作" variant="ghost" onClick={() => setMenuOpen(true)} />
        </div>
      )}
      <ContextMenu open={menuOpen} onClose={() => setMenuOpen(false)} anchor={menuAnchor} label={`${item.title} の操作`} items={[
        { key: "pin", label: item.pinned ? "ピン留めを外す" : "ピン留め", icon: "pin", onSelect: () => history.togglePinnedHistorySession(item) },
        { key: "rename", label: "名前を変更", icon: "edit", onSelect: () => setRenaming(true) },
        { key: "copy", label: "共有用にコピー", icon: "copy", onSelect: copy },
        ...history.sessionGroups.map((group) => ({ key: `group:${group.id}`, label: `${group.name} に移動`, icon: "folder" as const, onSelect: () => history.moveHistorySession(item, group.id) })),
        ...(item.groupId ? [{ key: "ungroup", label: "グループから外す", icon: "folder" as const, onSelect: () => history.moveHistorySession(item, null) }] : []),
        { key: "delete", label: "削除", icon: "trash", destructive: true, onSelect: () => history.deleteHistorySession(item) },
      ]} />
    </div>
  );
}

function HistoryPane({ history, goals, intakes, onNew, onPick }: { history: HistoryStore; goals: readonly PlanGoalListItem[]; intakes: readonly PlanIntakeListItem[]; onNew: () => void; onPick: (item: OrbitAgentHistoryView) => void }) {
  const [search, setSearch] = useState(history.historyQuery);
  useEffect(() => { const timer = window.setTimeout(() => history.setHistoryQuery(search), 250); return () => window.clearTimeout(timer); }, [search, history.setHistoryQuery]);
  const sections = useMemo(() => historySections(history), [history.storedHistory, history.storedSessions]);
  return (
    <div className={styles.history}>
      <Button label="新しい会話" icon="plus" variant="primary" onClick={onNew} block />
      <SearchField label="会話を検索" placeholder="タイトルと本文を検索" value={search} onChange={setSearch} />
      {history.historyPageLoading && !history.storedHistory.length ? <p role="status">会話を読み込み中…</p> : null}
      {history.historyReadError ? <div role="alert" className={styles.error}>会話を読み込めませんでした。<Button label="再試行" variant="ghost" size="sm" onClick={history.retryHistoryRead} /></div> : null}
      {!history.historyPageLoading && !history.historyReadError && !history.storedHistory.length ? <p className={styles.emptyHistory}>{search ? "一致する会話はありません" : "まだ会話はありません"}</p> : null}
      {sections.map(([title, items]) => <section key={title} aria-label={title} className={styles.historySection}>
        <h3>{title}</h3>
        {items.map((item) => <HistoryRow key={item.id} item={item} history={history} onPick={onPick} />)}
      </section>)}
      <section aria-label="プランを作る" className={styles.historySection}>
        <h3>プランを作る</h3>
        {intakes.map((intake) => <ListRow key={intake.intakeId} title={intake.goal} subtitle="作成中のプランを続ける" leading={<Icon name="target" size={16} />} onSelect={() => { window.location.href = planFlowHref("web", intake.intakeId); }} />)}
        {goals.map((goal) => <div key={goal.planId} className={styles.planEntry}>
          <ListRow title={goal.goal} subtitle={goal.status === "achieved" ? "完了した目標" : "進行中の目標"} leading={<Icon name="target" size={16} />} onSelect={() => { window.location.href = planOverviewHref("web", goal.planId); }} />
          <Button label={goal.status === "achieved" ? "完了を見る" : "振り返る"} variant="ghost" size="sm" onClick={() => { window.location.href = goal.status === "achieved" ? planDoneHref("web", goal.planId) : planReviewHref("web", goal.planId); }} />
        </div>)}
        <Button label="新しい目標" icon="plus" variant="ghost" size="sm" onClick={() => { window.location.href = planNewGoalHref("web"); }} />
      </section>
      {history.historyPageHasMore ? <Button label={history.historyPageLoading ? "読み込み中…" : "もっと見る"} variant="ghost" disabled={history.historyPageLoading} onClick={() => void history.loadMoreHistory()} block /> : null}
      {history.historyFeedback ? <p role={history.historyFeedback.kind === "error" ? "alert" : "status"} className={history.historyFeedback.kind === "error" ? styles.error : styles.feedback}>{history.historyFeedback.text}</p> : null}
      {history.pendingUndo ? <div className={styles.undo} role="status"><span>削除しました</span><Button label="元に戻す" size="sm" variant="ghost" onClick={() => void history.undoDeletedHistorySession()} /></div> : null}
    </div>
  );
}

export function IOrbit2026({ home, initialHistoryOpen = false }: {
  home: OrbitHomeViewModel | null;
  initialHistoryOpen?: boolean;
}) {
  const { language, t } = useOrbitLanguage();
  const history = useAgentHistory();
  const chat = useAgentChat({ history: {
    historyMutationQueue: history.historyMutationQueue,
    setHistoryFeedback: history.setHistoryFeedback,
    setSessionGroups: history.setSessionGroups,
    setStoredSessions: history.setStoredSessions,
    storedSessionsRef: history.storedSessionsRef,
  }, suggests: STARTER_SUGGESTIONS });
  history.bindChat({
    activeSessionIdRef: chat.activeSessionIdRef, navigate: chat.navigate, setActiveQ: chat.setActiveQ,
    setActiveSessionId: chat.setActiveSessionId, setChatOpen: chat.setChatOpen, setHistOpen: chat.setHistOpen,
    setMessages: chat.setMessages, setPanel: chat.setPanel, setThinking: chat.setThinking,
  });
  const [historyOpen, setHistoryOpen] = useState(initialHistoryOpen);
  const [narrow, setNarrow] = useState(false);
  const [contextEnabled, setContextEnabled] = useState(false);
  const [pageContext, setPageContext] = useState<AiPageContextContract | null>(null);
  const [contextError, setContextError] = useState<string | null>(null);
  const [intakes, setIntakes] = useState<readonly PlanIntakeListItem[]>([]);
  const [goals, setGoals] = useState<readonly PlanGoalListItem[]>([]);
  const [entityDraft, setEntityDraft] = useState<IOrbitEntityDraft | null>(null);
  const [entityDraftLoaded, setEntityDraftLoaded] = useState(false);
  const [entityDraftError, setEntityDraftError] = useState<string | null>(null);
  const [entityDraftBusy, setEntityDraftBusy] = useState(false);
  const entityDraftBusyRef = useRef(false);
  const [requestedDraftId, setRequestedDraftId] = useState<string | null>(null);
  const [source, setSource] = useState<string[] | null>(null);
  const [prefillOrigin, setPrefillOrigin] = useState<NonNullable<typeof chat.agentPrefill>["origin"]>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const oncePrefill = useRef(false);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setNarrow(media.matches);
    update(); media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    const draftId = new URLSearchParams(window.location.search).get("draftId");
    setRequestedDraftId(draftId && draftId.length <= 160 ? draftId : null);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/agent/plans/v2/summary", { credentials: "same-origin", signal: controller.signal })
      .then((response) => response.ok ? response.json() as Promise<unknown> : null)
      .then((body) => {
        if (controller.signal.aborted || !body || typeof body !== "object" || !("data" in body)) return;
        const parsed = planV2SummaryResponseSchema.safeParse(body.data);
        if (parsed.success) setGoals(parsed.data.goals.filter((goal) => !goal.sample));
      }).catch(() => {});
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const sessionId = chat.activeSessionId;
    setEntityDraft(null);
    setEntityDraftLoaded(false);
    setEntityDraftError(null);
    if (!sessionId || chat.thinking) return;
    const controller = new AbortController();
    void fetch(`/api/ai/entity-drafts?conversationId=${encodeURIComponent(sessionId)}`, { credentials: "same-origin", signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("DRAFT_READ_FAILED");
        return response.json() as Promise<unknown>;
      })
      .then((body) => {
        if (controller.signal.aborted) return;
        if (!body || typeof body !== "object" || !("data" in body)) throw new Error("DRAFT_READ_INVALID");
        const raw = (body.data as { draft?: unknown } | null)?.draft;
        setEntityDraft(readIOrbitEntityDraft(raw));
        setEntityDraftLoaded(true);
      }).catch(() => { if (!controller.signal.aborted) setEntityDraftError("下書きを確認できません。ページを更新してもう一度お試しください。"); });
    return () => controller.abort();
  }, [chat.activeSessionId, chat.thinking]);
  useEffect(() => {
    if (requestedDraftId && entityDraft?.draftId === requestedDraftId) {
      requestAnimationFrame(() => document.getElementById("iorbit-entity-draft")?.scrollIntoView({ block: "center" }));
    }
  }, [entityDraft?.draftId, requestedDraftId]);
  const resolveEntityDraft = async (action: "confirm" | "cancel") => {
    if (!entityDraft || entityDraft.state !== "pending_confirmation" || entityDraftBusyRef.current) return;
    entityDraftBusyRef.current = true;
    setEntityDraftBusy(true);
    setEntityDraftError(null);
    try {
      const response = await fetch(`/api/ai/entity-drafts/${encodeURIComponent(entityDraft.draftId)}`, {
        body: JSON.stringify({ action }), credentials: "same-origin", headers: { "content-type": "application/json" }, method: "POST",
      });
      const body: unknown = await response.json().catch(() => null);
      const next = body && typeof body === "object" && "data" in body ? readIOrbitEntityDraft((body.data as { draft?: unknown } | null)?.draft) : null;
      if (!response.ok || !next || next.draftId !== entityDraft.draftId) throw new Error("DRAFT_ACTION_UNCONFIRMED");
      setEntityDraft(next);
    } catch {
      setEntityDraftError("下書きの操作を確認できません。もう一度お試しください。");
    } finally {
      entityDraftBusyRef.current = false;
      setEntityDraftBusy(false);
    }
  };
  useEffect(() => {
    if (!chat.agentPrefill || oncePrefill.current) return;
    oncePrefill.current = true;
    chat.setChatDraft(chat.agentPrefill.query);
    setPrefillOrigin(chat.agentPrefill.origin);
    setSource(contactPageContextSource(chat.agentPrefill.returnTo));
    inputRef.current?.focus();
  }, [chat.agentPrefill, chat.setChatDraft]);
  useEffect(() => { if (initialHistoryOpen) setHistoryOpen(true); }, [initialHistoryOpen]);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/agent/plans/intakes", { credentials: "same-origin", signal: controller.signal })
      .then((response) => response.ok ? response.json() as Promise<unknown> : null)
      .then((body) => {
        if (controller.signal.aborted || !body || typeof body !== "object" || !("data" in body)) return;
        const parsed = planIntakeListResponseSchema.safeParse(body.data);
        if (parsed.success) setIntakes(parsed.data.intakes);
      }).catch(() => {});
    return () => controller.abort();
  }, []);
  const enableContext = async (enabled: boolean) => {
    setContextEnabled(false);
    setPageContext(null);
    setContextError(null);
    if (!enabled || !source) return;
    try { setPageContext(await loadContactPageContext(source)); setContextEnabled(true); }
    catch { setContextError("このページの人数を確認できません。もう一度お試しください。"); }
  };
  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const query = chat.chatDraft.trim();
    if (!query || chat.thinking || (contextEnabled && !pageContext)) return;
    chat.setChatDraft("");
    chat.setAgentPrefill(null);
    void chat.ask(query, undefined, prefillOrigin ?? undefined, contextEnabled ? pageContext ?? undefined : undefined);
    setPrefillOrigin(null);
    setContextEnabled(false);
    setPageContext(null);
  };
  const sendSuggestion = (query: string) => {
    if (chat.thinking || (contextEnabled && !pageContext)) return;
    chat.setAgentPrefill(null);
    setPrefillOrigin(null);
    void chat.ask(query, undefined, undefined, contextEnabled ? pageContext ?? undefined : undefined);
    setContextEnabled(false);
    setPageContext(null);
  };
  const startNew = () => { chat.setAgentPrefill(null); setPrefillOrigin(null); chat.newChat(); setHistoryOpen(false); setContextEnabled(false); setPageContext(null); setSource(null); setRequestedDraftId(null); };
  const pick = (item: OrbitAgentHistoryView) => { chat.setAgentPrefill(null); setPrefillOrigin(null); chat.pickHistory(item); setHistoryOpen(false); setContextEnabled(false); setPageContext(null); setSource(null); setRequestedDraftId(null); };
  const inConversation = chat.messages.length > 0 || chat.thinking;
  const recent = history.storedHistory.slice(0, 3);
  const suggestions = STARTER_SUGGESTIONS;
  const panelLanguage = language === "zh" ? "zh" : "en";
  return (
    <Orbit2026Scope language={language} className={styles.scope}>
    <div aria-busy={chat.thinking} data-orbit-agent-request-state={chat.thinking ? "pending" : "idle"}>
      <style>{CONSOLE_STYLES}</style>
      <ShellPage title="iOrbit" subtitle={inConversation ? "会話中" : "人脈・イベント・予定を知っている秘書"}
        left={<IconButton icon="menu" label="会話リスト" onClick={() => setHistoryOpen((open) => !open)} />}
        right={<Button label="新しい会話" icon="plus" onClick={startNew} />}
        rightRail={false} phoneFold />
      <div className={styles.layout}>
        {historyOpen && !narrow ? <aside className={styles.sidebar} aria-label="会話リスト"><HistoryPane history={history} goals={goals} intakes={intakes} onNew={startNew} onPick={pick} /></aside> : null}
        <main className={styles.main}>
          <div className={styles.phoneHeader}><IconButton icon="menu" label="会話リスト" onClick={() => setHistoryOpen(true)} /><strong>iOrbit</strong><IconButton icon="plus" label="新しい会話" onClick={startNew} /></div>
          {!inConversation ? <section className={styles.start} aria-label="新しい会話">
            <div className={styles.star} aria-hidden><Icon name="sparkle" size={24} /></div>
            <h1><span>{home?.account.fullName ? `${home.account.fullName.split(/\s+/u)[0]}さん、` : "こんにちは、"}</span><br />何をお手伝いしましょう？</h1>
            <p>人脈やイベント、プランのこと。iOrbit に聞いてください。</p>
            <div className={styles.suggestions}>
              {suggestions.map((suggestion, index) => <button key={`${suggestion.q}-${index}`} type="button" className={`btn ${styles.suggestion}`} onClick={() => sendSuggestion(suggestion.q)}>
                <span className={styles.suggestionIcon} aria-hidden>{suggestion.icon}</span><span>{suggestion.label}</span><Icon name="right" size={16} />
              </button>)}
            </div>
            {recent.length ? <Card><div className={styles.recentHead}><b>最近の会話</b><Button label="すべて" variant="ghost" size="sm" onClick={() => setHistoryOpen(true)} /></div>
              {recent.map((item) => <ListRow key={item.id} title={item.title} subtitle={item.date} leading={<Icon name="chat" size={16} />} onSelect={() => pick(item)} />)}
            </Card> : null}
            <div className={styles.capabilities}><Chip label={`人脈 ${home?.stats.people ?? 0}`} /><Chip label={`イベント ${home?.stats.events ?? 0}`} /><Chip label="プラン" /></div>
          </section> : <section className={styles.thread} aria-label="会話" data-orbit-iorbit-thread>
            {chat.earlier.hasMore || chat.earlier.status === "error" ? <Button label={chat.earlier.status === "error" ? "もう一度読み込む" : "以前のメッセージを読み込む"} variant="ghost" onClick={() => void chat.loadEarlier()} disabled={chat.earlier.status === "loading"} /> : null}
            {chat.messages.map((message, index) => message.role === "user" ?
              <div className={styles.userRow} key={message.id ?? `u${index}`} data-orbit-iorbit-message><span className={styles.userBubble}>{message.text}{message.supplement ? <small>{message.supplement}</small> : null}</span><AgentMessageCopyButton text={message.text} /></div> :
              <div className={styles.assistantRow} key={message.id ?? `a${index}`} data-orbit-iorbit-message><span className={styles.assistantIcon} aria-hidden><Icon name="sparkle" size={16} /></span><div className={styles.answer}>
                <b>iOrbit</b>{message.note ? <p>{message.note}</p> : null}<AgentMarkdown text={message.text} />
                {message.taskInteraction ? <AgentTaskInteractionCard interaction={message.taskInteraction} language={panelLanguage} {...chat.taskSuggestions.forInteraction(message.taskInteraction)} /> : null}
                {message.items.length ? <PanelCards language={panelLanguage} navigate={chat.navigate} panel={{ items: message.items, kind: message.kind, panelTitle: message.panelTitle }} t={t} /> : null}
                {message.runId && message.actionIds?.length ? <AgentActionStatusCard actionIds={message.actionIds} language={panelLanguage} navigate={chat.navigate} runId={message.runId} showRunDetails={false} /> : null}
                {message.evidenceRefs?.length ? <p className={styles.sources}>参照: {message.evidenceRefs.map((ref) => ref.label).join(" · ")}</p> : null}
                {message.retryRequest ? <Button label={message.stopped ? "再開" : "もう一度"} variant="secondary" disabled={chat.thinking} onClick={() => void chat.ask(message.retryRequest!, index)} /> : null}
                <AgentMessageCopyButton text={message.text} />
              </div></div>)}
            {entityDraft && (!requestedDraftId || requestedDraftId === entityDraft.draftId) ? <Card><div id="iorbit-entity-draft" className={styles.entityDraft}>
              <b>確認待ちの{entityDraft.kind === "task" ? "タスク" : entityDraft.kind === "note" ? "メモ" : entityDraft.kind === "schedule" ? "予定" : "イベント"}</b>
              {Object.entries(entityDraft.fields).slice(0, 4).map(([key, value]) => <p key={key}><small>{key}</small><span>{value}</span></p>)}
              {entityDraft.state === "pending_confirmation" ? <div className={styles.entityDraftActions}><Button label="作成を確認" variant="primary" disabled={entityDraftBusy} onClick={() => void resolveEntityDraft("confirm")} /><Button label="キャンセル" variant="ghost" disabled={entityDraftBusy} onClick={() => void resolveEntityDraft("cancel")} /></div> : <p role="status">{entityDraft.state === "created" ? "作成しました" : entityDraft.state === "cancelled" ? "キャンセルしました" : "この下書きは更新されました"}</p>}
            </div></Card> : null}
            {requestedDraftId && entityDraftLoaded && entityDraft?.draftId !== requestedDraftId ? <p role="status" className={styles.error}>この会話に確認待ちの下書きはありません。</p> : null}
            {entityDraftError ? <p role="alert" className={styles.error}>{entityDraftError}</p> : null}
            {chat.thinking ? <div role="status" className={styles.assistantRow}><span className={styles.assistantIcon}><Icon name="sparkle" size={16} /></span><div><ThinkingIndicator t={t} /><Button label="停止" variant="ghost" size="sm" onClick={chat.stopResponse} /></div></div> : null}
            <div className={styles.followups}><Button label="プランを見る" variant="ghost" onClick={() => { window.location.href = planTaskSegmentHref("web"); }} /></div>
          </section>}
          {source ? <div className={styles.contextCard}><div><b>このページを文脈に含める</b><p>{contextEnabled && pageContext ? `${pageContext.route} · ${source.length ? `業界 ${source.join("、")} · ` : ""}${pageContext.count}人` : "オフ · 人脈ページの情報は送信しません"}</p></div><Toggle checked={contextEnabled} onChange={(next) => void enableContext(next)} label="このページを文脈に含める" /></div> : null}
          {contextError ? <p className={styles.error} role="alert">{contextError}</p> : null}
          <form className={styles.composer} onSubmit={submit} data-orbit-agent-chat-composer>
            <textarea ref={inputRef} rows={2} aria-label="iOrbit に聞く" placeholder="iOrbit に聞く…" value={chat.chatDraft} onChange={(event) => chat.setChatDraft(event.target.value)} disabled={chat.thinking} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); submit(); } }} />
            <IconButton icon="send" label="送信" type="submit" disabled={chat.thinking || !chat.chatDraft.trim()} data-orbit-agent-submit="true" />
          </form>
          <p className={styles.privacy}>送信はあなたが行います。回答の根拠は結果で確認できます。</p>
        </main>
      </div>
      <Drawer open={historyOpen && narrow} onClose={() => setHistoryOpen(false)} title="会話リスト" size="lg" fullOnPhone><HistoryPane history={history} goals={goals} intakes={intakes} onNew={startNew} onPick={pick} /></Drawer>
      <ConfirmDialog open={Boolean(history.pendingDeleteHistory)} title="この会話を削除しますか？" message="会話内で追加したタスクや予定は削除されません。" confirmLabel="削除" cancelLabel="キャンセル" destructive icon="trash" onConfirm={() => void history.confirmDeleteHistorySession()} onCancel={() => history.setPendingDeleteHistory(null)} />
      {history.historyDeleteError ? <p className={styles.error} role="alert">{history.historyDeleteError}</p> : null}
    </div>
    </Orbit2026Scope>
  );
}
