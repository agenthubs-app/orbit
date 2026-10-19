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
import { iorbitCopy } from "../../orbit-2026/copy/iorbit";
import { standardCopyFor } from "../../orbit-2026/copy/standard";
import { ShellPage } from "../../orbit-2026/shell/slots";
import { Button, Card, ConfirmDialog, ContextMenu, Drawer, Icon, IconButton, ListRow, Orbit2026Scope, SearchField, Toggle } from "../../orbit-2026/ui";
import { AgentActionStatusCard } from "../agent-action-status-card";
import { AgentTaskInteractionCard } from "../agent-task-interaction-card";
import { AgentMessageCopyButton, PanelCards, ThinkingIndicator } from "../iorbit-0918/iorbit-rich-components";
import { useAgentChat } from "../iorbit-0918/use-agent-chat";
import { useAgentHistory } from "../iorbit-0918/use-agent-history";
import { contactPageContextSource, createContactPageContextLoader } from "../../orbit-2026/iorbit/page-context";
import { readIOrbitEntityDraft, type IOrbitEntityDraft } from "../../orbit-2026/iorbit/entity-draft";
import styles from "./IOrbit2026.module.css";

const AgentMarkdown = dynamic(() => import("../agent-markdown"), {
  loading: () => <div aria-hidden className="orbit-agent-markdown" />,
});

type HistoryStore = ReturnType<typeof useAgentHistory>;
function fill(copy: string, values: Record<string, string | number>): string {
  return copy.replace(/\{(\w+)\}/gu, (_, key: string) => String(values[key] ?? ""));
}

function tokyoDate(value: string): string | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
}

function historySections(history: HistoryStore): ["pinned" | "today" | "week" | "older", OrbitAgentHistoryView[]][] {
  const dates = new Map(history.storedSessions.map((session) => [session.id, session.updatedAt || session.createdAt]));
  const today = tokyoDate(new Date().toISOString())!;
  const todayDay = Date.parse(`${today}T00:00:00Z`) / 86_400_000;
  const mondayDay = todayDay - ((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7);
  const groups = new Map<"pinned" | "today" | "week" | "older", OrbitAgentHistoryView[]>([
    ["pinned", []], ["today", []], ["week", []], ["older", []],
  ]);
  for (const item of history.storedHistory) {
    const day = tokyoDate(dates.get(item.sessionId ?? "") ?? "");
    const ordinal = day ? Date.parse(`${day}T00:00:00Z`) / 86_400_000 : -Infinity;
    const section = item.pinned ? "pinned" : ordinal === todayDay ? "today" : ordinal >= mondayDay ? "week" : "older";
    groups.get(section)!.push(item);
  }
  return [...groups].filter(([, items]) => items.length > 0);
}

function HistoryRow({ item, history, onPick }: { item: OrbitAgentHistoryView; history: HistoryStore; onPick: (item: OrbitAgentHistoryView) => void }) {
  const { t } = useOrbitLanguage();
  const menuAnchor = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(item.title);
  const id = item.sessionId;
  const copy = () => {
    if (id && typeof window !== "undefined") void navigator.clipboard?.writeText(`${window.location.origin}/app/agent?session=${encodeURIComponent(id)}`);
  };
  return (
    <div className={styles.historyRow} data-orbit-iorbit-history-row>
      {renaming ? (
        <form className={styles.rename} onSubmit={(event) => { event.preventDefault(); history.renameHistorySession(item, title); setRenaming(false); }}>
          <input autoFocus aria-label={t(iorbitCopy.name)} value={title} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") setRenaming(false); }} />
          <Button size="sm" label={t(iorbitCopy.save)} type="submit" disabled={!title.trim()} />
        </form>
      ) : (
        <div className={styles.historyEntry}>
          <button className={`btn ${styles.historyEntryMain}`} type="button" onClick={() => onPick(item)}><Icon name={item.pinned ? "pin" : "chat"} size={16} /><span><b>{item.title}</b><small>{item.date}</small></span></button>
          <Button ref={menuAnchor} icon="more" size="sm" label={t(iorbitCopy.actions)} variant="ghost" onClick={() => setMenuOpen(true)} />
        </div>
      )}
      <ContextMenu open={menuOpen} onClose={() => setMenuOpen(false)} anchor={menuAnchor} label={fill(t(iorbitCopy.actionsFor), { title: item.title })} items={[
        { key: "pin", label: t(item.pinned ? iorbitCopy.unpin : iorbitCopy.pinned), icon: "pin", onSelect: () => history.togglePinnedHistorySession(item) },
        { key: "rename", label: t(iorbitCopy.rename), icon: "edit", onSelect: () => setRenaming(true) },
        { key: "copy", label: t(iorbitCopy.copyLink), icon: "copy", onSelect: copy },
        ...history.sessionGroups.map((group) => ({ key: `group:${group.id}`, label: fill(t(iorbitCopy.moveGroup), { group: group.name }), icon: "folder" as const, onSelect: () => history.moveHistorySession(item, group.id) })),
        ...(item.groupId ? [{ key: "ungroup", label: t(iorbitCopy.removeGroup), icon: "folder" as const, onSelect: () => history.moveHistorySession(item, null) }] : []),
        { key: "delete", label: t(iorbitCopy.delete), icon: "trash", destructive: true, onSelect: () => history.deleteHistorySession(item) },
      ]} />
    </div>
  );
}

function HistoryPane({ history, goals, intakes, onNew, onPick }: { history: HistoryStore; goals: readonly PlanGoalListItem[]; intakes: readonly PlanIntakeListItem[]; onNew: () => void; onPick: (item: OrbitAgentHistoryView) => void }) {
  const { t } = useOrbitLanguage();
  const [search, setSearch] = useState(history.historyQuery);
  useEffect(() => { const timer = window.setTimeout(() => history.setHistoryQuery(search), 250); return () => window.clearTimeout(timer); }, [search, history.setHistoryQuery]);
  const sections = useMemo(() => historySections(history), [history.storedHistory, history.storedSessions]);
  return (
    <div className={styles.history}>
      <Button label={t(iorbitCopy.newChat)} icon="plus" variant="primary" onClick={onNew} block />
      <SearchField label={t(iorbitCopy.searchLabel)} placeholder={t(iorbitCopy.searchPlaceholder)} value={search} onChange={setSearch} />
      {history.historyPageLoading && !history.storedHistory.length ? <p role="status">{t(iorbitCopy.loading)}</p> : null}
      {history.historyReadError ? <div role="alert" className={styles.error}>{t(iorbitCopy.readFailed)}<Button label={t(iorbitCopy.retry)} variant="ghost" size="sm" onClick={history.retryHistoryRead} /></div> : null}
      {!history.historyPageLoading && !history.historyReadError && !history.storedHistory.length ? <p className={styles.emptyHistory}>{t(search ? iorbitCopy.noMatch : iorbitCopy.empty)}</p> : null}
      {sections.map(([section, items]) => <section key={section} aria-label={t(iorbitCopy[section])} className={styles.historySection}>
        <h3>{t(iorbitCopy[section])}</h3>
        {items.map((item) => <HistoryRow key={item.id} item={item} history={history} onPick={onPick} />)}
      </section>)}
      <section aria-label={t(iorbitCopy.plans)} className={styles.historySection}>
        <h3>{t(iorbitCopy.plans)}</h3>
        {intakes.map((intake) => <ListRow key={intake.intakeId} title={intake.goal} subtitle={t(iorbitCopy.continuePlan)} leading={<Icon name="target" size={16} />} onSelect={() => { window.location.href = planFlowHref("web", intake.intakeId); }} />)}
        {goals.map((goal) => <div key={goal.planId} className={styles.planEntry}>
          <ListRow title={goal.goal} subtitle={t(goal.status === "achieved" ? iorbitCopy.achieved : iorbitCopy.inProgress)} leading={<Icon name="target" size={16} />} onSelect={() => { window.location.href = planOverviewHref("web", goal.planId); }} />
          <Button label={t(goal.status === "achieved" ? iorbitCopy.viewDone : iorbitCopy.review)} variant="ghost" size="sm" onClick={() => { window.location.href = goal.status === "achieved" ? planDoneHref("web", goal.planId) : planReviewHref("web", goal.planId); }} />
        </div>)}
        <Button label={t(iorbitCopy.newGoal)} icon="plus" variant="ghost" size="sm" onClick={() => { window.location.href = planNewGoalHref("web"); }} />
      </section>
      {history.historyPageHasMore ? <Button label={t(history.historyPageLoading ? iorbitCopy.loadingMore : iorbitCopy.more)} variant="ghost" disabled={history.historyPageLoading} onClick={() => void history.loadMoreHistory()} block /> : null}
      {history.historyFeedback ? <p role={history.historyFeedback.kind === "error" ? "alert" : "status"} className={history.historyFeedback.kind === "error" ? styles.error : styles.feedback}>{history.historyFeedback.text}</p> : null}
      {history.pendingUndo ? <div className={styles.undo} role="status"><span>{t(iorbitCopy.deleted)}</span><Button label={t(iorbitCopy.undo)} size="sm" variant="ghost" onClick={() => void history.undoDeletedHistorySession()} /></div> : null}
    </div>
  );
}

export function IOrbit2026({ home, initialHistoryOpen = false }: {
  home: OrbitHomeViewModel | null;
  initialHistoryOpen?: boolean;
}) {
  const { language, t } = useOrbitLanguage();
  const suggestions = useMemo<OrbitAgentSuggestView[]>(() => [
    { icon: "💼", label: t(iorbitCopy.suggestionPeople), q: t(iorbitCopy.suggestionPeopleQuery) },
    { icon: "🔍", label: t(iorbitCopy.suggestionEvents), q: t(iorbitCopy.suggestionEventsQuery) },
    { icon: "📇", label: t(iorbitCopy.suggestionRelations), q: t(iorbitCopy.suggestionRelationsQuery) },
    { icon: "🧭", label: t(iorbitCopy.suggestionPlan), q: t(iorbitCopy.suggestionPlanQuery) },
  ], [language]);
  const history = useAgentHistory();
  const chat = useAgentChat({ history: {
    historyMutationQueue: history.historyMutationQueue,
    setHistoryFeedback: history.setHistoryFeedback,
    setSessionGroups: history.setSessionGroups,
    setStoredSessions: history.setStoredSessions,
    storedSessionsRef: history.storedSessionsRef,
  }, suggests: suggestions });
  history.bindChat({
    activeSessionIdRef: chat.activeSessionIdRef, navigate: chat.navigate, setActiveQ: chat.setActiveQ,
    setActiveSessionId: chat.setActiveSessionId, setChatOpen: chat.setChatOpen, setHistOpen: chat.setHistOpen,
    setMessages: chat.setMessages, setPanel: chat.setPanel, setThinking: chat.setThinking,
  });
  const [historyOpen, setHistoryOpen] = useState(initialHistoryOpen);
  const historyOpenChosen = useRef(initialHistoryOpen);
  const [narrow, setNarrow] = useState(false);
  const [contextEnabled, setContextEnabled] = useState(false);
  const [pageContext, setPageContext] = useState<AiPageContextContract | null>(null);
  const [contextError, setContextError] = useState<string | null>(null);
  const contextLoaderRef = useRef<ReturnType<typeof createContactPageContextLoader> | null>(null);
  contextLoaderRef.current ??= createContactPageContextLoader();
  const contextLoader = contextLoaderRef.current;
  useEffect(() => () => contextLoader.clear(), [contextLoader]);
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
    const media = window.matchMedia("(max-width: 1199px)");
    const update = () => setNarrow(media.matches);
    update(); media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (historyOpenChosen.current || history.storedHistory.length === 0) return;
    if (window.matchMedia("(min-width: 1200px)").matches) {
      historyOpenChosen.current = true;
      setHistoryOpen(true);
    }
  }, [history.storedHistory.length]);
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
      }).catch(() => { if (!controller.signal.aborted) setEntityDraftError(t(iorbitCopy.draftReadFailed)); });
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
      setEntityDraftError(t(iorbitCopy.draftActionFailed));
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
  const resetContext = () => {
    contextLoader.clear();
    setContextEnabled(false);
    setPageContext(null);
    setContextError(null);
  };
  const enableContext = async (enabled: boolean) => {
    resetContext();
    if (!enabled || !source) return;
    try {
      const context = await contextLoader.resolve(source);
      if (!context) return;
      setPageContext(context);
      setContextEnabled(true);
    }
    catch { setContextError(t(iorbitCopy.contextFailed)); }
  };
  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const query = chat.chatDraft.trim();
    if (!query || chat.thinking || (contextEnabled && !pageContext)) return;
    chat.setChatDraft("");
    chat.setAgentPrefill(null);
    void chat.ask(query, undefined, prefillOrigin ?? undefined, contextEnabled ? pageContext ?? undefined : undefined);
    setPrefillOrigin(null);
    resetContext();
  };
  const sendSuggestion = (query: string) => {
    if (chat.thinking || (contextEnabled && !pageContext)) return;
    chat.setAgentPrefill(null);
    setPrefillOrigin(null);
    void chat.ask(query, undefined, undefined, contextEnabled ? pageContext ?? undefined : undefined);
    resetContext();
  };
  const startNew = () => { chat.setAgentPrefill(null); setPrefillOrigin(null); chat.newChat(); setHistoryOpen(false); resetContext(); setSource(null); setRequestedDraftId(null); };
  const pick = (item: OrbitAgentHistoryView) => { chat.setAgentPrefill(null); setPrefillOrigin(null); chat.pickHistory(item); setHistoryOpen(false); resetContext(); setSource(null); setRequestedDraftId(null); };
  const inConversation = chat.messages.length > 0 || chat.thinking;
  const activeTitle = history.storedHistory.find((item) => item.sessionId === chat.activeSessionId)?.title;
  const recent = history.storedHistory.slice(0, 3);
  const panelLanguage = language === "zh" ? "zh" : "en";
  return (
    <Orbit2026Scope language={language} className={`${styles.scope} ${inConversation ? styles.conversationScope : ""}`}>
    <div aria-busy={chat.thinking} data-orbit-agent-request-state={chat.thinking ? "pending" : "idle"}>
      <ShellPage title="iOrbit" subtitle={inConversation ? activeTitle || t(iorbitCopy.inConversation) : t(iorbitCopy.subtitle)}
        left={<IconButton icon="menu" label={t(iorbitCopy.list)} onClick={() => { historyOpenChosen.current = true; setHistoryOpen((open) => !open); }} />}
        right={<Button label={t(iorbitCopy.newChat)} icon="plus" onClick={startNew} />}
        rightRail={false} phoneFold phoneBare={inConversation} />
      <div className={styles.layout}>
        {historyOpen && !narrow ? <aside className={styles.sidebar} aria-label={t(iorbitCopy.list)}><HistoryPane history={history} goals={goals} intakes={intakes} onNew={startNew} onPick={pick} /></aside> : null}
        <main className={styles.main}>
          <div className={styles.phoneHeader}><IconButton icon="menu" label={t(iorbitCopy.list)} onClick={() => setHistoryOpen(true)} /><div className={styles.phoneHeaderTitle}><strong>iOrbit</strong>{inConversation && activeTitle ? <small>{activeTitle}</small> : null}</div><IconButton icon={inConversation ? "x" : "plus"} label={inConversation ? standardCopyFor(language).action.close : t(iorbitCopy.newChat)} onClick={startNew} /></div>
          {!inConversation ? <section className={styles.start} aria-label={t(iorbitCopy.newChat)}>
            <div className={styles.star} aria-hidden><Icon name="sparkle" size={24} /></div>
            <h1><span>{home?.account.fullName ? fill(t(iorbitCopy.greetingName), { name: home.account.fullName.split(/\s+/u)[0] }) : t(iorbitCopy.greeting)}</span><br />{t(iorbitCopy.heading)}</h1>
            <p>{t(iorbitCopy.intro)}</p>
            <div className={styles.suggestions}>
              {suggestions.map((suggestion, index) => <button key={`${suggestion.q}-${index}`} type="button" className={`btn ${styles.suggestion}`} onClick={() => sendSuggestion(suggestion.q)}>
                <span className={styles.suggestionIcon} aria-hidden>{suggestion.icon}</span><span>{suggestion.label}</span><Icon name="right" size={16} />
              </button>)}
            </div>
            {recent.length && (!historyOpen || narrow) ? <Card><div className={styles.recentHead}><b>{t(iorbitCopy.recent)}</b><Button label={t(iorbitCopy.all)} variant="ghost" size="sm" onClick={() => setHistoryOpen(true)} /></div>
              {recent.map((item) => <ListRow key={item.id} title={item.title} subtitle={item.date} leading={<Icon name="chat" size={16} />} onSelect={() => pick(item)} />)}
            </Card> : null}
            <Card className={styles.capabilities}><div className={styles.capabilityTitle}>{t(iorbitCopy.capabilitiesTitle)}</div><div className={styles.capabilityGrid}>
              {([
                ["home", iorbitCopy.homeCapability, iorbitCopy.homeCapabilityDetail],
                ["users", iorbitCopy.peopleCapability, iorbitCopy.peopleCapabilityDetail],
                ["calendar", iorbitCopy.eventsCapability, iorbitCopy.eventsCapabilityDetail],
                ["target", iorbitCopy.plan, iorbitCopy.planCapabilityDetail],
              ] as const).map(([icon, label, detail]) => <div className={styles.capability} key={icon}><Icon name={icon} size={16} /><b>{t(label)}</b><span>{t(detail)}</span></div>)}
            </div></Card>
          </section> : <section className={styles.thread} aria-label={t(iorbitCopy.conversation)} data-orbit-iorbit-thread>
            {chat.earlier.hasMore || chat.earlier.status === "error" ? <Button label={t(chat.earlier.status === "error" ? iorbitCopy.earlierRetry : iorbitCopy.earlier)} variant="ghost" onClick={() => void chat.loadEarlier()} disabled={chat.earlier.status === "loading"} /> : null}
            {chat.messages.map((message, index) => message.role === "user" ?
              <div className={styles.userRow} key={message.id ?? `u${index}`} data-orbit-iorbit-message><span className={styles.userBubble}>{message.text}{message.supplement ? <small>{message.supplement}</small> : null}</span><AgentMessageCopyButton text={message.text} /></div> :
              <div className={styles.assistantRow} key={message.id ?? `a${index}`} data-orbit-iorbit-message><span className={styles.assistantIcon} aria-hidden><Icon name="sparkle" size={16} /></span><div className={styles.answer}>
                <b>iOrbit</b>{message.note ? <p>{message.note}</p> : null}<AgentMarkdown text={message.text} />
                {message.taskInteraction ? <AgentTaskInteractionCard interaction={message.taskInteraction} language={panelLanguage} {...chat.taskSuggestions.forInteraction(message.taskInteraction)} /> : null}
                {message.items.length ? <PanelCards language={panelLanguage} navigate={chat.navigate} panel={{ items: message.items, kind: message.kind, panelTitle: message.panelTitle }} t={t} /> : null}
                {message.runId && message.actionIds?.length ? <AgentActionStatusCard actionIds={message.actionIds} language={panelLanguage} navigate={chat.navigate} runId={message.runId} showRunDetails={false} /> : null}
                {message.evidenceRefs?.length ? <p className={styles.sources}>{t(iorbitCopy.sources)}{message.evidenceRefs.map((ref) => ref.label).join(" · ")}</p> : null}
                {message.retryRequest ? <Button label={t(message.stopped ? iorbitCopy.resume : iorbitCopy.tryAgain)} variant="secondary" disabled={chat.thinking} onClick={() => void chat.ask(message.retryRequest!, index)} /> : null}
                <AgentMessageCopyButton text={message.text} />
              </div></div>)}
            {entityDraft && (!requestedDraftId || requestedDraftId === entityDraft.draftId) ? <Card><div id="iorbit-entity-draft" className={styles.entityDraft}>
              <b>{fill(t(iorbitCopy.draftHeading), { kind: t(iorbitCopy[entityDraft.kind]) })}</b>
              {Object.entries(entityDraft.fields).slice(0, 4).map(([key, value]) => <p key={key}><small>{key}</small><span>{value}</span></p>)}
              {entityDraft.state === "pending_confirmation" ? <div className={styles.entityDraftActions}><Button label={t(iorbitCopy.confirmCreate)} variant="primary" disabled={entityDraftBusy} onClick={() => void resolveEntityDraft("confirm")} /><Button label={t(iorbitCopy.cancel)} variant="ghost" disabled={entityDraftBusy} onClick={() => void resolveEntityDraft("cancel")} /></div> : <p role="status">{t(entityDraft.state === "created" ? iorbitCopy.created : entityDraft.state === "cancelled" ? iorbitCopy.cancelled : iorbitCopy.draftChanged)}</p>}
            </div></Card> : null}
            {requestedDraftId && entityDraftLoaded && entityDraft?.draftId !== requestedDraftId ? <p role="status" className={styles.error}>{t(iorbitCopy.draftMissing)}</p> : null}
            {entityDraftError ? <p role="alert" className={styles.error}>{entityDraftError}</p> : null}
            {chat.thinking ? <div role="status" className={styles.assistantRow}><span className={styles.assistantIcon}><Icon name="sparkle" size={16} /></span><div><ThinkingIndicator t={t} /><Button label={t(iorbitCopy.stop)} variant="ghost" size="sm" onClick={chat.stopResponse} /></div></div> : null}
            <div className={styles.followups}><Button label={t(iorbitCopy.viewPlans)} variant="ghost" onClick={() => { window.location.href = planTaskSegmentHref("web"); }} /></div>
          </section>}
          {source ? <div className={styles.contextCard}><div><b>{t(iorbitCopy.pageContext)}</b><p>{contextEnabled && pageContext ? `${pageContext.route} · ${source.length ? fill(t(iorbitCopy.industry), { value: source.join(", ") }) : ""}${fill(t(iorbitCopy.peopleUnit), { n: pageContext.count })}` : t(iorbitCopy.contextOff)}</p></div><Toggle checked={contextEnabled} onChange={(next) => void enableContext(next)} label={t(iorbitCopy.pageContext)} /></div> : null}
          {contextError ? <p className={styles.error} role="alert">{contextError}</p> : null}
          <form className={styles.composer} onSubmit={submit} data-orbit-agent-chat-composer>
            <textarea ref={inputRef} rows={2} aria-label={t(iorbitCopy.ask)} placeholder={t(iorbitCopy.askPlaceholder)} value={chat.chatDraft} onChange={(event) => chat.setChatDraft(event.target.value)} disabled={chat.thinking} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); submit(); } }} />
            <IconButton icon="send" label={t(iorbitCopy.send)} type="submit" disabled={chat.thinking || !chat.chatDraft.trim()} data-orbit-agent-submit="true" />
          </form>
          <p className={styles.privacy}>{t(iorbitCopy.privacy)}</p>
        </main>
      </div>
      <Drawer open={historyOpen && narrow} onClose={() => setHistoryOpen(false)} title={t(iorbitCopy.list)} size="sm" fullOnPhone><HistoryPane history={history} goals={goals} intakes={intakes} onNew={startNew} onPick={pick} /></Drawer>
      <ConfirmDialog open={Boolean(history.pendingDeleteHistory)} title={t(iorbitCopy.deleteTitle)} message={t(iorbitCopy.deleteMessage)} confirmLabel={t(iorbitCopy.delete)} cancelLabel={t(iorbitCopy.cancel)} destructive icon="trash" onConfirm={() => void history.confirmDeleteHistorySession()} onCancel={() => history.setPendingDeleteHistory(null)} />
      {history.historyDeleteError ? <p className={styles.error} role="alert">{history.historyDeleteError}</p> : null}
    </div>
    </Orbit2026Scope>
  );
}
