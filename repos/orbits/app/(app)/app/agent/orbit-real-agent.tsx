"use client";

import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { AiSessionGroupContract } from "../../../../shared/contract/ai-sessions";

import type {
  OrbitAgentEventResultView,
  OrbitAgentHistoryView,
  OrbitAgentPeopleResultView,
  OrbitAgentTodoResultView,
  OrbitAgentViewModel,
} from "../orbit-agent-route-view-model";
import { AccountTopNav } from "../orbit-account-shell";
import { eventCoverPhoto } from "../orbit-event-cover-photo";
import { EventCover } from "../events/orbit-event-cover";
import { useOrbitLanguage } from "../orbit-language-context";
import { useOrbitModalA11y } from "../orbit-modal-a11y";
import { Avatar, Icon, IconButton, gradientFromString } from "../orbit-reference-primitives";
import { ORBIT_LEFT_SIDEBAR_WIDTH } from "../orbit-layout-constants";
import { ORBIT_Z } from "../orbit-z";
import { AgentActionStatusCard } from "./agent-action-status-card";
import { AgentOutcomeFeedback } from "./agent-outcome-feedback";
import { AgentChatHistoryOrganization } from "./agent-chat-history-organization";
import { AgentTaskInteractionCard } from "./agent-task-interaction-card";
import { OrbitAgentDashboard } from "./orbit-agent-dashboard";
import type { OrbitHomeViewModel } from "../orbit-home-route-view-model";
import type { EventRegistrationAvailability } from "../../../../features/events/registration/deadline-gated-service";
import {
  openRelationshipInbox,
  openRelationshipInboxCompose,
  requestMessageDraft,
} from "../inbox/relationship-inbox-panel";
import {
  HISTORY_SIDEBAR_MAX_WIDTH,
  HISTORY_SIDEBAR_MIN_WIDTH,
  THINKING_PHASES,
  THINKING_PHASE_INTERVAL_MS,
  agentSuggestLabel,
  copyAgentMessageText,
  draftPurposeFor,
  earliestTodoDueAt,
  fmtDay,
  fmtMonth,
  groupTodosByContact,
  isPeopleResult,
  isTodoLead,
  isTodoResult,
  parseDate,
  titleFromMessages,
  todoDueLabel,
  type AgentHistoryLanguage,
  type AgentPanel,
  type AgentTodoGroup,
  type Copy,
  type Translate,
} from "./iorbit-0918/iorbit-model";
import { useAgentChat } from "./iorbit-0918/use-agent-chat";
import { useAgentHistory } from "./iorbit-0918/use-agent-history";

interface OrbitRealAgentProps {
  home?: OrbitHomeViewModel | null;
  registrationAvailabilityByEventId?: Readonly<Record<string, EventRegistrationAvailability>>;
  viewModel: OrbitAgentViewModel;
}


const AgentMarkdown = dynamic(() => import("./agent-markdown"), {
  loading: () => <div aria-hidden="true" className="orbit-agent-markdown" />,
});





function AgentMessageCopyButton({ text }: { text: string }) {
  const { t } = useOrbitLanguage();
  const [copied, setCopied] = useState(false);

  return (
    <button
      aria-label={t({ en: "Copy message", zh: "复制消息" })}
      className="orbit-agent-message-copy"
      data-orbit-agent-message-copy={copied ? "copied" : "idle"}
      onClick={async () => setCopied(await copyAgentMessageText(text))}
      title={copied ? t({ en: "Copied", zh: "已复制" }) : t({ en: "Copy", zh: "复制" })}
      type="button"
      style={{
        alignItems: "center",
        background: copied ? "var(--accent-soft)" : "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-sm)",
        color: copied ? "var(--accent)" : "var(--text-3)",
        cursor: "pointer",
        display: "inline-flex",
        flexShrink: 0,
        height: 30,
        justifyContent: "center",
        width: 30,
      }}
    >
      <Icon name={copied ? "check" : "copy"} size={14} />
    </button>
  );
}

function AgentHistoryList({
  activeQ,
  activeSessionId,
  history,
  onDelete,
  onPick,
  onRename,
  onMove,
  sessionGroups,
  onTogglePin,
  pendingSessionId,
}: {
  activeQ: string;
  activeSessionId: string | null;
  history: OrbitAgentHistoryView[];
  onDelete: (history: OrbitAgentHistoryView) => void;
  onPick: (history: OrbitAgentHistoryView) => void;
  onRename: (history: OrbitAgentHistoryView, title: string) => void;
  onMove: (history: OrbitAgentHistoryView, groupId: string | null) => void;
  onTogglePin: (history: OrbitAgentHistoryView) => void;
  pendingSessionId: string | null;
  sessionGroups: readonly AiSessionGroupContract[];
}) {
  const { t } = useOrbitLanguage();
  const [historyMenuOpenId, setHistoryMenuOpenId] = useState<string | null>(null);
  const [hoveredHistoryId, setHoveredHistoryId] = useState<string | null>(null);
  const [renamingHistoryId, setRenamingHistoryId] = useState<string | null>(null);
  const [renamingHistoryTitle, setRenamingHistoryTitle] = useState("");
  const groups = useMemo(() => [...new Set(history.map((item) => item.group))], [history]);

  const startRename = (item: OrbitAgentHistoryView) => {
    setHistoryMenuOpenId(null);
    setRenamingHistoryId(item.id);
    setRenamingHistoryTitle(item.title);
  };

  const finishRename = (item: OrbitAgentHistoryView) => {
    const title = renamingHistoryTitle.trim();

    if (title) {
      onRename(item, title);
    }

    setRenamingHistoryId(null);
    setRenamingHistoryTitle("");
  };

  const cancelRename = () => {
    setRenamingHistoryId(null);
    setRenamingHistoryTitle("");
  };

  useEffect(() => {
    if (!historyMenuOpenId) {
      return undefined;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setHistoryMenuOpenId(null);
      }
    };

    document.addEventListener("keydown", onKeyDown);

    return () => document.removeEventListener("keydown", onKeyDown);
  }, [historyMenuOpenId]);

  return (
    <div className="orbit-agent-history-list" style={{ display: "flex", flexDirection: "column" }}>
      {groups.map((group) => (
        <div key={group}>
          <div className="eyebrow orbit-agent-history-group">
            {group}
          </div>
          <div aria-label={`${group} · ${history.filter((item) => item.group === group).length}`} className="orbit-agent-history-group-list" role="list" style={{ display: "flex", flexDirection: "column" }}>
            {history
              .filter((item) => item.group === group)
              .map((item) => {
                const active = Boolean(
                  (item.sessionId && item.sessionId === activeSessionId) ||
                    (activeQ && item.q === activeQ),
                );
                const menuOpen = historyMenuOpenId === item.id;
                const renaming = renamingHistoryId === item.id;
                const pending = item.sessionId === pendingSessionId;
                const controlsVisible = active || menuOpen || hoveredHistoryId === item.id;

                return (
                  <div
                    aria-busy={pending}
                    className={`orbit-agent-history-row${active ? " is-active" : ""}`}
                    key={item.id}
                    role="listitem"
                    onMouseEnter={() => setHoveredHistoryId(item.id)}
                    onMouseLeave={() => {
                      setHoveredHistoryId((current) => (current === item.id ? null : current));
                    }}
                    style={{
                      alignItems: "center",
                      background: active ? "var(--accent-softer)" : "transparent",
                      borderRadius: "var(--r-sm)",
                      display: "flex",
                      gap: 4,
                      padding: "2px 4px",
                      position: "relative",
                      width: "100%",
                    }}
                  >
                    {renaming ? (
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          finishRename(item);
                        }}
                        style={{ alignItems: "center", display: "flex", flex: 1, gap: 4, minWidth: 0, padding: "4px 0" }}
                      >
                        <input
                          aria-label={t({ en: "Rename conversation", zh: "重命名对话" })}
                          autoFocus
                          data-orbit-agent-history-rename-input={item.sessionId}
                          onChange={(event) => setRenamingHistoryTitle(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Escape") {
                              event.preventDefault();
                              cancelRename();
                            }
                          }}
                          value={renamingHistoryTitle}
                          style={{
                            background: "var(--surface)",
                            border: "1px solid var(--accent)",
                            borderRadius: "var(--r-xs)",
                            color: "var(--ink)",
                            flex: 1,
                            fontFamily: "var(--ff)",
                            fontSize: 14,
                            height: 30,
                            minWidth: 0,
                            outline: "none",
                            padding: "0 8px",
                          }}
                        />
                        <button
                          aria-label={t({ en: "Save conversation name", zh: "保存对话名称" })}
                          className="btn btn-icon btn-quiet"
                          data-orbit-agent-history-save-rename={item.sessionId}
                          disabled={!renamingHistoryTitle.trim()}
                          title={t({ en: "Save", zh: "保存" })}
                          type="submit"
                          style={{ height: 30, width: 30 }}
                        >
                          <Icon name="check" size={14} />
                        </button>
                        <button
                          aria-label={t({ en: "Cancel conversation rename", zh: "取消重命名对话" })}
                          className="btn btn-icon btn-quiet"
                          data-orbit-agent-history-cancel-rename={item.sessionId}
                          onClick={cancelRename}
                          title={t({ en: "Cancel", zh: "取消" })}
                          type="button"
                          style={{ height: 30, width: 30 }}
                        >
                          <Icon name="x" size={14} />
                        </button>
                      </form>
                    ) : (
                      <button
                        className="btn btn-quiet orbit-agent-history-entry"
                        type="button"
                        onClick={() => {
                          setHistoryMenuOpenId(null);
                          onPick(item);
                        }}
                        title={item.q || item.title}
                        style={{ flex: 1, height: "auto", justifyContent: "flex-start", minWidth: 0 }}
                      >
                        <Icon name={item.pinned ? "pin" : "message"} size={15} color={active || item.pinned ? "var(--accent)" : "var(--text-4)"} />
                        <span className="orbit-agent-history-title" style={{ color: active ? "var(--accent)" : "var(--text)", flex: 1, fontSize: 14, fontWeight: active ? 600 : 500, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {item.title}
                        </span>
                      </button>
                    )}
                    {item.sessionId ? (
                      <>
                        <button
                          aria-expanded={menuOpen}
                          aria-haspopup="menu"
                          aria-label={t({ en: "More actions", zh: "更多操作" })}
                          className="btn btn-icon btn-quiet orbit-agent-history-more"
                          data-orbit-agent-history-menu-button={item.sessionId}
                          disabled={pending}
                          onClick={() => setHistoryMenuOpenId(menuOpen ? null : item.id)}
                          title={t({ en: "More actions", zh: "更多操作" })}
                          type="button"
                          style={{
                            background: menuOpen ? "var(--surface-2)" : undefined,
                            color: active ? "var(--accent)" : "var(--text-4)",
                            height: 28,
                            opacity: controlsVisible ? 1 : 0.46,
                            width: 28,
                          }}
                        >
                          <Icon name="more" size={16} />
                        </button>
                        {menuOpen ? (
                          <div
                            className="orbit-agent-history-menu"
                            data-orbit-agent-history-menu={item.sessionId}
                            role="menu"
                            style={{
                              background: "var(--surface)",
                              border: "1px solid var(--border)",
                              borderRadius: "var(--r-sm)",
                              boxShadow: "var(--sh-pop)",
                              minWidth: 156,
                              padding: 6,
                              position: "absolute",
                              right: 2,
                              top: 36,
                              zIndex: ORBIT_Z.dropdown,
                            }}
                          >
                            <button
                              data-orbit-agent-history-pin={item.sessionId}
                              disabled={pending}
                              onClick={() => {
                                setHistoryMenuOpenId(null);
                                onTogglePin(item);
                              }}
                              role="menuitem"
                              type="button"
                              className="btn btn-sm btn-quiet"
                              style={{ height: 34, justifyContent: "flex-start", width: "100%" }}
                            >
                              <Icon name="pin" size={14} />
                              {item.pinned ? t({ en: "Unpin", zh: "取消置顶" }) : t({ en: "Pin", zh: "置顶" })}
                            </button>
                            <button
                              data-orbit-agent-history-rename={item.sessionId}
                              disabled={pending}
                              onClick={() => startRename(item)}
                              role="menuitem"
                              type="button"
                              className="btn btn-sm btn-quiet"
                              style={{ height: 34, justifyContent: "flex-start", width: "100%" }}
                            >
                              <Icon name="edit" size={14} />
                              {t({ en: "Rename", zh: "重命名" })}
                            </button>
                            <div className="eyebrow" style={{ padding: "6px 8px 2px" }}>{t({ en: "Move to", zh: "移动到" })}</div>
                            <button className="btn btn-sm btn-quiet" disabled={pending || item.groupId === null} onClick={() => { setHistoryMenuOpenId(null); onMove(item, null); }} role="menuitem" style={{ height: 34, justifyContent: "flex-start", width: "100%" }} type="button">{t({ en: "Ungrouped", zh: "未分组" })}</button>
                            {sessionGroups.map((group) => <button className="btn btn-sm btn-quiet" disabled={pending || item.groupId === group.id} key={group.id} onClick={() => { setHistoryMenuOpenId(null); onMove(item, group.id); }} role="menuitem" style={{ height: 34, justifyContent: "flex-start", width: "100%" }} type="button">{group.name}</button>)}
                            <div style={{ background: "var(--border)", height: 1, margin: "5px 4px" }} />
                            <button
                              data-orbit-agent-history-delete={item.sessionId}
                              disabled={pending}
                              onClick={() => {
                                setHistoryMenuOpenId(null);
                                onDelete(item);
                              }}
                              role="menuitem"
                              type="button"
                              className="btn btn-sm btn-quiet"
                              style={{ color: "var(--danger, #C2410C)", height: 34, justifyContent: "flex-start", width: "100%" }}
                            >
                              {t({ en: "Delete", zh: "删除对话" })}
                            </button>
                          </div>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                );
              })}
          </div>
        </div>
      ))}
    </div>
  );
}

function AgentHistoryDeleteDialog({
  error,
  history,
  onCancel,
  onConfirm,
  pending,
}: {
  error: string | null;
  history: OrbitAgentHistoryView;
  onCancel: () => void;
  onConfirm: () => void;
  pending: boolean;
}) {
  const { t } = useOrbitLanguage();
  const dialogRef = useOrbitModalA11y(() => {
    if (!pending) {
      onCancel();
    }
  });

  return (
    <div
      data-orbit-agent-history-delete-confirmation
      role="presentation"
      style={{
        alignItems: "center",
        background: "var(--scrim)",
        display: "flex",
        inset: 0,
        justifyContent: "center",
        padding: 20,
        position: "fixed",
        zIndex: ORBIT_Z.modal,
      }}
    >
      <div
        aria-describedby="orbit-agent-history-delete-description"
        aria-labelledby="orbit-agent-history-delete-title"
        aria-modal="true"
        ref={dialogRef}
        role="alertdialog"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-lg)",
          boxShadow: "var(--sh-pop)",
          display: "grid",
          gap: 16,
          maxWidth: 440,
          padding: 24,
          width: "100%",
        }}
        tabIndex={-1}
      >
        <h2
          id="orbit-agent-history-delete-title"
          style={{ color: "var(--ink)", fontSize: 22, margin: 0 }}
        >
          {t({ en: "Delete this conversation?", zh: "删除这个对话？" })}
        </h2>
        <p
          id="orbit-agent-history-delete-description"
          style={{ color: "var(--text-2)", fontSize: 14, lineHeight: 1.6, margin: 0 }}
        >
          {t({
            en: `“${history.title}” and its messages will be permanently removed from your chat history. This cannot be undone.`,
            zh: `“${history.title}”及其中的消息将从你的对话历史中永久删除，且无法撤销。`,
          })}
        </p>
        {error ? (
          <p role="alert" style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>
            {error}
          </p>
        ) : null}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "flex-end" }}>
          <button
            autoFocus
            className="btn btn-secondary"
            disabled={pending}
            onClick={onCancel}
            type="button"
          >
            {t({ en: "Keep conversation", zh: "保留对话" })}
          </button>
          <button
            aria-busy={pending}
            className="btn btn-danger"
            data-orbit-agent-history-confirm-delete
            disabled={pending}
            onClick={onConfirm}
            type="button"
          >
            {pending
              ? t({ en: "Deleting…", zh: "正在删除…" })
              : t({ en: "Delete conversation", zh: "删除对话" })}
          </button>
        </div>
      </div>
    </div>
  );
}

function AgentMobileHistoryDrawer({
  activeQ,
  activeSessionId,
  history,
  language,
  groupMutationPending,
  groups,
  onClose,
  onDelete,
  onNavigate,
  onNewChat,
  onPick,
  onRename,
  onMove,
  onCreateGroup,
  onDeleteGroup,
  onFilterGroup,
  onNewInGroup,
  onRenameGroup,
  sessionGroups,
  onTogglePin,
  pendingSessionId,
}: {
  activeQ: string;
  activeSessionId: string | null;
  history: OrbitAgentHistoryView[];
  language: AgentHistoryLanguage;
  groupMutationPending: boolean;
  groups: readonly AiSessionGroupContract[];
  onClose: () => void;
  onDelete: (history: OrbitAgentHistoryView) => void;
  onNavigate: (href: string) => void;
  onNewChat: () => void;
  onPick: (history: OrbitAgentHistoryView) => void;
  onRename: (history: OrbitAgentHistoryView, title: string) => void;
  onMove: (history: OrbitAgentHistoryView, groupId: string | null) => void;
  onCreateGroup: (name: string) => void;
  onDeleteGroup: (group: AiSessionGroupContract) => void;
  onFilterGroup: (groupId: string | null) => void;
  onNewInGroup: (groupId: string) => void;
  onRenameGroup: (group: AiSessionGroupContract, name: string) => void;
  onTogglePin: (history: OrbitAgentHistoryView) => void;
  pendingSessionId: string | null;
  sessionGroups: readonly AiSessionGroupContract[];
}) {
  const { t } = useOrbitLanguage();
  const drawerRef = useOrbitModalA11y(onClose);

  return (
    <div
      className="orbit-mobile-only"
      data-orbit-agent-history-drawer
      role="presentation"
      style={{ inset: 0, position: "fixed", zIndex: ORBIT_Z.overlay }}
    >
      <div
        aria-hidden="true"
        onClick={onClose}
        style={{ backdropFilter: "blur(3px)", background: "var(--scrim)", inset: 0, position: "absolute" }}
      />
      <div
        aria-labelledby="orbit-agent-mobile-history-title"
        aria-modal="true"
        ref={drawerRef}
        role="dialog"
        style={{ animation: "slideInLeft .26s cubic-bezier(.22,1,.36,1)", background: "var(--bg)", bottom: 0, boxShadow: "var(--sh-pop)", display: "flex", flexDirection: "column", left: 0, maxWidth: 320, position: "absolute", top: 0, width: "84%" }}
        tabIndex={-1}
      >
        <div style={{ alignItems: "center", borderBottom: "1px solid var(--border)", display: "flex", flexShrink: 0, height: 54, padding: "0 14px" }}>
          <span id="orbit-agent-mobile-history-title" style={{ color: "var(--ink)", fontSize: 15, fontWeight: 600 }}>
            {t({ en: "Chat history", zh: "对话历史" })}
          </span>
          <div style={{ flex: 1 }} />
          <IconButton ariaLabel={t({ en: "Close", zh: "关闭" })} name="x" onClick={onClose} size={16} />
        </div>
        <div className="orbit-agent-history-actions">
          <button className="btn btn-block orbit-agent-new-chat" type="button" onClick={onNewChat}>
            <Icon name="plus" size={16} color="var(--accent)" />
            {t({ en: "New chat", zh: "新对话" })}
          </button>
        </div>
        <AgentChatHistoryOrganization
          busy={groupMutationPending}
          currentGroupId={null}
          groups={groups}
          language={language}
          onCreate={onCreateGroup}
          onDelete={onDeleteGroup}
          onFilter={onFilterGroup}
          onNew={onNewInGroup}
          onRename={onRenameGroup}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 0, padding: "0 12px 4px" }}>
          <div className="eyebrow" style={{ padding: "2px 8px 6px" }}>{t({ en: "Go to", zh: "前往" })}</div>
          {[
            ["/", "home", t({ en: "Home", zh: "首页" })],
            ["/explore", "calendar", t({ en: "Events", zh: "活动" })],
            ["/home/schedule", "clock", t({ en: "Calendar", zh: "日程" })],
            ["/home/cards", "wallet", t({ en: "Contacts", zh: "人脉" })],
          ].map(([href, icon, label]) => (
            <button
              className="btn btn-quiet"
              key={href}
              onClick={() => {
                onClose();
                onNavigate(href);
              }}
              style={{ height: "auto", justifyContent: "flex-start", padding: "9px 8px", width: "100%" }}
              type="button"
            >
              <Icon name={icon} size={17} color="var(--accent)" />
              {label}
            </button>
          ))}
          <div style={{ background: "var(--border)", height: 1, margin: "7px 8px 2px" }} />
          <div className="eyebrow" style={{ padding: "2px 8px 4px" }}>{t({ en: "Chat history", zh: "对话历史" })}</div>
        </div>
        <div className="scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "2px 8px 18px" }}>
          <AgentHistoryList
            activeQ={activeQ}
            activeSessionId={activeSessionId}
            history={history}
            onDelete={onDelete}
            onPick={onPick}
            onRename={onRename}
            onMove={onMove}
            onTogglePin={onTogglePin}
            pendingSessionId={pendingSessionId}
            sessionGroups={sessionGroups}
          />
        </div>
      </div>
    </div>
  );
}


function AgentChatComposer({
  busy,
  onChange,
  onSubmit,
  t,
  value,
}: {
  busy: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  t: Translate;
  value: string;
}) {
  return (
    <form
      aria-busy={busy}
      className="agent-chat-composer"
      data-orbit-agent-chat-composer
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <Icon color="var(--text-4)" name="message" size={16} />
      <input
        aria-label={t({
          en: "Ask Orbit about contacts, events, and relationship to-dos",
          zh: "询问 Orbit 人脉、活动与关系待办",
        })}
        data-orbit-agent-chat-input
        disabled={busy}
        onChange={(event) => onChange(event.target.value)}
        placeholder={t({ en: "Continue the conversation…", zh: "继续追问…" })}
        type="text"
        value={value}
      />
      <button
        aria-label={t({ en: "Send Ask Orbit message", zh: "发送给 Orbit" })}
        className="btn agent-chat-composer-submit hit-44"
        data-orbit-agent-submit="true"
        disabled={busy || !value.trim()}
        type="submit"
      >
        <Icon name="arrow" size={15} style={{ transform: "rotate(-45deg)" }} />
      </button>
    </form>
  );
}

function AgentWelcome({ onPick, viewModel }: { onPick: (query: string) => void; viewModel: OrbitAgentViewModel }) {
  const { language, t } = useOrbitLanguage();

  return (
    <div className="new-empty">
      <span className="mk"><AgentStar size={22} /></span>
      <h3>{t({ en: "What should iOrbit do for you?", zh: "你想让 iOrbit 做什么？" })}</h3>
      <p>
        {t({
          en: "It can see your events, registration answers, contacts and appointments — just say the goal.",
          zh: "它能看到你的活动、报名答案、人脉和约谈——直接说目标就行。",
        })}
      </p>
      <div className="chips">
        {viewModel.suggests.map((suggest) => (
          <button className="chip" key={suggest.label} onClick={() => onPick(suggest.q)} type="button">
            {agentSuggestLabel(suggest.label, language === "ja" ? "en" : language)}
          </button>
        ))}
      </div>
    </div>
  );
}

function useAgentInlineDraft(input: {
  contactId?: string;
  language: "en" | "zh";
  organization: string;
  recipientName: string;
}) {
  // handed = 用户点过「继续到草稿箱」。系统里没有真实的「已发送」信号（草稿箱
  // 只暂存、不发送），所以卡片能诚实记录的最远状态就是这次交接——没有它，
  // 主按钮会永远停在「起草跟进 N 件」，看起来像什么都没发生过。
  const [state, setState] = useState<"idle" | "generating" | "ready" | "handed" | "error">("idle");
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [handedAt, setHandedAt] = useState<string | null>(null);
  // 记住这份草稿生成时覆盖的事项。用户生成后又改了勾选时，UI 据此提示「重新生成」，
  // 而不是让「写进 3 件事」的标注和只写了 2 件事的正文悄悄不一致。
  const [generatedPurpose, setGeneratedPurpose] = useState<string | null>(null);

  const generate = async (purpose?: string) => {
    setState("generating");
    setErrorCode(null);
    setHandedAt(null);
    const result = await requestMessageDraft({ ...input, purpose });
    if (result.success === false) {
      setErrorCode(result.error.code);
      setState("error");
      return;
    }
    setSubject(result.data.subject);
    setBody(result.data.body);
    setGeneratedPurpose(purpose ?? null);
    setState("ready");
  };

  const markHanded = () => {
    setHandedAt(new Date().toISOString());
    setState("handed");
  };

  // 回执上的「查看草稿」：本地副本还在 state 里，翻回可编辑面板即可。
  const reopen = () => setState("ready");

  return { body, errorCode, generate, generatedPurpose, handedAt, markHanded, reopen, setBody, setSubject, state, subject };
}

function AgentInlineDraftResult({
  contactId,
  currentPurpose,
  draft,
  organization,
  recipientName,
  t,
}: {
  contactId?: string;
  currentPurpose?: string;
  draft: ReturnType<typeof useAgentInlineDraft>;
  organization: string;
  recipientName: string;
  t: Translate;
}) {
  const [copied, setCopied] = useState(false);

  if (draft.state === "error") {
    // 实测最常见的失败是 provider 20s 超时（MODEL_REQUEST_FAILED），重试一次即可。
    // 错误必须自带出路：说清发生了什么、该怎么办，并把「怎么办」做成旁边的按钮。
    const timedOut = draft.errorCode === "MODEL_REQUEST_FAILED";
    return (
      <div className="draft-error" data-agent-inline-draft-error data-agent-inline-draft-error-code={draft.errorCode ?? undefined} role="alert">
        <span className="w">
          <b>
            {timedOut
              ? t({ en: "Generation timed out — no draft was written", zh: "生成超时，草稿没有写出来" })
              : t({ en: "The draft could not be generated", zh: "草稿生成失败" })}
          </b>
          <span>
            {timedOut
              ? t({ en: "The model did not answer in time; retrying usually works. No external action was taken.", zh: "模型没有按时返回，通常重试一次即可。未执行任何外部动作。" })
              : t({ en: "Try again. No external action was taken.", zh: "请重试。未执行任何外部动作。" })}
          </span>
        </span>
        <button className="btn btn-ghost btn-sm" onClick={() => void draft.generate(currentPurpose)} type="button">
          {t({ en: "Retry", zh: "重试" })}
        </button>
      </div>
    );
  }
  if (draft.state === "handed") {
    // 交接回执：只声称实际发生的事（草稿转入了草稿箱），发送与否由用户在
    // 草稿箱决定——这里若写「已发送」就是在替系统撒谎。
    const handedTime = draft.handedAt
      ? new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" }).format(new Date(draft.handedAt))
      : "";
    return (
      <div className="draft-receipt" data-agent-inline-draft-receipt role="status">
        <span aria-hidden="true" className="draft-receipt-check">
          <Icon name="check" size={13} />
        </span>
        <span className="w">
          <b>{t({ en: `Moved to drafts${handedTime ? ` · ${handedTime}` : ""}`, zh: `已转入草稿箱${handedTime ? ` · ${handedTime}` : ""}` })}</b>
          <span>{t({ en: "Nothing was sent — you confirm the send in your drafts.", zh: "尚未发送任何内容，发送由你在草稿箱确认。" })}</span>
        </span>
        <span className="draft-receipt-acts">
          <button className="linkish" onClick={() => openRelationshipInbox()} type="button">
            {t({ en: "Open drafts", zh: "打开草稿箱" })}
          </button>
          <button className="linkish" onClick={() => draft.reopen()} type="button">
            {t({ en: "View draft", zh: "查看草稿" })}
          </button>
        </span>
      </div>
    );
  }
  if (draft.state !== "ready") return null;

  const stale = (draft.generatedPurpose ?? "") !== (currentPurpose ?? "");
  // 标注反映这份草稿**生成时**覆盖的事项数（从 purpose 的编号行数出来），
  // 不是当前勾选数——取消勾选后显示「写进 0 件事」就是在说假话。
  const writes = (draft.generatedPurpose?.match(/^\d+\./gm) ?? []).length;

  return (
    <div className="draft" data-agent-inline-draft>
      <p className="draft-label">
        {writes > 0
          ? t({ en: `Draft · covers ${writes} item(s)`, zh: `草稿 · 写进 ${writes} 件事` })
          : t({ en: "Editable follow-up draft", zh: "可编辑跟进草稿" })}
      </p>
      {stale ? (
        <p className="draft-stale">
          <span>{t({ en: "Your selection changed after this draft was written.", zh: "生成这份草稿后你改过勾选。" })}</span>
          <button className="linkish" onClick={() => void draft.generate(currentPurpose)} type="button">
            {t({ en: "Regenerate", zh: "重新生成" })}
          </button>
        </p>
      ) : null}
      <input aria-label={t({ en: "Subject", zh: "主题" })} className="draft-subj" onChange={(event) => draft.setSubject(event.target.value)} value={draft.subject} />
      <textarea aria-label={t({ en: "Message", zh: "正文" })} className="draft-body" onChange={(event) => draft.setBody(event.target.value)} rows={7} value={draft.body} />
      <div className="draft-foot">
        {/* 「邮件止于草稿」是产品红线：承诺和主按钮同级同框，不做灰色脚注。 */}
        <p className="draft-guard">
          <Icon name="lock" size={13} />
          <span>
            <b>{t({ en: "Draft only — not sent", zh: "仅草稿 · 未发送" })}</b>
            {t({ en: "Orbit never sends on your behalf. You confirm the send in your drafts.", zh: "Orbit 不会代你发送，发送由你在草稿箱确认。" })}
          </span>
        </p>
        <button
          className="btn btn-ghost btn-sm"
          disabled={!draft.subject.trim() || !draft.body.trim()}
          onClick={async () => setCopied(await copyAgentMessageText(`${draft.subject}\n\n${draft.body}`))}
          type="button"
        >
          <Icon name={copied ? "check" : "copy"} size={14} />
          {copied ? t({ en: "Copied", zh: "已复制" }) : t({ en: "Copy draft", zh: "复制草稿" })}
        </button>
        <button
          className="btn btn-primary btn-sm"
          disabled={!draft.subject.trim() || !draft.body.trim()}
          onClick={() => {
            openRelationshipInboxCompose({
              body: draft.body,
              contactId,
              organization,
              recipient: recipientName,
              subject: draft.subject,
            });
            // 交接即记录：卡片翻到回执态，主按钮同步降级为「重新起草」。
            draft.markHanded();
          }}
          type="button"
        >
          {t({ en: "Continue in drafts", zh: "继续到草稿箱" })}
        </button>
      </div>
    </div>
  );
}

// 结果行：设计稿 .panel / .p-person 的紧凑列表（home-console-green.html 对话页）。
// rank=0 是本次排序里的首选：只有它拿填充主按钮，其余降为次级按钮。一屏一个主 CTA
// 既是设计规范（primary-action），也让「为什么这条排第一」在视觉上可读。
function AgentPeopleRow({ item, language, navigate, rank, t }: { item: OrbitAgentPeopleResultView; language: "en" | "zh"; navigate: (href: string) => void; rank: number; t: Translate }) {
  const connection = item.connection;
  const draft = useAgentInlineDraft({
    contactId: connection.id,
    language,
    organization: connection.company,
    recipientName: connection.displayName,
  });
  const confidenceLabel = connection.industry?.trim() ?? "";

  return (
    <div className="p-person">
      <Avatar g={connection.g} letter={connection.initial} size={38} />
      <span className="w">
        <b>
          {connection.displayName}
          {confidenceLabel ? <em className="p-conf">{confidenceLabel}</em> : null}
        </b>
        <span>{[connection.title, connection.company].filter(Boolean).join(" · ")}</span>
      </span>
      <span className="p-acts">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/app/contacts/${connection.id}`)} type="button">
          {t({ en: "View", zh: "查看" })}
        </button>
        {(() => {
          const drafted = draft.state === "ready" || draft.state === "handed";
          const label =
            draft.state === "generating"
              ? t({ en: "Drafting…", zh: "正在生成…" })
              : drafted
                ? t({ en: "Redraft", zh: "重新起草" })
                : t({ en: "Generate follow-up draft", zh: "生成跟进草稿" });
          return (
            <button
              className={rank === 0 && !drafted ? "btn btn-primary btn-sm" : "btn btn-ghost btn-sm"}
              data-draft-state={draft.state}
              disabled={draft.state === "generating"}
              onClick={() => void draft.generate()}
              type="button"
            >
              <Icon name="sparkle" size={14} />
              <span className="swap" key={label}>{label}</span>
            </button>
          );
        })()}
      </span>
      {/* whyThisPerson：面向用户的「为什么是这个人」。c0835aff 收内部诊断时把它和
          item.opener 一起删了，卡片就退化成没有信息的按钮架子，依据只活在上方那段
          散文里，不可核也不可跳转。item.opener 是「证据片段：来源标签：原文」的原始
          拼接，属于 DESIGN.md 里明确不对普通用户展示的那一类，保持隐藏。 */}
      {item.reason ? <span className="why">{item.reason}</span> : null}
      <AgentInlineDraftResult contactId={connection.id} draft={draft} organization={connection.company} recipientName={connection.displayName} t={t} />
    </div>
  );
}

function AgentEventRow({ item, language, navigate, t }: { item: OrbitAgentEventResultView; language: "en" | "zh"; navigate: (href: string) => void; t: Translate }) {
  const event = item.event;
  const date = parseDate(event.startsAt);
  const weekday = date ? new Intl.DateTimeFormat(language === "en" ? "en-US" : "zh-CN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo", weekday: "short" }).format(date) : "";
  const dateLabel = date
    ? (language === "en" ? `${fmtMonth(date, language)} ${fmtDay(date, language)} · ${weekday}` : `${fmtMonth(date, language)}${fmtDay(date, language)}日 · ${weekday}`)
    : t({ en: "Time TBD", zh: "时间待定" });

  return (
    <div className="p-person">
      <EventCover g={gradientFromString(event.code)} imageAlt={event.name} imageSizes="38px" imageUrl={eventCoverPhoto(event.code)} monogram={eventCoverPhoto(event.code) ? null : { text: event.name.slice(0, 1), size: 15 }} style={{ borderRadius: "var(--r-sm)", flexShrink: 0, height: 38, width: 38 }} />
      <span className="w">
        <b>{event.name}</b>
        <span>{[dateLabel, event.place].filter(Boolean).join(" · ")}</span>
      </span>
      <span className="p-acts">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/events/${event.code}`)} type="button">
          {t({ en: "View", zh: "查看" })}
        </button>
      </span>
      {item.reason ? <span className="why">{item.reason}</span> : null}
      {item.howto ? <span className="why">{item.howto}</span> : null}
    </div>
  );
}



function AgentTodoRow({ group, language, navigate, rank, t }: { group: AgentTodoGroup; language: "en" | "zh"; navigate: (href: string) => void; rank: number; t: Translate }) {
  const promised = group.items.filter((item) => !isTodoLead(item));
  const leads = group.items.filter(isTodoLead);
  const [open, setOpen] = useState(false);
  // 默认勾选 = 按钮会写的事：有承诺勾承诺；只有线索时勾线索（否则按钮没有意义）。
  // 这个默认值因人而异，所以不写死在任何标签文案里——勾选框自己陈述。
  const [selected, setSelected] = useState<ReadonlySet<string>>(
    () => new Set((promised.length > 0 ? promised : group.items).map((item) => item.id)),
  );
  const draft = useAgentInlineDraft({
    contactId: group.contactId,
    language,
    organization: group.organization,
    recipientName: group.contactName,
  });
  const chosen = group.items.filter((item) => selected.has(item.id));
  const purpose = draftPurposeFor(chosen, language);
  const dueAt = earliestTodoDueAt(group.items);
  const due = dueAt ? todoDueLabel(dueAt, language) : null;
  const summary = [
    promised.length > 0 ? t({ en: `${promised.length} to-do(s)`, zh: `${promised.length} 件待办` }) : "",
    leads.length > 0 ? t({ en: `${leads.length} lead(s)`, zh: `${leads.length} 条线索` }) : "",
  ]
    .filter(Boolean)
    .join(" · ");

  const viewContact = () => {
    if (group.contactId) {
      navigate(`/app/contacts/${group.contactId}`);
      return;
    }
    navigate(`/app/contacts?query=${encodeURIComponent(group.contactName)}`);
  };

  const toggleItem = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const renderItem = (item: OrbitAgentTodoResultView) => {
    const checked = selected.has(item.id);
    const lead = isTodoLead(item);
    // 承诺项的第二行是任务说明；线索项的第二行是证据文本（活动名等，文本退化，
    // 可点跳转排到 evidenceId→href 映射建好之后）。
    const detail = lead ? item.reason || item.task : item.task !== item.title ? item.task : "";
    const inputId = `agent-todo-${item.id.replace(/[^\w-]/g, "-")}`;

    return (
      <li className="todo-item" key={item.id}>
        <input checked={checked} className="todo-check" id={inputId} onChange={() => toggleItem(item.id)} type="checkbox" />
        <label className={checked ? "t" : "t t-off"} htmlFor={inputId}>{item.title}</label>
        {detail ? <span className="d">{detail}</span> : null}
      </li>
    );
  };

  return (
    <article className="todo-card">
      <div className="todo-head">
        <Avatar g={gradientFromString(group.contactName || group.key)} letter={(group.contactName || group.key).slice(0, 1).toUpperCase()} size={34} />
        <span className="todo-who">
          <b>{group.contactName}</b>
          <span className="todo-sub">{group.organization}</span>
          <button aria-controls={`agent-todo-detail-${rank}`} aria-expanded={open} className="todo-peek" onClick={() => setOpen((value) => !value)} type="button">
            <svg aria-hidden="true" className="todo-tri" fill="currentColor" height="9" viewBox="0 0 12 12" width="9"><path d="M4 2l5 4-5 4z" /></svg>
            {open ? t({ en: "Collapse", zh: "收起" }) : summary}
          </button>
        </span>
        <span className="todo-side">
          {due ? <span className={due.soon ? "todo-due soon" : "todo-due"}>{due.label}</span> : null}
          {(() => {
            // 起草之后按钮必须换脸：一是回答「刚才发生了什么」（已有草稿/已交接），
            // 二是把主按钮让给面板里的「继续到草稿箱」——一张卡只留一个主 CTA。
            const drafted = draft.state === "ready" || draft.state === "handed";
            const label =
              draft.state === "generating"
                ? t({ en: "Drafting…", zh: "正在生成…" })
                : drafted
                  ? t({ en: "Redraft", zh: "重新起草" })
                  : chosen.length === 0
                    ? t({ en: "Select items first", zh: "先选要写的事" })
                    : t({ en: `Generate follow-up draft (${chosen.length})`, zh: `起草跟进 ${chosen.length} 件` });
            return (
              <button
                className={rank === 0 && !drafted ? "btn btn-primary btn-sm" : "btn btn-ghost btn-sm"}
                data-draft-state={draft.state}
                disabled={draft.state === "generating" || chosen.length === 0}
                onClick={() => void draft.generate(purpose)}
                type="button"
              >
                <Icon name="sparkle" size={14} />
                <span className="swap" key={label}>{label}</span>
              </button>
            );
          })()}
        </span>
      </div>
      {open ? (
        <div className="todo-detail" id={`agent-todo-detail-${rank}`}>
          {promised.length > 0 ? <ul className="todo-items">{promised.map(renderItem)}</ul> : null}
          {leads.length > 0 ? (
            <>
              <p className="todo-zone">{t({ en: "Leads the system found", zh: "系统发现的线索" })}</p>
              <ul className="todo-items">{leads.map(renderItem)}</ul>
            </>
          ) : null}
          <button className="linkish todo-view" onClick={viewContact} type="button">
            {t({ en: "View contact", zh: "查看联系人" })}
          </button>
        </div>
      ) : null}
      <AgentInlineDraftResult contactId={group.contactId} currentPurpose={purpose} draft={draft} organization={group.organization} recipientName={group.contactName} t={t} />
    </article>
  );
}

function PanelCards({ language, navigate, panel, t }: { language: "en" | "zh"; navigate: (href: string) => void; panel: AgentPanel; t: Translate }) {
  const [showAll, setShowAll] = useState(false);
  const initialLimit = panel.kind === "people" ? 3 : panel.items.length;
  const visibleItems = showAll ? panel.items : panel.items.slice(0, initialLimit);
  const hiddenCount = panel.items.length - visibleItems.length;

  if (panel.kind === "todos") {
    // 跟进队列不再套「面板标题栏 + 计数」外壳：结论行由即将渲染的卡片数据直接
    // 生成（永远不会和卡片打架），卡片按最早到期排序——模型的判断以排序体现，
    // 不以「建议先推进谁」的句子体现。
    const groups = [...groupTodosByContact(panel.items.filter(isTodoResult))].sort((a, b) =>
      (earliestTodoDueAt(a.items) ?? "9999").localeCompare(earliestTodoDueAt(b.items) ?? "9999"),
    );
    return (
      <div className="todo-stack" data-agent-todo-stack>
        <p className="todo-verdict">
          {t({
            en: `${groups.length} contact(s) have follow-ups waiting on you.`,
            zh: `${groups.length} 位联系人有待跟进的事。`,
          })}
        </p>
        {groups.map((group, index) => (
          <AgentTodoRow group={group} key={group.key} language={language} navigate={navigate} rank={index} t={t} />
        ))}
      </div>
    );
  }

  const meta =
    panel.kind === "people"
      ? t({ en: `${panel.items.length} people`, zh: `${panel.items.length} 位` })
      : t({ en: `${panel.items.length} events`, zh: `${panel.items.length} 场` });

  return (
    <div className="panel">
      <div className="panel-head">
        <Icon color="var(--accent)" name={panel.kind === "people" ? "users" : "calendar"} size={14} />
        <b>{panel.panelTitle}</b>
        <span className="meta">{meta}</span>
      </div>
      <div className="panel-body">
        {visibleItems.map((item, index) =>
          isPeopleResult(item) ? (
            <AgentPeopleRow key={item.connection.id || `${item.connection.displayName}-${index}`} item={item} language={language} navigate={navigate} rank={index} t={t} />
          ) : isTodoResult(item) ? null : (
            <AgentEventRow key={`${item.event.code}-${index}`} item={item} language={language} navigate={navigate} t={t} />
          ),
        )}
        {panel.kind === "people" && panel.items.length > initialLimit ? (
          <button
            className="btn btn-ghost btn-sm"
            data-agent-recommendations-toggle
            onClick={() => setShowAll((value) => !value)}
            style={{ marginTop: 8 }}
            type="button"
          >
            {showAll
              ? t({ en: "Show top 3 only", zh: "只看前三位" })
              : t({ en: `View ${hiddenCount} more`, zh: `查看另外 ${hiddenCount} 位` })}
          </button>
        ) : null}
      </div>
    </div>
  );
}


// 设计稿的四角星标（home-console-green.html 中 iOrbit 的品牌记号）。
export function AgentStar({ size = 15 }: { size?: number }) {
  return (
    <svg aria-hidden fill="currentColor" height={size} viewBox="0 0 24 24" width={size}>
      <path d="M12 2l1.9 5.8L20 9.7l-5 3.9 1.7 6.1L12 16.4l-4.7 3.3L9 13.6 4 9.7l6.1-1.9L12 2z" />
    </svg>
  );
}

function ThinkingIndicator({ t }: { t: Translate }) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    // 组件仅在 thinking=true 时挂载，所以挂载即等待开始；到最后一个阶段就停。
    const timer = window.setInterval(() => {
      setPhase((current) =>
        current >= THINKING_PHASES.length - 1 ? current : current + 1,
      );
    }, THINKING_PHASE_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <span aria-live="polite" className="thinking orbit-agent-thinking-indicator" style={{ display: "inline-grid", gap: 4 }}>
      <span><span className="sp" />{t(THINKING_PHASES[phase])}</span>
      <span style={{ color: "var(--text-3)", fontSize: 12 }}>
        {t({ en: "Usually under a minute · no external action is being taken", zh: "通常不到一分钟 · 当前不会执行任何外部动作" })}
      </span>
    </span>
  );
}


/* ═══ 工作台整页样式：docs/designs/journey/home-console-green.html 1:1 迁移，
   全部限定在 [data-orbit-real-page="agent"] 作用域内。═══ */
const CONSOLE_STYLES = `
[data-orbit-real-page="agent"] {
  --sidebar-w: ${ORBIT_LEFT_SIDEBAR_WIDTH}px;
  --agent-body-size: 15px;
  --console-tight: 'Inter Tight', Inter, system-ui, -apple-system, 'PingFang SC', sans-serif;
  --glass: rgba(255,255,255,.66);
  --glass-border: #dbe7e4;
  --text-3: #687078;
  --text-4: #687078;
  font-size: 15px;
  line-height: 1.65;
}
[data-orbit-real-page="agent"] .hide { display: none !important; }
[data-orbit-real-page="agent"] .h-display { font-family: var(--console-tight); font-weight: 600; letter-spacing: 0; line-height: 1.02; color: var(--ink); }
[data-orbit-real-page="agent"] .eyebrow { font-size: 11px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--text-3); }
[data-orbit-real-page="agent"] .glass { background: var(--glass); border: 1px solid var(--glass-border); border-radius: var(--r-md); backdrop-filter: blur(18px) saturate(150%); -webkit-backdrop-filter: blur(18px) saturate(150%); box-shadow: inset 0 1px 0 rgba(255,255,255,.9); }
[data-orbit-real-page="agent"] .ai-chip { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; padding: 3px 9px; border-radius: var(--r-pill); background: var(--accent-soft); color: var(--accent-press); }
[data-orbit-real-page="agent"] .badge { display: inline-flex; align-items: center; gap: 5px; height: 24px; padding: 0 9px; border-radius: var(--r-pill); font-size: 12px; font-weight: 600; white-space: nowrap; }
[data-orbit-real-page="agent"] .badge-ok { background: var(--live-soft); color: var(--live-text, #0E7A3C); }
[data-orbit-real-page="agent"] .badge-wait { background: var(--amber-soft); color: var(--amber-text, #8A5A00); }
[data-orbit-real-page="agent"] .badge-muted { background: var(--surface-2); color: var(--text-2); border: 1px solid var(--border); }
[data-orbit-real-page="agent"] .chip { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 12px; border-radius: var(--r-pill); font-size: 13px; font-weight: 500; background: var(--surface-2); color: var(--text-2); border: 1px solid transparent; white-space: nowrap; transition: background .14s, color .14s, border-color .14s; cursor: pointer; }
[data-orbit-real-page="agent"] .chip:hover { color: var(--accent-press); border-color: var(--accent); background: var(--surface); }
[data-orbit-real-page="agent"] .avatar.avatar { font-family: var(--console-tight); background: linear-gradient(140deg, var(--av-a, #2E8A93), var(--av-b, #0e4b52)); box-shadow: none; color: #fff; border: 0; display: inline-flex; align-items: center; justify-content: center; border-radius: 999px; font-weight: 600; flex-shrink: 0; }
[data-orbit-real-page="agent"] .avatar.avatar .avatar-letter { color: #fff; }
[data-orbit-real-page="agent"] .avatar.avatar .avatar-orbit { display: none; }
[data-orbit-real-page="agent"] .g-teal { --av-a:#2E8A93; --av-b:#0e4b52; }
[data-orbit-real-page="agent"] .g-slate { --av-a:#7d92ad; --av-b:#40536b; }
[data-orbit-real-page="agent"] .g-sand { --av-a:#c39a63; --av-b:#8a6b3a; }
[data-orbit-real-page="agent"] .g-moss { --av-a:#6ba585; --av-b:#3f7d5c; }
[data-orbit-real-page="agent"] .g-plum { --av-a:#a487a0; --av-b:#7a5a74; }

/* ═══ 骨架 ═══ */
[data-orbit-real-page="agent"] .ws-body { display: flex; flex: 1; min-height: 0; }
[data-orbit-real-page="agent"] .agent-history.agent-history { background: #fafbfb !important; border-right: 1px solid var(--border); display: flex; flex-direction: column; flex-shrink: 0; }
[data-orbit-real-page="agent"] .agent-history-actions { padding: 12px 12px 10px; }
[data-orbit-real-page="agent"] .orbit-agent-new-chat { align-items: center; background: var(--accent-softer); border: 1px solid transparent; border-radius: 9px; color: var(--ink); font-size: 14px; font-weight: 650; gap: 9px; height: 40px; justify-content: flex-start; padding: 0 12px; width: 100%; display: inline-flex; cursor: pointer; }
[data-orbit-real-page="agent"] .orbit-agent-new-chat:hover { background: var(--accent-soft); border-color: rgba(23,106,115,.2); }
[data-orbit-real-page="agent"] .agent-history-heading { padding: 8px 16px 10px; }
[data-orbit-real-page="agent"] .agent-history-scroll { flex: 1; min-height: 0; overflow-y: auto; padding: 0 8px 12px; }
[data-orbit-real-page="agent"] .orbit-agent-history-group { padding: 12px 10px 4px; font-size: 10.5px; }
[data-orbit-real-page="agent"] .ws-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
[data-orbit-real-page="agent"] .ws-scroll { flex: 1; min-height: 0; overflow-y: auto; }
/* 底部留白跟着全局提问输入框走：它是 fixed 的，不占文档流，展开时要主动让位，
   收起时 --orbit-ask-clearance 归 0，只留小球的余量。 */
[data-orbit-real-page="agent"] .ws-inner { max-width: 900px; margin: 0 auto; padding: 30px 32px calc(32px + var(--orbit-ask-clearance, 0px)); }

/* ═══ Dashboard ═══ */
[data-orbit-real-page="agent"] .hub-head { align-items: center; display: flex; gap: 18px; flex-wrap: wrap; }
[data-orbit-real-page="agent"] .hub-head .avatar { font-size: 26px !important; }
[data-orbit-real-page="agent"] .hub-head .who { flex: 1; min-width: 220px; }
[data-orbit-real-page="agent"] .hub-head h1 { font-size: 28px; margin: 0; }
[data-orbit-real-page="agent"] .hub-head .sub { color: var(--text-2); font-size: 14.5px; margin-top: 5px; }
[data-orbit-real-page="agent"] .hub-stats { background: var(--surface-2); border: 1px solid var(--border); border-radius: 16px; display: flex; gap: 30px; margin-top: 18px; padding: 14px 20px; flex-wrap: wrap; }
[data-orbit-real-page="agent"] .hub-stats .v { color: var(--ink); font-family: var(--console-tight); font-size: 24px; font-weight: 600; line-height: 1.1; }
[data-orbit-real-page="agent"] .hub-stats .k { color: var(--text-3); font-size: 12.5px; margin-top: 1px; }
[data-orbit-real-page="agent"] .brief { position: relative; overflow: hidden; border-radius: var(--r-lg); border: 1px solid var(--border); padding: 20px; margin-top: 18px;
  background: radial-gradient(64% 100% at 90% 0%, rgba(23,106,115,.13), transparent 58%), radial-gradient(48% 80% at 2% 100%, rgba(180,83,9,.07), transparent 58%), var(--accent-softer); }
[data-orbit-real-page="agent"] .brief-head { display: flex; align-items: center; gap: 9px; margin-bottom: 4px; flex-wrap: wrap; }
[data-orbit-real-page="agent"] .brief-mark { width: 28px; height: 28px; border-radius: 9px; background: var(--accent); color: #fff; display: grid; place-items: center; }
[data-orbit-real-page="agent"] .brief-head b { font-family: var(--console-tight); font-size: 15px; color: var(--ink); font-weight: 600; }
[data-orbit-real-page="agent"] .brief-head .st { font-size: 12px; color: var(--text-3); }
[data-orbit-real-page="agent"] .brief-lede { font-size: 14.5px; color: var(--text-2); margin: 0 0 13px; max-width: 62ch; line-height: 1.72; }
[data-orbit-real-page="agent"] .brief-lede b { color: var(--ink); }
[data-orbit-real-page="agent"] .brief-action-list { display: grid; gap: 9px; margin-bottom: 10px; }
[data-orbit-real-page="agent"] .brief-action-row { align-items: center; display: grid; gap: 12px; grid-template-columns: 32px minmax(0, 1fr) minmax(220px, 268px) 32px; min-height: 64px; overflow: visible; padding: 10px 11px; }
[data-orbit-real-page="agent"] .brief-action-index { align-items: center; align-self: center; background: var(--accent-soft); border: 1px solid rgba(23,106,115,.18); border-radius: 9px; color: var(--accent-press); display: inline-flex; font-family: var(--console-tight); font-size: 13px; font-weight: 700; height: 30px; justify-content: center; width: 30px; }
[data-orbit-real-page="agent"] .brief-action-copy { min-width: 0; }
[data-orbit-real-page="agent"] .brief-action-copy b { color: var(--ink); display: block; font-size: 14px; font-weight: 650; line-height: 1.35; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
[data-orbit-real-page="agent"] .brief-action-context { color: var(--text-3); display: block; font-size: 12.5px; line-height: 1.45; margin-top: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
[data-orbit-real-page="agent"] .brief-action-buttons { display: grid; gap: 7px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
[data-orbit-real-page="agent"] .brief-action-buttons .btn { justify-content: center; min-width: 0; padding-inline: 10px; width: 100%; }
[data-orbit-real-page="agent"] .brief-action-buttons .btn span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
[data-orbit-real-page="agent"] .brief-action-button-spacer { min-height: 32px; }
[data-orbit-real-page="agent"] .brief-action-more { height: 32px; position: relative; width: 32px; }
[data-orbit-real-page="agent"] .brief-action-more > summary { align-items: center; border-radius: 8px; color: var(--text-3); cursor: pointer; display: flex; height: 32px; justify-content: center; list-style: none; width: 32px; }
[data-orbit-real-page="agent"] .brief-action-more > summary::-webkit-details-marker { display: none; }
[data-orbit-real-page="agent"] .brief-action-more > summary:hover { background: rgba(255,255,255,.7); color: var(--ink); }
[data-orbit-real-page="agent"] .brief-action-more > div { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-sm); box-shadow: var(--shadow-md); display: grid; min-width: 132px; overflow: hidden; padding: 5px; position: absolute; right: 0; top: 36px; z-index: 5; }
[data-orbit-real-page="agent"] .brief-action-more > div button { background: none; border: 0; border-radius: 7px; color: var(--text-2); cursor: pointer; font: inherit; font-size: 12.5px; padding: 8px 10px; text-align: left; }
[data-orbit-real-page="agent"] .brief-action-more > div button:hover { background: var(--surface-2); color: var(--ink); }
[data-orbit-real-page="agent"] .brief-action-row.is-complete { opacity: .68; }
[data-orbit-real-page="agent"] .brief-action-row.is-complete .brief-action-index { background: var(--live-soft); border-color: rgba(22,101,52,.16); color: var(--live-text); }
[data-orbit-real-page="agent"] .brief-refresh { display: inline-flex; align-items: center; gap: 5px; font-size: 11.5px; color: var(--text-4); background: none; border: 0; cursor: pointer; padding: 2px 0; margin-bottom: 10px; }
[data-orbit-real-page="agent"] .brief-refresh:hover { color: var(--text-2); }
[data-orbit-real-page="agent"] .brief-input { display: flex; align-items: center; gap: 10px; padding: 5px 5px 5px 16px; border-radius: var(--r-md); }
[data-orbit-real-page="agent"] .brief-input input { flex: 1; border: 0; background: none; font: inherit; font-size: 14.5px; color: var(--text); min-height: 38px; outline: none; min-width: 0; }
[data-orbit-real-page="agent"] .brief-input input::placeholder { color: var(--text-4); transition: opacity .2s; }
[data-orbit-real-page="agent"] .brief-send { width: 38px; height: 38px; border-radius: var(--r-sm); background: var(--accent); color: #fff; display: grid; place-items: center; transition: background .15s, transform .08s; border: 0; cursor: pointer; }
[data-orbit-real-page="agent"] .brief-send:hover { background: var(--accent-hover); }
[data-orbit-real-page="agent"] .brief-send:active { transform: scale(.95); }
[data-orbit-real-page="agent"] .brief-chips { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 11px; }
[data-orbit-real-page="agent"] .brief-note { font-size: 11.5px; color: var(--text-4); margin: 11px 0 0; }
[data-orbit-real-page="agent"] .sec-title { display: flex; align-items: baseline; gap: 10px; margin: 26px 0 11px; }
[data-orbit-real-page="agent"] .sec-title h2 { font-family: var(--console-tight); font-size: 16.5px; font-weight: 600; color: var(--ink); margin: 0; }
[data-orbit-real-page="agent"] .sec-title span { font-size: 12.5px; color: var(--text-4); }
[data-orbit-real-page="agent"] .appt { display: grid; grid-template-columns: auto 1fr; gap: 18px; padding: 17px 19px; }
[data-orbit-real-page="agent"] .appt-when { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 11px 15px; background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--r-md); align-self: start; min-width: 100px; }
[data-orbit-real-page="agent"] .appt-when .d { font-family: var(--console-tight); font-size: 20px; font-weight: 600; color: var(--ink); line-height: 1.1; }
[data-orbit-real-page="agent"] .appt-when .t { font-size: 13px; font-weight: 600; color: var(--accent-press); }
[data-orbit-real-page="agent"] .appt-when .len { font-size: 11px; color: var(--text-3); font-family: var(--ff-mono); }
[data-orbit-real-page="agent"] .appt-when .in { font-size: 11px; font-weight: 600; color: var(--amber-text, #8A5A00); background: var(--amber-soft); border-radius: var(--r-pill); padding: 1px 9px; margin-top: 5px; }
[data-orbit-real-page="agent"] .appt-main { min-width: 0; }
[data-orbit-real-page="agent"] .appt-title-row { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; }
[data-orbit-real-page="agent"] .appt-title-row b { font-size: 15.5px; font-weight: 600; color: var(--ink); }
[data-orbit-real-page="agent"] .appt-who { display: flex; align-items: center; gap: 11px; margin-top: 10px; }
[data-orbit-real-page="agent"] .appt-actions { display: flex; gap: 9px; margin-top: 12px; flex-wrap: wrap; }
[data-orbit-real-page="agent"] .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 13px; }
[data-orbit-real-page="agent"] .act { padding: 16px 17px; display: flex; flex-direction: column; gap: 9px; transition: border-color .15s; }
[data-orbit-real-page="agent"] .act:hover { border-color: var(--border-2); }
[data-orbit-real-page="agent"] .act.span2 { grid-column: span 2; }
[data-orbit-real-page="agent"] .act-top { display: flex; align-items: center; gap: 10px; }
[data-orbit-real-page="agent"] .act-ic { width: 34px; height: 34px; border-radius: 9px; display: grid; place-items: center; flex: 0 0 auto; }
[data-orbit-real-page="agent"] .ic-teal { background: var(--accent-soft); color: var(--accent); }
[data-orbit-real-page="agent"] .ic-green { background: var(--live-soft); color: var(--live-text, #0E7A3C); }
[data-orbit-real-page="agent"] .ic-amber { background: var(--amber-soft); color: var(--amber-text, #8A5A00); }
[data-orbit-real-page="agent"] .ic-gray { background: var(--surface-2); color: var(--text-2); border: 1px solid var(--border); }
[data-orbit-real-page="agent"] .act-top b { font-size: 15px; color: var(--ink); font-weight: 600; }
[data-orbit-real-page="agent"] .act-badge { margin-left: auto; font-size: 11px; font-weight: 700; background: var(--signal, #C8323B); color: #fff; min-width: 20px; height: 20px; border-radius: var(--r-pill); display: inline-grid; place-items: center; padding: 0 6px; }
[data-orbit-real-page="agent"] .act p { font-size: 13.5px; color: var(--text-2); flex: 1; margin: 0; }
[data-orbit-real-page="agent"] .act p b { color: var(--ink); font-weight: 600; }
[data-orbit-real-page="agent"] .act .btn { align-self: flex-start; }
[data-orbit-real-page="agent"] .act.ai { border-color: var(--glass-border); background: radial-gradient(80% 120% at 100% 0%, rgba(23,106,115,.1), transparent 55%), var(--glass); backdrop-filter: blur(18px) saturate(150%); -webkit-backdrop-filter: blur(18px) saturate(150%); }
[data-orbit-real-page="agent"] .act .ai-chip { margin-left: auto; }
[data-orbit-real-page="agent"] .stage-row { display: flex; align-items: center; flex-wrap: wrap; row-gap: 6px; }
[data-orbit-real-page="agent"] .stage { display: flex; align-items: center; }
[data-orbit-real-page="agent"] .stage .s-dot { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 600; color: var(--text-3); background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--r-pill); padding: 4px 11px; }
[data-orbit-real-page="agent"] .stage.done .s-dot { color: var(--live-text, #0E7A3C); background: var(--live-soft); border-color: transparent; }
[data-orbit-real-page="agent"] .stage.now .s-dot { color: #fff; background: var(--accent); border-color: transparent; }
[data-orbit-real-page="agent"] .stage .s-link { width: 14px; height: 1.5px; background: var(--border-2); }
[data-orbit-real-page="agent"] .journeys { overflow: hidden; }
[data-orbit-real-page="agent"] .j-row { width: 100%; text-align: left; display: flex; align-items: center; gap: 14px; padding: 14px 18px; transition: background .15s; background: none; border: 0; cursor: pointer; font: inherit; color: inherit; }
[data-orbit-real-page="agent"] .j-row:hover { background: var(--accent-softer); }
[data-orbit-real-page="agent"] .j-row + .j-row { border-top: 1px solid var(--border); }
[data-orbit-real-page="agent"] .j-date { width: 42px; border-radius: var(--r-sm); overflow: hidden; text-align: center; flex: 0 0 auto; background: var(--surface-3); border: 1px solid var(--border); }
[data-orbit-real-page="agent"] .j-date .m { display: block; font-size: 10px; font-weight: 600; color: var(--text-2); padding: 2px 0 0; }
[data-orbit-real-page="agent"] .j-date .d { display: block; font-family: var(--console-tight); font-weight: 600; font-size: 15px; color: var(--ink); padding: 0 0 3px; }
[data-orbit-real-page="agent"] .j-main { flex: 1; min-width: 0; }
[data-orbit-real-page="agent"] .j-main b { display: block; font-size: 14.5px; color: var(--ink); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
[data-orbit-real-page="agent"] .j-main span { font-size: 12.5px; color: var(--text-2); }
[data-orbit-real-page="agent"] .j-arrow { color: var(--text-4); flex: 0 0 auto; }

/* ═══ 对话页 ═══ */
[data-orbit-real-page="agent"] .thread-bar { display: flex; align-items: center; gap: 12px; margin-bottom: 22px; }
[data-orbit-real-page="agent"] .btn-back { width: 34px; height: 34px; border-radius: var(--r-sm); border: 1px solid var(--border-2); background: var(--surface); color: var(--text-2); display: grid; place-items: center; flex: 0 0 auto; transition: border-color .15s, color .15s, background .15s; cursor: pointer; }
[data-orbit-real-page="agent"] .btn-back:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-softer); }
[data-orbit-real-page="agent"] .thread-bar .title { font-family: var(--console-tight); font-size: 16px; font-weight: 600; color: var(--ink); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
[data-orbit-real-page="agent"] .thread-bar .when { font-size: 12px; color: var(--text-4); font-family: var(--ff-mono); margin-left: auto; flex: 0 0 auto; }
[data-orbit-real-page="agent"] .agent-chat-composer-dock { background: var(--bg-soft); border-top: 1px solid var(--border); flex: 0 0 auto; padding: 12px 32px 16px; }
[data-orbit-real-page="agent"] .agent-chat-composer { align-items: center; background: var(--surface); border: 1px solid var(--border-2); border-radius: var(--r-md); display: flex; gap: 10px; margin: 0 auto; max-width: 900px; padding: 5px 5px 5px 16px; }
[data-orbit-real-page="agent"] .agent-chat-composer:focus-within { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
[data-orbit-real-page="agent"] .agent-chat-composer input { background: none; border: 0; color: var(--text); flex: 1; font: inherit; font-size: 14.5px; min-height: 38px; min-width: 0; outline: none; }
[data-orbit-real-page="agent"] .agent-chat-composer input::placeholder { color: var(--text-4); }
[data-orbit-real-page="agent"] .agent-chat-composer-submit { align-items: center; background: var(--accent); border: 0; border-radius: 50%; color: #fff; display: flex; flex: 0 0 auto; height: 36px; justify-content: center; transition: background .15s, transform .08s; width: 36px; }
[data-orbit-real-page="agent"] .agent-chat-composer-submit:hover:not(:disabled) { background: var(--accent-hover); }
[data-orbit-real-page="agent"] .agent-chat-composer-submit:active:not(:disabled) { transform: scale(.94); }
[data-orbit-real-page="agent"] .agent-chat-composer-submit:disabled { background: var(--surface-3); color: var(--text-4); cursor: default; }
[data-orbit-real-page="agent"] .thread { display: flex; flex-direction: column; gap: 20px; }
[data-orbit-real-page="agent"] .msg-user-row { align-self: flex-end; max-width: 78%; display: flex; align-items: flex-end; gap: 8px; }
[data-orbit-real-page="agent"] .msg-user-row .orbit-agent-message-copy { opacity: 0; transition: opacity .15s; }
[data-orbit-real-page="agent"] .msg-user-row:hover .orbit-agent-message-copy { opacity: 1; }
[data-orbit-real-page="agent"] .msg-user { background: var(--accent-soft); color: var(--ink); border-radius: var(--r-md) var(--r-md) 4px var(--r-md); padding: 11px 15px; font-size: var(--agent-body-size); }
[data-orbit-real-page="agent"] .msg-a { display: flex; gap: 12px; }
[data-orbit-real-page="agent"] .msg-a .mk { width: 28px; height: 28px; border-radius: 9px; background: var(--accent); color: #fff; display: grid; place-items: center; flex: 0 0 auto; margin-top: 2px; }
[data-orbit-real-page="agent"] .msg-a .body { flex: 1; min-width: 0; }
[data-orbit-real-page="agent"] .msg-a .body .orbit-agent-markdown { font-size: var(--agent-body-size); color: var(--text); line-height: 1.7; }
[data-orbit-real-page="agent"] .msg-note { align-items: center; background: var(--amber-soft); border-radius: var(--r-sm); color: var(--amber-text, #8A5A00); display: inline-flex; font-size: 13px; font-weight: 600; gap: 8px; margin-bottom: 10px; padding: 7px 12px; }
[data-orbit-real-page="agent"] .msg-tools { display: flex; justify-content: flex-end; margin-top: 8px; opacity: 0; transition: opacity .15s; }
[data-orbit-real-page="agent"] .msg-a:hover .msg-tools { opacity: 1; }
[data-orbit-real-page="agent"] .thinking { display: flex; align-items: center; gap: 8px; font-size: 13.5px; color: var(--text-3); }
[data-orbit-real-page="agent"] .thinking .sp { width: 14px; height: 14px; border-radius: 50%; border: 2px solid var(--border-2); border-top-color: var(--accent); animation: orbit-agent-spin .8s linear infinite; }
@keyframes orbit-agent-spin { to { transform: rotate(360deg); } }
[data-orbit-real-page="agent"] .new-empty { text-align: center; padding: 60px 0 20px; }
[data-orbit-real-page="agent"] .new-empty .mk { width: 46px; height: 46px; border-radius: var(--r-md); background: var(--accent); color: #fff; display: grid; place-items: center; margin: 0 auto 14px; }
[data-orbit-real-page="agent"] .new-empty h3 { font-family: var(--console-tight); font-size: 20px; font-weight: 600; color: var(--ink); margin: 0; }
[data-orbit-real-page="agent"] .new-empty p { font-size: 14px; color: var(--text-2); margin: 6px 0 0; }
[data-orbit-real-page="agent"] .new-empty .chips { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; margin-top: 18px; }
[data-orbit-real-page="agent"] .panel { margin-top: 13px; border: 1px solid var(--border); border-radius: var(--r-md); overflow: hidden; background: var(--surface); }
[data-orbit-real-page="agent"] .panel-head { display: flex; align-items: center; gap: 8px; padding: 10px 14px; background: var(--surface-2); border-bottom: 1px solid var(--border); }
[data-orbit-real-page="agent"] .panel-head b { font-size: 13px; color: var(--ink); font-weight: 600; }
[data-orbit-real-page="agent"] .panel-head .meta { font-size: 12px; color: var(--text-3); margin-left: auto; }
[data-orbit-real-page="agent"] .panel-body { padding: 6px 14px 12px; }
[data-orbit-real-page="agent"] .p-person { display: flex; align-items: center; gap: 11px; padding: 11px 0; flex-wrap: wrap; }
[data-orbit-real-page="agent"] .p-person + .p-person { border-top: 1px dashed var(--border-2); }
[data-orbit-real-page="agent"] .p-person .w { flex: 1; min-width: 160px; }
[data-orbit-real-page="agent"] .p-person .w b { display: block; font-size: 14px; color: var(--ink); font-weight: 600; }
[data-orbit-real-page="agent"] .p-person .w span { font-size: 12.5px; color: var(--text-2); }
[data-orbit-real-page="agent"] .p-person .why { flex-basis: 100%; font-size: 13px; color: var(--text-2); background: var(--surface-2); border-left: 2px solid var(--accent); padding: 8px 12px; border-radius: 0 var(--r-sm) var(--r-sm) 0; }
[data-orbit-real-page="agent"] .p-person .w b .p-conf { font-style: normal; font-size: 11px; font-weight: 600; color: var(--accent); background: var(--accent-softer); border-radius: var(--r-pill); padding: 2px 7px; margin-left: 7px; vertical-align: 1px; }
[data-orbit-real-page="agent"] .p-acts { display: flex; gap: 8px; }
/* ═══ 跟进队列（按人分组卡片）与内联草稿 ═══
   产品字号只有三级：--t-lead 人名/结论/主题，--t-base 事项/说明/正文/按钮，
   --t-meta 一切次级。层级由字重（600/400）和颜色（ink/muted）承担，
   不允许出现第四个字号数值。 */
[data-orbit-real-page="agent"] { --t-lead: 15px; --t-base: 13px; --t-meta: 12px; }

[data-orbit-real-page="agent"] .todo-stack { margin-top: 13px; display: grid; gap: 8px; }
[data-orbit-real-page="agent"] .todo-verdict { color: var(--ink); font-size: var(--t-lead); font-weight: 600; line-height: 1.5; margin: 0 0 4px; }
[data-orbit-real-page="agent"] .todo-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-md); padding: 13px 15px; }
[data-orbit-real-page="agent"] .todo-head { display: flex; align-items: flex-start; gap: 11px; }
[data-orbit-real-page="agent"] .todo-who { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: flex-start; gap: 1px; }
[data-orbit-real-page="agent"] .todo-who b { color: var(--ink); font-size: var(--t-lead); font-weight: 600; line-height: 1.4; }
[data-orbit-real-page="agent"] .todo-sub { color: var(--text-2); font-size: var(--t-meta); }
[data-orbit-real-page="agent"] .todo-side { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; flex: 0 0 auto; }
[data-orbit-real-page="agent"] .todo-due { color: var(--text-3); font-size: var(--t-meta); font-variant-numeric: tabular-nums; white-space: nowrap; }
[data-orbit-real-page="agent"] .todo-due.soon { color: var(--amber-text, #8A5A00); font-weight: 600; }
/* 展开钮既是摘要也是开关；内容宽度，focus 轮廓贴文字，不横穿整卡。 */
[data-orbit-real-page="agent"] .todo-peek { align-items: center; background: none; border: 0; color: var(--text-2); cursor: pointer; display: inline-flex; font: inherit; font-size: var(--t-meta); gap: 6px; margin-top: 6px; padding: 3px 2px; }
[data-orbit-real-page="agent"] .todo-peek:hover { color: var(--accent); }
[data-orbit-real-page="agent"] .todo-tri { transition: transform .18s ease; }
[data-orbit-real-page="agent"] .todo-peek[aria-expanded="true"] .todo-tri { transform: rotate(90deg); }
[data-orbit-real-page="agent"] .todo-detail { border-top: 1px solid var(--border); margin-top: 12px; padding-top: 4px; }
[data-orbit-real-page="agent"] .todo-zone { color: var(--text-3); font-size: var(--t-meta); margin: 12px 0 2px; }
[data-orbit-real-page="agent"] .todo-items { list-style: none; margin: 0; padding: 0; }
[data-orbit-real-page="agent"] .todo-item { display: grid; gap: 0 11px; grid-template-columns: auto 1fr; padding: 9px 0; }
[data-orbit-real-page="agent"] .todo-item + .todo-item { border-top: 1px solid var(--border); }
/* 勾选框描边化：未选空盒，选中浅底 + 勾。选中态由控件自己承载，不给整行铺底。 */
[data-orbit-real-page="agent"] .todo-check { appearance: none; -webkit-appearance: none; background: var(--surface); border: 1.5px solid var(--border-2); border-radius: 4px; cursor: pointer; display: grid; grid-row: 1 / span 2; height: 16px; margin: 2px 0 0; place-items: center; transition: border-color .15s, background .15s; width: 16px; }
[data-orbit-real-page="agent"] .todo-check:hover { border-color: var(--accent); }
[data-orbit-real-page="agent"] .todo-check:checked { background: var(--accent-softer); border-color: var(--accent); }
[data-orbit-real-page="agent"] .todo-check:checked::before { border-bottom: 2px solid var(--accent); border-left: 2px solid var(--accent); content: ""; height: 4px; margin-top: -2px; transform: rotate(-45deg); width: 8px; }
[data-orbit-real-page="agent"] .todo-item .t { color: var(--ink); cursor: pointer; font-size: var(--t-base); font-weight: 600; line-height: 1.55; }
[data-orbit-real-page="agent"] .todo-item .t.t-off { color: var(--text-2); font-weight: 400; }
[data-orbit-real-page="agent"] .todo-item .d { color: var(--text-2); font-size: var(--t-base); grid-column: 2; line-height: 1.55; margin-top: 1px; }
[data-orbit-real-page="agent"] .todo-view { margin-top: 10px; }
[data-orbit-real-page="agent"] .linkish { background: none; border: 0; color: var(--text-2); cursor: pointer; font: inherit; font-size: var(--t-meta); padding: 2px 0; text-decoration: underline; text-underline-offset: 3px; }
[data-orbit-real-page="agent"] .linkish:hover { color: var(--accent); }

/* 内联草稿：卡片的下半部分，不是第二张卡。主题/正文无框，像一封信而不是表单。 */
[data-orbit-real-page="agent"] .draft { border-top: 1px solid var(--border); display: grid; flex-basis: 100%; gap: 9px; margin-top: 12px; padding-top: 13px; }
[data-orbit-real-page="agent"] .draft-label { color: var(--text-3); font-size: var(--t-meta); margin: 0; }
[data-orbit-real-page="agent"] .draft-stale { align-items: center; background: var(--amber-soft); border-radius: var(--r-sm); color: var(--amber-text, #8A5A00); display: flex; flex-wrap: wrap; font-size: var(--t-meta); gap: 8px; margin: 0; padding: 7px 10px; }
[data-orbit-real-page="agent"] .draft-stale .linkish { color: inherit; font-weight: 600; }
[data-orbit-real-page="agent"] .draft-subj { background: none; border: 0; border-bottom: 1px solid var(--border); color: var(--ink); font: inherit; font-size: var(--t-lead); font-weight: 600; padding: 0 0 9px; width: 100%; }
[data-orbit-real-page="agent"] .draft-subj:focus { border-bottom-color: var(--accent); outline: none; }
[data-orbit-real-page="agent"] .draft-body { background: none; border: 0; color: var(--text); font: inherit; font-size: var(--t-base); line-height: 1.75; min-height: 150px; padding: 2px 0 0; resize: vertical; width: 100%; }
[data-orbit-real-page="agent"] .draft-body:focus { outline: none; }
[data-orbit-real-page="agent"] .draft-foot { align-items: center; display: flex; flex-wrap: wrap; gap: 9px; }
[data-orbit-real-page="agent"] .draft-guard { align-items: flex-start; color: var(--text-2); display: flex; flex: 1; font-size: var(--t-meta); gap: 7px; line-height: 1.5; margin: 0; min-width: 200px; }
[data-orbit-real-page="agent"] .draft-guard > svg { color: var(--accent); flex: 0 0 auto; margin-top: 2px; }
[data-orbit-real-page="agent"] .draft-guard b { color: var(--ink); font-weight: 600; margin-right: 6px; }
[data-orbit-real-page="agent"] .draft-error { align-items: center; background: rgba(179, 38, 30, .06); border: 1px solid rgba(179, 38, 30, .25); border-radius: var(--r-sm); display: flex; flex-basis: 100%; flex-wrap: wrap; gap: 10px; margin-top: 10px; padding: 10px 12px; }
[data-orbit-real-page="agent"] .draft-error .w { flex: 1; font-size: var(--t-base); line-height: 1.5; min-width: 200px; }
[data-orbit-real-page="agent"] .draft-error .w b { color: var(--danger); display: block; font-weight: 600; }
[data-orbit-real-page="agent"] .draft-error .w span { color: var(--text-2); font-size: var(--t-meta); }

/* 状态动效：面板/回执进场 4px 上浮淡入，check 轻弹一下，按钮换字交叉淡入。
   全部 transform/opacity（不引起回流），时长 180-250ms；页面末尾的
   prefers-reduced-motion 规则会整体关掉这些动画。 */
[data-orbit-real-page="agent"] .draft { animation: agent-draft-in .22s ease-out; }
[data-orbit-real-page="agent"] .btn .swap { animation: agent-label-in .18s ease-out; }
/* 交接回执：记录「草稿已转入草稿箱」这一件已发生的事。用 accent 软底而不是
   success 绿——发送尚未发生，这里不是完成态；且 --live-text 在浅色主题下没有
   重绑，直接用会对比度不足。 */
[data-orbit-real-page="agent"] .draft-receipt { align-items: flex-start; animation: agent-draft-in .22s ease-out; background: var(--accent-softer); border-radius: var(--r-sm); display: flex; flex-basis: 100%; flex-wrap: wrap; gap: 10px; margin-top: 12px; padding: 11px 13px; }
[data-orbit-real-page="agent"] .draft-receipt-check { align-items: center; animation: agent-check-pop .25s ease-out; background: var(--accent); border-radius: 50%; color: var(--on-accent); display: inline-flex; flex: 0 0 auto; height: 20px; justify-content: center; margin-top: 1px; width: 20px; }
[data-orbit-real-page="agent"] .draft-receipt .w { color: var(--text-2); flex: 1; font-size: var(--t-meta); line-height: 1.5; min-width: 200px; }
[data-orbit-real-page="agent"] .draft-receipt .w b { color: var(--ink); display: block; font-size: var(--t-base); font-variant-numeric: tabular-nums; font-weight: 600; }
[data-orbit-real-page="agent"] .draft-receipt-acts { align-items: center; align-self: center; display: flex; gap: 12px; }
@keyframes agent-draft-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
@keyframes agent-check-pop { 0% { opacity: 0; transform: scale(.6); } 60% { transform: scale(1.08); } 100% { opacity: 1; transform: scale(1); } }
@keyframes agent-label-in { from { opacity: 0; transform: translateY(2px); } to { opacity: 1; transform: none; } }

[data-orbit-real-page="agent"] .action-card-guard { font-size: 12px; color: var(--text-3); margin-top: 9px; display: flex; gap: 7px; align-items: flex-start; }

[data-orbit-real-page="agent"] .brief-input input:focus, [data-orbit-real-page="agent"] .brief-input input:focus-visible { outline: none; }

@media (max-width: 720px) {
  [data-orbit-real-page="agent"] .grid { grid-template-columns: 1fr; }
  [data-orbit-real-page="agent"] .act.span2 { grid-column: span 1; }
  [data-orbit-real-page="agent"] .appt { grid-template-columns: 1fr; gap: 13px; }
  [data-orbit-real-page="agent"] .brief-action-row { align-items: start; grid-template-columns: 32px minmax(0, 1fr) 32px; }
  [data-orbit-real-page="agent"] .brief-action-buttons { grid-column: 2 / 4; width: 100%; }
  [data-orbit-real-page="agent"] .brief-action-more { grid-column: 3; grid-row: 1; }
}
@media (max-width: 640px) {
  [data-orbit-real-page="agent"] .ws-inner { padding: 18px 16px calc(20px + var(--orbit-ask-clearance, 0px)); }
  [data-orbit-real-page="agent"] .agent-chat-composer-dock { padding: 10px 16px calc(14px + env(safe-area-inset-bottom)); }
}
@media (prefers-reduced-motion: reduce) {
  [data-orbit-real-page="agent"] *, [data-orbit-real-page="agent"] *::before, [data-orbit-real-page="agent"] *::after { animation: none !important; transition: none !important; }
}

/* Orbit_0918 批次 4c：agent 控制台整体换肤（W4 锁已按用户 2026-09-19 指令释放；
   逻辑零改动，仅作用域 CSS；本文件属 scale-ratchet SNAPPED，故全部走模板 CSS） */
html[data-theme="light"] [data-orbit-real-page="agent"] {
  --agent-canvas: #FBFBFE; --agent-ink: #0E1225; --agent-muted: #6B6F99; --agent-hairline: #E8E9F6;
  --agent-signal: #4B4FC7; --agent-signal-soft: #ECEEFB;
  --accent: #4B4FC7; --accent-hover: #2E3270; --accent-press: #2E3270;
  --accent-soft: #ECEEFB; --accent-softer: #F7F7FD; --accent-ring: #B9BCEB;
  --accent-grad: #4B4FC7; --accent-grad-bar: #4B4FC7;
  --ink: #0E1225; --text: #0E1225; --text-2: #3B3F7A; --text-3: #6B6F99; --text-4: #9FA3C4;
  --bg: #FBFBFE; --bg-soft: #FBFBFE; --bg-sunken: #F1F1FA;
  --surface: #FFFFFF; --surface-2: #F7F7FD; --surface-3: #ECEEFB;
  --border: #E8E9F6; --border-2: #DDDEFA; --border-strong: #B9BCEB;
  --hairline: #E8E9F6; --glass-border: #E8E9F6;
}
[data-orbit-real-page="agent"] .h-display { font-family: 'Noto Serif SC', 'Songti SC', 'SimSun', serif; font-weight: 900; letter-spacing: -0.02em; }
[data-orbit-real-page="agent"] .btn-primary { background: #0E1225; border-color: #0E1225; box-shadow: none; color: #FFFFFF; }
[data-orbit-real-page="agent"] .btn-primary:hover:not(:disabled) { background: #2E3270; border-color: #2E3270; }
[data-orbit-real-page="agent"] .btn-ghost { background: #FFFFFF; border-color: #DDDEFA; color: #3B3F7A; box-shadow: none; }
[data-orbit-real-page="agent"] .btn-soft { background: #ECEEFB; border-color: #ECEEFB; color: #2E3270; box-shadow: none; }
[data-orbit-real-page="agent"] .agent-history.agent-history { background: #FBFBFE !important; border-right: 1px solid #E8E9F6; }
`;


// 1b 抽取后仍从本文件导出：验收集里的测试直接 import 这些符号。
export {
  agentChatHistoryMutationWasPersisted,
  agentChatHistorySessionsToHistory,
  agentRetryRequestForAssistant,
  compactAgentChatTitleFromQuestion,
  contactIdFromArtifactItemId,
  copyAgentMessageText,
  earliestTodoDueAt,
  groupTodosByContact,
  loadStoredAgentChatSessions,
  parseAgentChatHistoryStorage,
  prepareAgentFailedRequestRetry,
  titleFromMessages,
  uniqueAgentEvidenceRefs,
  type AgentEvidenceRef,
  type AgentMessage,
  type AgentPanel,
  type AgentStoredChatSession,
} from "./iorbit-0918/iorbit-model";
export { useAgentChat } from "./iorbit-0918/use-agent-chat";

export function OrbitRealAgent({
  home = null,
  registrationAvailabilityByEventId = {},
  viewModel,
}: OrbitRealAgentProps) {
  const { language, t } = useOrbitLanguage();
  // 任务 1c：历史记录侧（会话列表 / 分组 / 置顶 / 重命名 / 删除 / toast /
  // 侧栏宽度）整体归 `useAgentHistory`；对话侧从它拿到同一份 store 的 ref 与
  // setter，再用 `bindChat` 把删除当前会话要用的对话重置回注给历史 hook。
  const {
    bindChat,
    confirmDeleteHistorySession,
    createHistoryGroup,
    deleteHistoryGroup,
    deleteHistorySession,
    groupMutationPending,
    historyDeleteError,
    historyFeedback,
    historyMutationQueue,
    historyMutationSessionId,
    historySidebarResizing,
    historySidebarWidth,
    moveHistorySession,
    pendingDeleteHistory,
    renameHistoryGroup,
    renameHistorySession,
    resizeHistorySidebarWithKeyboard,
    selectedSessionGroupId,
    sessionGroups,
    setHistoryDeleteError,
    setHistoryFeedback,
    setPendingDeleteHistory,
    setSelectedSessionGroupId,
    setSessionGroups,
    setStoredSessions,
    startHistorySidebarResize,
    storedHistory,
    storedSessionsRef,
    togglePinnedHistorySession,
  } = useAgentHistory();
  const {
    activeQ,
    activeSessionId,
    activeSessionIdRef,
    agentPrefill,
    ask,
    backToDashboard,
    chatDraft,
    chatOpen,
    histOpen,
    messages,
    navigate,
    newChat,
    newChatInGroup,
    panel,
    pickHistory,
    setActiveQ,
    setActiveSessionId,
    setAgentPrefill,
    setChatDraft,
    setChatOpen,
    setHistOpen,
    setMessages,
    setPanel,
    setThinking,
    submitChatDraft,
    taskSuggestions,
    thinking,
  } = useAgentChat({
    history: {
      historyMutationQueue,
      setHistoryFeedback,
      setSessionGroups,
      setStoredSessions,
      storedSessionsRef,
    },
    suggests: viewModel.suggests,
  });
  bindChat({
    activeSessionIdRef,
    navigate,
    setActiveQ,
    setActiveSessionId,
    setChatOpen,
    setHistOpen,
    setMessages,
    setPanel,
    setThinking,
  });
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const scroll = scrollRef.current;
    if (scroll) scroll.scrollTop = scroll.scrollHeight;
  }, [messages, thinking]);



  const renderBubbles = () => (
    <>
      {messages.map((message, index) =>
        message.role === "user" ? (
          <div className="msg-user-row" key={`user-${index}`}>
            <AgentMessageCopyButton text={message.text} />
            <div className="msg-user">{message.text}</div>
          </div>
        ) : (
          <div className="msg-a" key={`assistant-${index}`}>
            <span className="mk">
              <AgentStar size={15} />
            </span>
            <div className="body">
              {message.note ? (
                <div className="msg-note">
                  <Icon name="eye" size={14} />
                  {message.note}
                </div>
              ) : null}
              <AgentMarkdown text={message.text} />
              {message.taskInteraction ? (
                <AgentTaskInteractionCard
                  interaction={message.taskInteraction}
                  language={language === "zh" ? "zh" : "en"}
                  {...taskSuggestions.forInteraction(message.taskInteraction)}
                />
              ) : null}
              {message.items.length > 0 ? (
                <PanelCards language={language === "ja" ? "en" : language} navigate={navigate} panel={{ items: message.items, kind: message.kind, panelTitle: message.panelTitle }} t={t} />
              ) : null}
              {message.runId && message.actionIds?.length ? (
                <AgentActionStatusCard
                  actionIds={message.actionIds}
                  language={language === "zh" ? "zh" : "en"}
                  navigate={navigate}
                  runId={message.runId}
                  showRunDetails={false}
                />
              ) : null}
              {message.retryRequest ? (
                <button
                  className="btn btn-ghost btn-sm"
                  data-agent-message-retry-request
                  disabled={thinking}
                  onClick={() => void ask(message.retryRequest!, index)}
                  style={{ marginTop: 10 }}
                  type="button"
                >
                  {language === "zh" ? "重新提交请求" : "Retry request"}
                </button>
              ) : null}
              <div className="msg-tools">
                <AgentMessageCopyButton text={message.text} />
              </div>
            </div>
          </div>
        ),
      )}
      {thinking ? (
        <div className="msg-a orbit-agent-thinking-turn">
          <span className="mk">
            <AgentStar size={15} />
          </span>
          <div className="body">
            <ThinkingIndicator t={t} />
          </div>
        </div>
      ) : null}
    </>
  );

  const inChat = chatOpen || messages.length > 0 || thinking;
  const threadTitle = messages.length
    ? titleFromMessages(messages)
    : t({ en: "New chat", zh: "新对话" });

  const workspaceContent = inChat ? (
    <>
      <div className="thread-bar">
        <button
          aria-label={t({ en: "Back to workspace", zh: "返回工作台" })}
          className="btn-back"
          onClick={backToDashboard}
          title={t({ en: "Back", zh: "返回" })}
          type="button"
        >
          <Icon name="back" size={16} />
        </button>
        <span className="title">{threadTitle}</span>
      </div>
      {messages.length || thinking ? (
        <div className="thread">{renderBubbles()}</div>
      ) : (
        <AgentWelcome onPick={ask} viewModel={viewModel} />
      )}
    </>
  ) : home ? (
    <OrbitAgentDashboard
      home={home}
      initialBriefText={agentPrefill?.query}
      language={language}
      navigate={navigate}
      onAsk={ask}
      onBriefAsk={agentPrefill ? (query) => {
        const origin = agentPrefill.origin;
        setAgentPrefill(null);
        void ask(query, undefined, origin);
      } : undefined}
      registrationAvailabilityByEventId={registrationAvailabilityByEventId}
      t={t}
    />
  ) : (
    <AgentWelcome onPick={ask} viewModel={viewModel} />
  );

  // data-orbit-ask-clearance="manual"：这一页的底部留白自己在 .ws-inner 上处理。
  // 根节点是 height:100dvh 的 flex 列，全局样式表那个 ::after 垫片放进来会变成
  // flex item 把布局挤歪。
  return (
    <div
      aria-busy={thinking}
      className="orbit-agent-workspace"
      data-orbit-agent-request-state={thinking ? "pending" : "idle"}
      data-orbit-ask-clearance="manual"
      data-orbit-real-page="agent"
      style={{
        "--text-3": "#6B6F99",
        "--text-4": "#9FA3C4",
        background: "var(--bg-soft)",
        display: "flex",
        flexDirection: "column",
        height: "100dvh",
      } as CSSProperties}
    >
      <style dangerouslySetInnerHTML={{ __html: CONSOLE_STYLES }} />
      <h1
        data-orbit-agent-screen-title
        style={{ clipPath: "inset(50%)", height: 1, margin: -1, overflow: "hidden", position: "absolute", whiteSpace: "nowrap", width: 1 }}
      >
        {t({ en: "iOrbit workspace", zh: "iOrbit 工作区" })}
      </h1>
      <div className="orbit-desktop-only">
        {/* No rightExtra here: the "New chat" action already lives in the
            sidebar below, so the desktop top-nav stays identical to the
            homepage / other product pages (brand · links · 中/EN · Me). */}
        <AccountTopNav active="agent" />
      </div>
      <div className="orbit-mobile-only" style={{ flexShrink: 0 }}>
        <AccountTopNav
          active="agent"
          mobileRightExtra={(
            <button aria-label={t({ en: "Chat history", zh: "对话历史" })} className="orbit-top-icon-btn orbit-agent-history-btn" onClick={() => setHistOpen(true)} type="button">
              <Icon name="clock" size={16} />
            </button>
          )}
        />
      </div>

      <div className="ws-body orbit-desktop-only" style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <aside className="agent-history orbit-agent-history" data-orbit-agent-history-sidebar style={{ maxWidth: HISTORY_SIDEBAR_MAX_WIDTH, minWidth: HISTORY_SIDEBAR_MIN_WIDTH, width: historySidebarWidth }}>
          <div className="agent-history-actions orbit-agent-history-actions">
            <button className="orbit-agent-new-chat" type="button" onClick={newChat}>
              <Icon name="plus" size={16} color="var(--accent)" />
              {t({ en: "New chat", zh: "新对话" })}
            </button>
          </div>
          <div className="agent-history-heading orbit-agent-history-heading">
            <div className="eyebrow">{t({ en: "Chat history", zh: "对话历史" })}</div>
          </div>
          <AgentChatHistoryOrganization
            busy={groupMutationPending}
            currentGroupId={selectedSessionGroupId}
            groups={sessionGroups}
            language={language}
            onCreate={(name) => { void createHistoryGroup(name); }}
            onDelete={(group) => { void deleteHistoryGroup(group); }}
            onFilter={setSelectedSessionGroupId}
            onNew={newChatInGroup}
            onRename={(group, name) => { void renameHistoryGroup(group, name); }}
          />
          <div className="scroll agent-history-scroll orbit-agent-history-scroll">
            <AgentHistoryList activeQ={activeQ} activeSessionId={activeSessionId} history={storedHistory} onDelete={deleteHistorySession} onMove={moveHistorySession} onPick={pickHistory} onRename={renameHistorySession} onTogglePin={togglePinnedHistorySession} pendingSessionId={historyMutationSessionId} sessionGroups={sessionGroups} />
          </div>
        </aside>
        <button
          className="orbit-agent-history-resize"
          aria-label={t({ en: "Resize chat history", zh: "调整历史宽度" })}
          aria-orientation="vertical"
          aria-valuemax={HISTORY_SIDEBAR_MAX_WIDTH}
          aria-valuemin={HISTORY_SIDEBAR_MIN_WIDTH}
          aria-valuenow={historySidebarWidth}
          aria-valuetext={`${historySidebarWidth}px`}
          data-orbit-agent-history-resize-handle
          onKeyDown={resizeHistorySidebarWithKeyboard}
          onPointerDown={startHistorySidebarResize}
          role="separator"
          title={t({ en: "Resize chat history", zh: "调整历史宽度" })}
          type="button"
          style={{
            alignSelf: "stretch",
            background: historySidebarResizing ? "var(--accent-soft)" : "transparent",
            border: "none",
            cursor: "col-resize",
            flexShrink: 0,
            marginLeft: -8,
            padding: 0,
            position: "relative",
            width: 8,
            zIndex: ORBIT_Z.raised,
          }}
        />
        <div className="ws-main">
          <div ref={scrollRef} className="scroll ws-scroll">
            <div className="ws-inner">{workspaceContent}</div>
          </div>
          {inChat ? (
            <div className="agent-chat-composer-dock">
              <AgentChatComposer
                busy={thinking}
                onChange={setChatDraft}
                onSubmit={submitChatDraft}
                t={t}
                value={chatDraft}
              />
            </div>
          ) : null}
        </div>
      </div>

      <div className="orbit-mobile-only" style={{ flex: 1, flexDirection: "column", minHeight: 0 }}>
        <div ref={scrollRef} className="scroll ws-scroll">
          <div className="ws-inner">{workspaceContent}</div>
        </div>
        {inChat ? (
          <div className="agent-chat-composer-dock">
            <AgentChatComposer
              busy={thinking}
              onChange={setChatDraft}
              onSubmit={submitChatDraft}
              t={t}
              value={chatDraft}
            />
          </div>
        ) : null}
      </div>

      {histOpen ? (
        <AgentMobileHistoryDrawer
          activeQ={activeQ}
          activeSessionId={activeSessionId}
          groupMutationPending={groupMutationPending}
          groups={sessionGroups}
          history={storedHistory}
          language={language}
          onClose={() => setHistOpen(false)}
          onDelete={deleteHistorySession}
          onCreateGroup={(name) => { void createHistoryGroup(name); }}
          onDeleteGroup={(group) => { void deleteHistoryGroup(group); }}
          onFilterGroup={setSelectedSessionGroupId}
          onNavigate={navigate}
          onNewChat={newChat}
          onNewInGroup={newChatInGroup}
          onMove={moveHistorySession}
          onPick={pickHistory}
          onRename={renameHistorySession}
          onRenameGroup={(group, name) => { void renameHistoryGroup(group, name); }}
          onTogglePin={togglePinnedHistorySession}
          pendingSessionId={historyMutationSessionId}
          sessionGroups={sessionGroups}
        />
      ) : null}
      {pendingDeleteHistory ? (
        <AgentHistoryDeleteDialog
          error={historyDeleteError}
          history={pendingDeleteHistory}
          onCancel={() => {
            setHistoryDeleteError(null);
            setPendingDeleteHistory(null);
          }}
          onConfirm={() => {
            void confirmDeleteHistorySession();
          }}
          pending={historyMutationSessionId === pendingDeleteHistory.sessionId}
        />
      ) : null}
      {historyFeedback ? (
        <div
          className="nc-toast show"
          data-orbit-agent-history-feedback={historyFeedback.kind}
          role={historyFeedback.kind === "error" ? "alert" : "status"}
          style={{
            bottom: 24,
            left: "50%",
            maxWidth: "min(520px, calc(100vw - 32px))",
            opacity: 1,
            pointerEvents: "auto",
            position: "fixed",
            transform: "translateX(-50%)",
            zIndex: ORBIT_Z.toast,
          }}
        >
          <Icon
            color={historyFeedback.kind === "error" ? "var(--danger)" : "var(--accent)"}
            name={historyFeedback.kind === "error" ? "x" : "check"}
            size={15}
          />
          <span>{historyFeedback.text}</span>
          <button
            aria-label={t({ en: "Dismiss", zh: "关闭提示" })}
            className="btn btn-icon btn-quiet"
            onClick={() => setHistoryFeedback(null)}
            style={{ height: 24, marginLeft: 4, width: 24 }}
            type="button"
          >
            <Icon name="x" size={13} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
