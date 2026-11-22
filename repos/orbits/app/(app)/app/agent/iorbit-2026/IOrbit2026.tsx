"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";

import type { AiPageContextContract } from "../../../../../shared/contract/ai-sessions";
import { planTaskSegmentHref } from "../../../../../shared/compute/plan-href";
import type { OrbitAgentHistoryView, OrbitAgentSuggestView } from "../../orbit-agent-route-view-model";
import { useOrbitLanguage } from "../../orbit-language-context";
import { useOrbitModalA11y } from "../../orbit-modal-a11y";
import { iorbitCopy } from "../../orbit-2026/copy/iorbit";
import { standardCopyFor } from "../../orbit-2026/copy/standard";
import { ShellPage } from "../../orbit-2026/shell/slots";
import { useCloseShellRail } from "../../orbit-2026/shell/Orbit2026Shell";
import { Bone, Button, Card, ConfirmDialog, ContextMenu, Icon, IconButton, Kbd, MacTile, Orbit2026Scope, SearchField, Toggle } from "../../orbit-2026/ui";
import { AgentActionStatusCard } from "../agent-action-status-card";
import { AgentTaskInteractionCard } from "../agent-task-interaction-card";
import { AgentMessageCopyButton, PanelCards, ThinkingIndicator } from "../iorbit-0918/iorbit-rich-components";
import { useAgentChat } from "../iorbit-0918/use-agent-chat";
import { useAgentHistory } from "../iorbit-0918/use-agent-history";
import { contactPageContextSource, createContactPageContextLoader } from "../../orbit-2026/iorbit/page-context";
import { readIOrbitEntityDraft, type IOrbitEntityDraft } from "../../orbit-2026/iorbit/entity-draft";
import { cancelAgentV1, decideAgentCard, latestCard, regenerateAgentCard, removeAgentCardItem, requestIdOfAssistantMessage, selectAgentOption, useAgentV1Session, type AgentV1SessionState, useAnswerRecordsGone } from "../../orbit-2026/iorbit/action-preview-client";
import { AnswerBlocks } from "../../orbit-2026/iorbit/answer-blocks";
import { answerBlocksOf } from "../../../../../shared/compute/agent-answer-blocks";
import { answerTextOf, BasisLine, ConfirmationCard, MemoryChipRow, MemoryChips, ProgressLine, QuestionOptions, QueuedNote } from "../../orbit-2026/iorbit/confirmation-card";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import styles from "./IOrbit2026.module.css";
import { checkPickedReferences, MarkedMirror, ReferenceChips, ReferencePicker, useReferenceComposer, type PickerKeys } from "./ReferencePicker";
import { markedSegments, type ReferenceLanguage } from "../../../../../shared/compute/agent-references";

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

type HistorySection = "pinned" | "today" | "week" | "older";

function historySections(history: HistoryStore, language: string): [HistorySection, { item: OrbitAgentHistoryView; stamp: string }[]][] {
  const dates = new Map(history.storedSessions.map((session) => [session.id, session.updatedAt || session.createdAt]));
  const today = tokyoDate(new Date().toISOString())!;
  const todayDay = Date.parse(`${today}T00:00:00Z`) / 86_400_000;
  const mondayDay = todayDay - ((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7);
  const locale = language === "ja" ? "ja-JP" : language === "zh" ? "zh-CN" : "en-US";
  const groups = new Map<HistorySection, { item: OrbitAgentHistoryView; stamp: string }[]>([
    ["pinned", []], ["today", []], ["week", []], ["older", []],
  ]);
  for (const item of history.storedHistory) {
    const raw = dates.get(item.sessionId ?? "") ?? "";
    const day = tokyoDate(raw);
    const ordinal = day ? Date.parse(`${day}T00:00:00Z`) / 86_400_000 : -Infinity;
    const section = item.pinned ? "pinned" : ordinal === todayDay ? "today" : ordinal >= mondayDay ? "week" : "older";
    const when = new Date(raw);
    const stamp = !day ? item.date
      : section === "today" ? new Intl.DateTimeFormat(locale, { timeZone: "Asia/Tokyo", hour: "numeric", minute: "2-digit", hour12: false }).format(when)
        : section === "week" ? new Intl.DateTimeFormat(locale, { timeZone: "Asia/Tokyo", weekday: "short" }).format(when).replace(/曜日?$/u, "")
          : `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))}`;
    groups.get(section)!.push({ item, stamp });
  }
  return [...groups].filter(([, items]) => items.length > 0);
}

function HistoryRow({ item, stamp, history, onPick }: { item: OrbitAgentHistoryView; stamp: string; history: HistoryStore; onPick: (item: OrbitAgentHistoryView) => void }) {
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
          <button className={`btn ${styles.historyEntryMain}`} type="button" onClick={() => onPick(item)}><span className={styles.historyTitle}>{item.title}</span><small>{stamp}</small></button>
          <button ref={menuAnchor} type="button" className={`btn ${styles.historyMore}`} aria-label={t(iorbitCopy.actions)} onClick={() => setMenuOpen(true)}><Icon name="more" size={16} /></button>
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

/** b8 #11 .r8hist (768–1199: a 272px panel over the chat with its own scrim) / #12 .r8adrawer (≤767: a full-height sheet from the left). */
function HistoryDrawer({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  const ref = useOrbitModalA11y(onClose);
  return <>
    <div className={styles.historyScrim} aria-hidden onClick={onClose} />
    <div ref={ref} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} className={styles.historyDrawer}>{children}</div>
  </>;
}

/** b4 #37 .hpanel: 「会話 + 新規」, a search pill, then ピン留め / 今日 / 今週 / それ以前 rows (title · date). */
function HistoryPane({ history, onNew, onPick, onCollapse }: { history: HistoryStore; onNew: () => void; onPick: (item: OrbitAgentHistoryView) => void; onCollapse?: () => void }) {
  const { language, t } = useOrbitLanguage();
  const [search, setSearch] = useState(history.historyQuery);
  useEffect(() => { const timer = window.setTimeout(() => history.setHistoryQuery(search), 250); return () => window.clearTimeout(timer); }, [search, history.setHistoryQuery]);
  const sections = useMemo(() => historySections(history, language), [history.storedHistory, history.storedSessions, language]);
  return (
    <div className={styles.history}>
      <div className={styles.historyHead}><b>{t(iorbitCopy.conversation)}</b><span className={styles.historyHeadActions}><Button label={t(iorbitCopy.newShort)} icon="edit" variant="primary" size="sm" onClick={onNew} />{onCollapse ? <button type="button" className={`btn ${styles.historyCollapse}`} aria-label={standardCopyFor(language).action.close} onClick={onCollapse}><Icon name="left" size={16} /></button> : null}</span></div>
      <SearchField label={t(iorbitCopy.searchLabel)} placeholder={t(iorbitCopy.searchPlaceholder)} value={search} onChange={setSearch} />
      {history.historyPageLoading && !history.storedHistory.length ? <HistorySkeleton label={t(iorbitCopy.loading)} /> : null}
      {history.historyReadError ? <div role="alert" className={styles.error}>{t(iorbitCopy.readFailed)}<Button label={t(iorbitCopy.retry)} variant="ghost" size="sm" onClick={history.retryHistoryRead} /></div> : null}
      {!history.historyPageLoading && !history.historyReadError && !history.storedHistory.length ? <p className={styles.emptyHistory}>{t(search ? iorbitCopy.noMatch : iorbitCopy.empty)}</p> : null}
      {sections.map(([section, items]) => <section key={section} aria-label={t(iorbitCopy[section])} className={styles.historySection}>
        <h3>{t(iorbitCopy[section])}</h3>
        {items.map(({ item, stamp }) => <HistoryRow key={item.id} item={item} stamp={stamp} history={history} onPick={onPick} />)}
      </section>)}
      {history.historyPageHasMore ? <Button label={t(history.historyPageLoading ? iorbitCopy.loadingMore : iorbitCopy.more)} variant="ghost" size="sm" disabled={history.historyPageLoading} onClick={() => void history.loadMoreHistory()} block /> : null}
      {history.historyFeedback ? <p role={history.historyFeedback.kind === "error" ? "alert" : "status"} className={history.historyFeedback.kind === "error" ? styles.error : styles.feedback}>{history.historyFeedback.text}</p> : null}
      {history.pendingUndo ? <div className={styles.undo} role="status"><span>{t(iorbitCopy.deleted)}</span><Button label={t(iorbitCopy.undo)} size="sm" variant="ghost" onClick={() => void history.undoDeletedHistorySession()} /></div> : null}
    </div>
  );
}

/** The list before its first page: a section label and rows of the same footprint as HistoryRow (.hi padding 9 10). */
function HistorySkeleton({ label }: { label: string }) {
  return (
    <div role="progressbar" aria-busy aria-label={label} className={styles.historySection} data-orbit-iorbit-history-loading>
      <h3 aria-hidden><Bone width={48} height={12} /></h3>
      {[72, 58, 84, 64, 76].map((width, index) => <div key={index} className={styles.historySkeletonRow} aria-hidden>
        <Bone width={`${width}%`} height={14} /><Bone width={28} height={10} />
      </div>)}
    </div>
  );
}

type SpeechRecognitionLike = { lang: string; interimResults: boolean; onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; start: () => void; stop: () => void };
/** b4 composer 🎤: the browser's own speech recognition (no AI call); hidden where the browser has none. */
function useDictation(language: string, onText: (text: string) => void) {
  // null until the browser is checked after mount: the 🎤 slot is held meanwhile so the input does not narrow later.
  const [supported, setSupported] = useState<boolean | null>(null);
  const [listening, setListening] = useState(false);
  const ref = useRef<SpeechRecognitionLike | null>(null);
  useEffect(() => {
    const ctor = (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike });
    setSupported(Boolean(ctor.SpeechRecognition ?? ctor.webkitSpeechRecognition));
    return () => ref.current?.stop();
  }, []);
  const toggle = () => {
    if (listening) { ref.current?.stop(); return; }
    const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    const recognition = new Ctor();
    recognition.lang = language === "zh" ? "zh-CN" : language === "en" ? "en-US" : "ja-JP";
    recognition.interimResults = false;
    recognition.onresult = (event) => { const text = Array.from(event.results).map((result) => result[0]?.transcript ?? "").join(""); if (text) onText(text); };
    recognition.onend = () => setListening(false);
    ref.current = recognition;
    setListening(true);
    recognition.start();
  };
  return { supported, listening, toggle };
}

const STARTER_TONES = ["lav", "apricot", "teal", "pink"] as const;

/**
 * agent-design AG07: one protocol-3 turn, from its result document — progress while it runs, then the basis line,
 * the answer (without the part that stands for the card), the options under a question and the confirmation card.
 */
function V1Turn({ requestId, sessionId, session, language, navigate, gone }: { requestId: string; sessionId: string | null; session: AgentV1SessionState; language: OrbitLanguage; navigate(href: string): void; gone: ReadonlySet<string> }) {
  const document = session.documents.get(requestId);
  const fromDocument = document?.actionPreview;
  const card = latestCard(fromDocument, fromDocument ? session.cards.get(fromDocument.actionId) : undefined);
  const [picking, setPicking] = useState(false);
  const running = !document || document.status === "running" || document.status === "queued";
  const words = iorbitCopy;
  const { t } = useOrbitLanguage();
  // AG19: the answer in blocks (an older document has none and is shown as text, in the new type size).
  const blocks = !running && document ? answerBlocksOf(document, Boolean(card)) : null;
  const hasCards = Boolean(blocks?.some((block) => block.type === "records"));
  // Board 4: when nothing was done, the note stands alone — no copy button under it.
  const onlyNote = Boolean(blocks?.length) && blocks!.every((block) => block.type === "note");
  return (
    <div className={styles.assistantRow} data-orbit-iorbit-message data-orbit-agent-request={requestId} data-orbit-agent-request-status={document?.status ?? "pending"}>
      <span className={styles.assistantIcon} aria-hidden><Icon name="sparkle" size={16} /></span>
      <div className={styles.answer}>
        <b>iOrbit</b>
        {running ? (document?.status === "queued" ? null : <ProgressLine language={language} stage={session.stages.get(requestId) ?? null} action={<Button label={t(words.stop)} variant="ghost" size="sm" onClick={() => void cancelAgentV1(requestId)} />} />) : null}
        {/* AG14 (board 5, D4): the memory chips follow the basis chip in the same row. */}
        {!running && document?.answer?.basis ? <BasisLine basis={document.answer.basis} language={language} navigate={navigate} cardsBelow={hasCards}>{document.answer.memoryUse?.length ? <MemoryChips memoryUse={document.answer.memoryUse} language={language} navigate={navigate} /> : null}</BasisLine>
          : !running && document?.answer?.memoryUse?.length ? <MemoryChipRow memoryUse={document.answer.memoryUse} language={language} navigate={navigate} /> : null}
        {blocks ? <AnswerBlocks blocks={blocks} gone={gone} language={language} navigate={navigate} /> : null}
        {!running && document && !blocks ? <div className={styles.answerText}><AgentMarkdown text={answerTextOf(document, Boolean(card)) || (document.status === "failed" || document.status === "cancelled" ? t(words.tryAgain) : "")} /></div> : null}
        {!running && document?.clarifications?.length ? <QuestionOptions clarifications={document.clarifications} language={language} disabled={picking || !session.online || !sessionId} onSelect={(set, optionId) => {
          if (!sessionId) return;
          setPicking(true);
          void selectAgentOption({ clarificationId: set.clarificationId, optionId, requestId, sessionId }).finally(() => setPicking(false));
        }} /> : null}
        {card ? <ConfirmationCard card={card} language={language} online={session.online}
          onDecide={async (decision, operationId) => { const result = await decideAgentCard(card, decision, operationId); session.noteCard(result.card); return result.ok; }}
          onRegenerate={async () => { const result = await regenerateAgentCard(card); session.noteCard(result.card); return result.ok; }}
          onRemove={async (operationId) => { const result = await removeAgentCardItem(card, operationId); session.noteCard(result.card); return result.ok; }} /> : null}
        {!running && document?.answer?.text && !onlyNote ? <AgentMessageCopyButton text={answerTextOf(document, false)} /> : null}
      </div>
    </div>
  );
}

/** AG11 (视觉稿第 5 组): the user's message with the picked 「@名字」 coloured. */
function UserText({ text, marks }: { text: string; marks: readonly { start: number; end: number }[] }) {
  const segments = markedSegments(text, marks.map((mark) => ({ end: mark.end, id: `${mark.start}`, name: text.slice(mark.start + 1, mark.end), start: mark.start, type: "memo" as const })));
  return <span>{segments.map((segment, index) => (segment.binding ? <span key={index} className={styles.mark}>{segment.text}</span> : <span key={index}>{segment.text}</span>))}</span>;
}

export function IOrbit2026({ accountName, initialHistoryOpen = false, agentV1 = false }: {
  /** The greeting's name (the profile display name); null greets without one. */
  accountName: string | null;
  initialHistoryOpen?: boolean;
  /** agent-design AG07: the protocol-3 entry is on (ORBIT_AGENT_V1_MODE=on). */
  agentV1?: boolean;
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
  }, suggests: suggestions, agentV1 });
  // AG07: the protocol-3 turns of the open conversation, from their result documents.
  const v1 = useAgentV1Session(chat.activeSessionId, agentV1);
  const v1RequestIds = agentV1 ? chat.messages.flatMap((message) => (message.role === "assistant" ? [message.v1RequestId ?? requestIdOfAssistantMessage(message.id)].filter((id): id is string => Boolean(id)) : [])) : [];
  // AG19-5: cards of older answers whose record is gone or cannot be seen any more.
  const v1Gone = useAnswerRecordsGone(v1.documents, agentV1);
  const v1Key = v1RequestIds.join(",");
  const loadV1 = v1.load;
  useEffect(() => { if (v1Key) loadV1(v1Key.split(",")); }, [v1Key, loadV1]);
  const v1Of = (message: (typeof chat.messages)[number] | undefined) => (agentV1 && message?.role === "assistant" ? message.v1RequestId ?? requestIdOfAssistantMessage(message.id) : null);
  history.bindChat({
    activeSessionIdRef: chat.activeSessionIdRef, navigate: chat.navigate, setActiveQ: chat.setActiveQ,
    setActiveSessionId: chat.setActiveSessionId, setChatOpen: chat.setChatOpen, setHistOpen: chat.setHistOpen,
    setMessages: chat.setMessages, setPanel: chat.setPanel, setThinking: chat.setThinking,
  });
  // ≥768 the conversation list is the shell's right rail (as 次の一手 is on the other tabs:
  // always there at ≥1280, a drawer from the header button at 768–1279). Below 768 it is
  // the page's own drawer from 会話リスト in the phone header.
  const [historyOpen, setHistoryOpen] = useState(initialHistoryOpen);
  const [phone, setPhone] = useState(false);
  const closeRail = useCloseShellRail();
  const [contextEnabled, setContextEnabled] = useState(false);
  const [pageContext, setPageContext] = useState<AiPageContextContract | null>(null);
  const [contextError, setContextError] = useState<string | null>(null);
  const contextLoaderRef = useRef<ReturnType<typeof createContactPageContextLoader> | null>(null);
  contextLoaderRef.current ??= createContactPageContextLoader();
  const contextLoader = contextLoaderRef.current;
  useEffect(() => () => contextLoader.clear(), [contextLoader]);
  const [entityDraft, setEntityDraft] = useState<IOrbitEntityDraft | null>(null);
  const [entityDraftLoaded, setEntityDraftLoaded] = useState(false);
  const [entityDraftError, setEntityDraftError] = useState<string | null>(null);
  const [entityDraftBusy, setEntityDraftBusy] = useState(false);
  const entityDraftBusyRef = useRef(false);
  const [requestedDraftId, setRequestedDraftId] = useState<string | null>(null);
  const [source, setSource] = useState<string[] | null>(null);
  const [prefillOrigin, setPrefillOrigin] = useState<NonNullable<typeof chat.agentPrefill>["origin"]>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // AG11: the records picked with @ or 「＋」 (protocol 3 only), their marks in the sentence and the open picker.
  const refLanguage: ReferenceLanguage = language === "ja" || language === "en" ? language : "zh";
  const refs = useReferenceComposer(chat.chatDraft, chat.setChatDraft, refLanguage);
  const pickerKeys = useRef<PickerKeys | null>(null);
  const mirrorRef = useRef<HTMLDivElement | null>(null);
  const placeCaret = (result: { caret: number }) => requestAnimationFrame(() => { const input = inputRef.current; if (!input) return; input.focus(); input.setSelectionRange(result.caret, result.caret); });
  const refBindings = refs.bindings;
  const markGone = refs.markGone;
  useEffect(() => {
    // D7: a record picked a while ago may have been deleted or hidden since; checked when the page comes back.
    if (!agentV1 || !refBindings.length) return;
    const check = () => { if (document.visibilityState === "visible") void checkPickedReferences(refBindings).then((gone) => { if (gone.size) markGone(gone); }).catch(() => undefined); };
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => { document.removeEventListener("visibilitychange", check); window.removeEventListener("focus", check); };
  }, [agentV1, refBindings, markGone]);
  const oncePrefill = useRef(false);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setPhone(media.matches);
    update(); media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    const draftId = new URLSearchParams(window.location.search).get("draftId");
    setRequestedDraftId(draftId && draftId.length <= 160 ? draftId : null);
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
    // AG11: the picked records go with the sentence, each with its marker's place in the trimmed message (protocol 3).
    const sent = refs.forSend(chat.chatDraft);
    const query = sent.message;
    if (!query || chat.thinking || (contextEnabled && !pageContext)) return;
    chat.setChatDraft("");
    refs.clear();
    chat.setAgentPrefill(null);
    void chat.ask(query, undefined, prefillOrigin ?? undefined, contextEnabled ? pageContext ?? undefined : undefined, agentV1 ? sent.references : undefined);
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
  const startNew = () => { chat.setAgentPrefill(null); setPrefillOrigin(null); chat.newChat(); refs.clear(); setHistoryOpen(false); closeRail(); resetContext(); setSource(null); setRequestedDraftId(null); };
  const pick = (item: OrbitAgentHistoryView) => { chat.setAgentPrefill(null); setPrefillOrigin(null); chat.pickHistory(item); refs.clear(); setHistoryOpen(false); closeRail(); resetContext(); setSource(null); setRequestedDraftId(null); };
  const inConversation = chat.messages.length > 0 || chat.thinking;
  const activeTitle = history.storedHistory.find((item) => item.sessionId === chat.activeSessionId)?.title;
  // An open conversation whose title is not read yet holds the line with a blank instead of 「会話中」 → title.
  const titlePending = !activeTitle && Boolean(chat.activeSessionId) && history.historyPageLoading && !history.storedHistory.length;
  const dictation = useDictation(language, (text) => { chat.setChatDraft(`${chat.chatDraft}${chat.chatDraft ? " " : ""}${text}`); inputRef.current?.focus(); });
  const shortcut = typeof navigator !== "undefined" && /Mac|iPhone|iPad/u.test(navigator.platform) ? "⌘" : "Ctrl";
  // 卡片自带三语文案：日文界面直接传 ja，不再退成英文。
  const panelLanguage = language;
  return (
    <Orbit2026Scope language={language} className={`${styles.scope} ${inConversation ? styles.conversationScope : ""}`}>
    <div aria-busy={chat.thinking} data-orbit-agent-request-state={chat.thinking ? "pending" : "idle"}>
      <ShellPage title="iOrbit" subtitle={inConversation ? activeTitle || (titlePending ? "\u00a0" : t(iorbitCopy.inConversation)) : t(iorbitCopy.subtitle)}
        right={<><span className={styles.anywhere}><Kbd>{shortcut}</Kbd> <Kbd>K</Kbd><span className={styles.anywhereText}> {t(iorbitCopy.anywhere)}</span></span><Button label={t(iorbitCopy.newChat)} icon="plus" onClick={startNew} /></>}
        rightRail={phone ? false : <div className={styles.railHistory}><HistoryPane history={history} onNew={startNew} onPick={pick} /></div>}
        railLabel={t(iorbitCopy.list)} phoneFold phoneBare={inConversation} />
      <div className={styles.layout}>
        {historyOpen && phone ? <HistoryDrawer label={t(iorbitCopy.list)} onClose={() => setHistoryOpen(false)}><HistoryPane history={history} onNew={startNew} onPick={pick} onCollapse={() => setHistoryOpen(false)} /></HistoryDrawer> : null}
        <main className={styles.main}>
          <div className={styles.phoneHeader}><IconButton icon="menu" label={t(iorbitCopy.list)} onClick={() => setHistoryOpen(true)} /><div className={styles.phoneHeaderTitle}><strong>iOrbit</strong>{inConversation && activeTitle ? <small>{activeTitle}</small> : null}</div><IconButton icon={inConversation ? "x" : "plus"} label={inConversation ? standardCopyFor(language).action.close : t(iorbitCopy.newChat)} onClick={startNew} /></div>
          {!inConversation ? <section className={styles.start} aria-label={t(iorbitCopy.newChat)}>
            <div className={styles.greeting}>
              <span className={styles.star} aria-hidden>✨</span>
              <h1>{accountName ? fill(t(iorbitCopy.greetingName), { name: accountName.split(/\s+/u)[0] }) : t(iorbitCopy.greeting)}<br />{t(iorbitCopy.heading)}</h1>
              <p>{t(iorbitCopy.intro)}</p>
            </div>
            <div className={styles.suggestions}>
              {suggestions.map((suggestion, index) => <button key={`${suggestion.q}-${index}`} type="button" className={`btn ${styles.suggestion}`} onClick={() => sendSuggestion(suggestion.q)}>
                <MacTile emoji={suggestion.icon} tone={STARTER_TONES[index % STARTER_TONES.length]} size="sm" /><span>{suggestion.label}</span>
              </button>)}
            </div>
            <div className={styles.capabilities}><div className={styles.capabilityTitle}>{t(iorbitCopy.capabilitiesTitle)}</div><div className={styles.capabilityGrid}>
              {([
                ["home", iorbitCopy.homeCapability, iorbitCopy.homeCapabilityDetail],
                ["users", iorbitCopy.peopleCapability, iorbitCopy.peopleCapabilityDetail],
                ["calendar", iorbitCopy.eventsCapability, iorbitCopy.eventsCapabilityDetail],
                ["target", iorbitCopy.plan, iorbitCopy.planCapabilityDetail],
              ] as const).map(([icon, label, detail]) => <div className={styles.capability} key={icon}><span className={styles.capabilityIcon}><Icon name={icon} size={16} /></span><b>{t(label)}</b><span>{t(detail)}</span></div>)}
            </div></div>
          </section> : <section className={styles.thread} aria-label={t(iorbitCopy.conversation)} data-orbit-iorbit-thread>
            {chat.earlier.hasMore || chat.earlier.status === "error" ? <Button label={t(chat.earlier.status === "error" ? iorbitCopy.earlierRetry : iorbitCopy.earlier)} variant="ghost" onClick={() => void chat.loadEarlier()} disabled={chat.earlier.status === "loading"} /> : null}
            {chat.messages.map((message, index) => message.role === "user" ?
              <div className={styles.userRow} key={message.id ?? `u${index}`} data-orbit-iorbit-message><span className={styles.userBubble}>{message.marks?.length ? <UserText text={message.text} marks={message.marks} /> : message.text}{message.supplement ? <small>{message.supplement}</small> : null}</span><AgentMessageCopyButton text={message.text} />{(() => { const next = v1Of(chat.messages[index + 1]); return next && v1.documents.get(next)?.status === "queued" ? <QueuedNote language={language} /> : null; })()}</div> :
              v1Of(message) ? <V1Turn gone={v1Gone} key={message.id ?? `a${index}`} requestId={v1Of(message)!} sessionId={chat.activeSessionId} session={v1} language={language} navigate={chat.navigate} /> :
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
          <form className={`${styles.composer} ${agentV1 ? styles.composerWithRefs : ""}`} onSubmit={submit} data-orbit-agent-chat-composer>
            {agentV1 && refs.picker ? <ReferencePicker composer={refs} language={refLanguage} t={t} keysRef={pickerKeys} onPicked={placeCaret} /> : null}
            {agentV1 && refs.bindings.length ? <ReferenceChips composer={refs} language={refLanguage} t={t} onRemoved={() => inputRef.current?.focus()} /> : null}
            {agentV1
              ? <button type="button" className={`btn ${styles.composerButton}`} aria-label={t(iorbitCopy.addContext)} title={t(iorbitCopy.addContext)} aria-expanded={refs.picker?.mode === "plus"} disabled={chat.thinking} data-orbit-reference-add
                  onClick={() => (refs.picker ? refs.close() : refs.openPlus(inputRef.current?.selectionStart ?? chat.chatDraft.length))}><Icon name="plus" size={16} /></button>
              : <span className={styles.composerPlus} aria-hidden><Icon name="plus" size={16} /></span>}
            <div className={`${styles.field} ${refs.bindings.length ? styles.fieldMarked : ""}`}>
              {agentV1 && refs.bindings.length ? <MarkedMirror text={chat.chatDraft} bindings={refs.bindings} mirrorRef={mirrorRef} /> : null}
              <textarea ref={inputRef} rows={1} aria-label={t(iorbitCopy.ask)} placeholder={t(iorbitCopy.composerPlaceholder)} value={chat.chatDraft} disabled={chat.thinking}
                onChange={(event) => (agentV1 ? refs.onTextChange(event.target.value, event.target.selectionStart ?? event.target.value.length) : chat.setChatDraft(event.target.value))}
                onScroll={(event) => { if (mirrorRef.current) mirrorRef.current.scrollTop = event.currentTarget.scrollTop; }}
                onKeyDown={(event) => {
                  if (agentV1 && refs.picker?.mode === "at" && pickerKeys.current?.onKeyDown(event)) return;
                  if (agentV1 && (event.metaKey || event.ctrlKey) && event.key === "z" && !event.shiftKey && refs.undo(chat.chatDraft)) { event.preventDefault(); return; }
                  if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); submit(); }
                }} />
            </div>
            {dictation.supported === null ? <span className={`btn ${styles.composerButton}`} style={{ visibility: "hidden" }} aria-hidden data-orbit-iorbit-mic-slot><Icon name="mic" size={16} /></span> : null}
            {dictation.supported ? <button type="button" className={`btn ${styles.composerButton}`} aria-label={t(dictation.listening ? iorbitCopy.dictating : iorbitCopy.dictate)} aria-pressed={dictation.listening} onClick={dictation.toggle} disabled={chat.thinking}><Icon name="mic" size={16} /></button> : null}
            <button type="submit" className={`btn ${styles.composerButton} ${styles.composerSend}`} aria-label={t(iorbitCopy.send)} disabled={chat.thinking || !chat.chatDraft.trim()} data-orbit-agent-submit="true"><Icon name="send" size={16} /></button>
          </form>
          <p className={styles.privacy}>{t(iorbitCopy.privacy)}</p>
        </main>
      </div>
      <ConfirmDialog open={Boolean(history.pendingDeleteHistory)} title={t(iorbitCopy.deleteTitle)} message={t(iorbitCopy.deleteMessage)} confirmLabel={t(iorbitCopy.delete)} cancelLabel={t(iorbitCopy.cancel)} destructive icon="trash" onConfirm={() => void history.confirmDeleteHistorySession()} onCancel={() => history.setPendingDeleteHistory(null)} />
      {history.historyDeleteError ? <p className={styles.error} role="alert">{history.historyDeleteError}</p> : null}
    </div>
    </Orbit2026Scope>
  );
}
