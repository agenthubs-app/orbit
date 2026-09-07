"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { formatOrbitDateTime } from "../orbit-datetime";
import { useOrbitLanguage } from "../orbit-language-context";
import type { OrbitLanguage } from "../orbit-language-core";
import { Avatar, Icon } from "../orbit-reference-primitives";
import {
  toCreatedThread,
  toInboxPanelViewModel,
  toReminderAlerts,
  unreadThreadCount,
  type InboxPanelViewModel,
  type InboxReminderAlert,
  type InboxThreadDetail,
  type InboxThreadListItem,
} from "./inbox-panel-view-model";
import { ORBIT_Z } from "../orbit-z";

type InboxTab = "threads" | "alerts";

const RELATIONSHIP_INBOX_WIDTH_STORAGE_KEY =
  "orbit:relationship-inbox:width";
const RELATIONSHIP_INBOX_DEFAULT_WIDTH = 940;
const RELATIONSHIP_INBOX_MIN_WIDTH = 560;
const RELATIONSHIP_INBOX_MAX_WIDTH = 1_180;

function normalizeRelationshipInboxWidth(value: number): number {
  return Math.min(
    RELATIONSHIP_INBOX_MAX_WIDTH,
    Math.max(RELATIONSHIP_INBOX_MIN_WIDTH, Math.round(value)),
  );
}

function clampRelationshipInboxWidth(
  value: number,
  viewportWidth =
    typeof window === "undefined" ? RELATIONSHIP_INBOX_MAX_WIDTH : window.innerWidth,
): number {
  const maxWidth = Math.max(
    320,
    Math.min(RELATIONSHIP_INBOX_MAX_WIDTH, viewportWidth - 24),
  );
  const minWidth = Math.min(RELATIONSHIP_INBOX_MIN_WIDTH, maxWidth);

  return Math.min(
    maxWidth,
    Math.max(minWidth, normalizeRelationshipInboxWidth(value)),
  );
}

interface NewThreadSeed {
  body?: string;
  contactId?: string;
  recipient?: string;
  organization?: string;
  subject?: string;
}

// 让其它页面（如联系人详情页"起草邮件"）打开收件箱并直接进入发起新对话流程。
// 用 window 自定义事件解耦：入口 trigger 监听该事件，页面只需 dispatch。
export const RELATIONSHIP_INBOX_COMPOSE_EVENT = "orbit:relationship-inbox-compose";

export function openRelationshipInboxCompose(seed: NewThreadSeed): void {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(
    new CustomEvent(RELATIONSHIP_INBOX_COMPOSE_EVENT, { detail: seed }),
  );
}

// 只打开面板看线程列表，不进入新建 compose 流程——供「已转入草稿箱」回执类
// 入口回访已暂存的草稿；复用 compose 事件会重新预填一份新草稿，误导用户。
export const RELATIONSHIP_INBOX_OPEN_EVENT = "orbit:relationship-inbox-open";

export function openRelationshipInbox(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new CustomEvent(RELATIONSHIP_INBOX_OPEN_EVENT));
}

// 拉取 async correspondence workspace。传 conversationId 选中某条线程。
// 面板只经这里的 view model 消费数据，不直接依赖 feature 契约的运行时代码。
async function fetchInboxWorkspace(
  conversationId: string | undefined,
  language: OrbitLanguage,
): Promise<InboxPanelViewModel> {
  const query = conversationId
    ? `?conversationId=${encodeURIComponent(conversationId)}`
    : "";
  const response = await fetch(`/api/chat/relationship-inbox${query}`, {
    headers: { accept: "application/json" },
  });
  const envelope = (await response.json()) as {
    success?: boolean;
    data?: unknown;
  };

  if (!response.ok || envelope.success !== true || !envelope.data) {
    throw new Error("relationship-inbox-request-failed");
  }

  return toInboxPanelViewModel(
    envelope.data as Parameters<typeof toInboxPanelViewModel>[0],
    language,
  );
}

function initialOf(name: string): string {
  return name.trim().slice(0, 1).toUpperCase() || "?";
}

const badgeCountRequests = new Map<OrbitLanguage, Promise<number>>();

// badge 聚合：未读对话数 + 来源明确的待处理提醒数。fail-closed 返回 0。
// 响应式页面可能同时挂载 desktop/mobile 两棵顶栏；同语言的并发读取共享一次请求。
async function fetchBadgeCount(language: OrbitLanguage): Promise<number> {
  const pending = badgeCountRequests.get(language);
  if (pending) return pending;

  const request = (async () => {
    try {
      const [inbox, reminders] = await Promise.all([
        fetchInboxWorkspace(undefined, language).catch(() => null),
        fetchReminderAlerts(language),
      ]);
      const unreadThreads = inbox ? unreadThreadCount(inbox.threads) : 0;
      return unreadThreads + reminders.length;
    } catch {
      return 0;
    }
  })();

  badgeCountRequests.set(language, request);
  void request.finally(() => {
    if (badgeCountRequests.get(language) === request) {
      badgeCountRequests.delete(language);
    }
  });
  return request;
}

export function hasRenderedComposeTriggerArea(
  element: Pick<HTMLElement, "getBoundingClientRect">,
): boolean {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

// 用当前账户的人脉证据生成首封 AI 草稿（subject + body），供发起新对话预填。
// 这里只生成可编辑草稿；接口不会调用邮件发送方，也不会创建外部副作用。
export type MessageDraftRequestResult =
  | { success: true; data: { subject: string; body: string } }
  | { success: false; error: { code: string; message: string } };

export async function requestMessageDraft(input: {
  contactId?: string;
  language: OrbitLanguage;
  // purpose 是这封草稿要覆盖的具体事项（用户勾选的跟进内容）。路由和
  // ai-email-draft-service 一直支持这个参数，此前没有调用方传——结果生成的
  // 信和卡片上列的事项毫无关系。
  purpose?: string;
  recipientName: string;
  organization: string;
}): Promise<MessageDraftRequestResult> {
  try {
    const response = await fetch("/api/chat/assist/email-draft", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contactId: input.contactId,
        language: input.language,
        purpose: input.purpose,
        recipientName: input.recipientName,
        organization: input.organization,
      }),
    });
    const envelope = (await response.json()) as {
      success?: boolean;
      data?: { subject?: string; body?: string };
      error?: { code?: string; message?: string };
    };
    if (!response.ok || envelope.success !== true) {
      return {
        success: false,
        error: {
          code: envelope.error?.code ?? "DRAFT_REQUEST_FAILED",
          message: envelope.error?.message ?? "The draft request failed.",
        },
      };
    }
    const draft = envelope.data;
    if (!draft) {
      return {
        success: false,
        error: {
          code: "DRAFT_RESPONSE_INVALID",
          message: "The draft response did not include a reviewable draft.",
        },
      };
    }
    return {
      success: true,
      data: { subject: draft.subject ?? "", body: draft.body ?? "" },
    };
  } catch {
    return {
      success: false,
      error: {
        code: "DRAFT_REQUEST_FAILED",
        message: "The draft request could not be completed.",
      },
    };
  }
}

export async function generateMessageDraft(input: {
  contactId?: string;
  language: OrbitLanguage;
  recipientName: string;
  organization: string;
}): Promise<{ subject: string; body: string } | null> {
  const result = await requestMessageDraft(input);
  return result.success ? result.data : null;
}

// draft→thread：从确认后的草稿创建一个新的本地 staged 对话线程。
export async function createThreadFromDraft(
  input: {
    contactId?: string;
    requestId: string;
    participantName: string;
    organization: string;
    subject: string;
    body: string;
  },
  language: OrbitLanguage,
): Promise<ReturnType<typeof toCreatedThread> | null> {
  try {
    const response = await fetch("/api/chat/relationship-inbox", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    const envelope = (await response.json()) as { success?: boolean; data?: unknown };
    if (!response.ok || envelope.success !== true || !envelope.data) {
      return null;
    }
    return toCreatedThread(
      envelope.data as Parameters<typeof toCreatedThread>[0],
      language,
    );
  } catch {
    return null;
  }
}

// 规则礼貌改写：把当前草稿文本交给 chat writing-assist 的来源数据规则。
// 返回改写后的建议文本；失败时返回 null，由调用方保持原文。
async function rewriteDraft(input: {
  conversationId: string;
  participantName: string;
  organization: string;
  sourceText: string;
}): Promise<string | null> {
  try {
    const response = await fetch("/api/chat/assist/rewrite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    const envelope = (await response.json()) as {
      success?: boolean;
      data?: { assists?: { suggestedText?: string }[] };
    };
    if (!response.ok || envelope.success !== true) {
      return null;
    }
    const suggested = envelope.data?.assists?.[0]?.suggestedText;
    return typeof suggested === "string" && suggested.trim() ? suggested : null;
  } catch {
    return null;
  }
}

// 关系收件箱面板：右上角单入口 + 两 tab（💬对话 / 🔔提醒）的 slide-over。
// Step 0 只搭外壳（入口按钮、滑出容器、focus-trap、Esc、scrim、tab 切换、空态占位）。
// 数据在后续步骤接入：对话走 chat async conversation，提醒走 notifications + proactive。

function EmptyState({ icon, title, hint }: { icon: string; title: string; hint: string }) {
  return (
    <div
      style={{
        alignItems: "center",
        color: "var(--text-3)",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        justifyContent: "center",
        minHeight: 240,
        padding: "40px 24px",
        textAlign: "center",
      }}
    >
      <Icon name={icon} size={30} stroke={1.5} />
      <div style={{ color: "var(--text-2)", fontSize: 14, fontWeight: 600 }}>{title}</div>
      <div style={{ fontSize: 12.5, lineHeight: 1.55, maxWidth: 280 }}>{hint}</div>
    </div>
  );
}

// 提醒 tab 数据源：notifications reminders（GET）+ orbit-ai proactive nudge（POST）。
// 两者都 fail-closed，出错时返回空数组，不阻塞面板。
async function fetchReminderAlerts(
  language: OrbitLanguage,
): Promise<readonly InboxReminderAlert[]> {
  try {
    const response = await fetch("/api/notifications", {
      headers: { accept: "application/json" },
    });
    const envelope = (await response.json()) as { success?: boolean; data?: unknown };
    if (!response.ok || envelope.success !== true || !envelope.data) {
      return [];
    }
    return toReminderAlerts(
      envelope.data as Parameters<typeof toReminderAlerts>[0],
      language,
    );
  } catch {
    return [];
  }
}

function AlertsTab() {
  const { t, language } = useOrbitLanguage();
  const [state, setState] = useState<"loading" | "ready">("loading");
  const [reminders, setReminders] = useState<readonly InboxReminderAlert[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    let active = true;
    setState("loading");
    fetchReminderAlerts(language)
      .then((reminderAlerts) => {
        if (!active) return;
        setReminders(reminderAlerts);
        setState("ready");
      })
      .catch(() => {
        if (active) setState("ready");
      });
    return () => {
      active = false;
    };
  }, [language]);

  const persistNotificationState = (id: string, state: "read" | "ignored") =>
    fetch(`/api/notifications/${encodeURIComponent(id)}/state`, {
      body: JSON.stringify({ state }),
      headers: { "content-type": "application/json" },
      keepalive: true,
      method: "POST",
    });

  const dismiss = (id: string) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    void persistNotificationState(id, "ignored").then((response) => {
      if (response.ok) return;
      setDismissed((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }).catch(() => {
      setDismissed((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    });
  };

  if (state === "loading") {
    return <EmptyState hint={t({ en: "Loading alerts…", zh: "正在加载提醒…" })} icon="bell" title={t({ en: "Loading", zh: "加载中" })} />;
  }

  const visibleReminders = reminders.filter((item) => !dismissed.has(item.id));

  if (!visibleReminders.length) {
    return <EmptyState hint={t({ en: "Source-backed reminders will appear here.", zh: "来源明确的提醒会显示在这里。" })} icon="bell" title={t({ en: "All clear", zh: "暂无提醒" })} />;
  }

  return (
    <div className="ri-alerts">
      {visibleReminders.length ? (
        <div className="ri-alert-group">
          <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between" }}>
            <div className="ri-alert-eyebrow">{t({ en: "Reminders", zh: "跟进提醒" })}</div>
            {visibleReminders.length > 1 ? (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => { for (const alert of visibleReminders) dismiss(alert.id); }}
                type="button"
              >
                {t({ en: "Dismiss all", zh: "全部忽略" })}
              </button>
            ) : null}
          </div>
          {visibleReminders.map((alert) => (
            <div className={`ri-alert ri-alert-pri-${alert.priority}`} key={alert.id}>
              <a className="ri-alert-main ri-alert-nav" href={alert.href} onClick={() => { void persistNotificationState(alert.id, "read"); }}>
                <div className="ri-alert-title">{alert.title}</div>
                <div className="ri-alert-meta">
                  {[alert.contactName, alert.organization].filter(Boolean).join(" · ")}
                </div>
                <div className="ri-alert-due mono">{alert.dueLabel}</div>
              </a>
              <button aria-label={t({ en: "Dismiss", zh: "忽略" })} className="ri-alert-dismiss" onClick={() => dismiss(alert.id)} type="button">
                <Icon name="x" size={14} />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="ri-boundary">
        <Icon name="lock" size={13} />
        <span>{t({ en: "In-app reminders stay in Orbit. No external push, email, or SMS was sent.", zh: "站内提醒仅保留在 Orbit；未发送外部推送、邮件或短信。" })}</span>
      </div>
    </div>
  );
}

function ThreadRow({
  active,
  thread,
  onOpen,
}: {
  active: boolean;
  thread: InboxThreadListItem;
  onOpen: () => void;
}) {
  const { language } = useOrbitLanguage();

  return (
    <button
      aria-current={active ? "true" : undefined}
      className={`ri-row${active ? " is-active" : ""}`}
      onClick={onOpen}
      type="button"
    >
      <Avatar letter={initialOf(thread.participantName)} g="g-violet" size={38} />
      <span className="ri-row-main">
        <span className="ri-row-top">
          <span className="ri-row-name">{thread.participantName}</span>
          <span className="ri-row-time mono">{formatOrbitDateTime(thread.lastCorrespondenceAt, language)}</span>
        </span>
        <span className="ri-row-subject">{thread.subject}</span>
        <span className="ri-row-preview">{thread.preview}</span>
      </span>
      {thread.unreadCount > 0 ? (
        <span aria-label={`${thread.unreadCount} unread`} className="ri-row-unread">
          {thread.unreadCount}
        </span>
      ) : null}
    </button>
  );
}

// 回复草稿编辑器：本地编辑 + 规则改写 + 暂存复核。
// 暂存只在当前界面保留预览，不发送、不持久化，也不触发外部副作用。
function ReplyComposer({
  detail,
  t,
}: {
  detail: InboxThreadDetail;
  t: (copy: { en: string; zh: string }) => string;
}) {
  const [body, setBody] = useState(detail.draftReplyBody);
  const [rewriting, setRewriting] = useState(false);
  const [staged, setStaged] = useState(false);

  // 切换线程时重置草稿与暂存态。
  useEffect(() => {
    setBody(detail.draftReplyBody);
    setStaged(false);
  }, [detail.conversationId, detail.draftReplyBody]);

  const onRewrite = async () => {
    setRewriting(true);
    const rewritten = await rewriteDraft({
      conversationId: detail.conversationId,
      participantName: detail.participantName,
      organization: detail.organization,
      sourceText: body,
    });
    if (rewritten) {
      setBody(rewritten);
    }
    setRewriting(false);
  };

  if (staged) {
    return (
      <div className="ri-staged">
        <div className="ri-staged-head">
          <Icon name="lock" size={14} />
          <span>{t({ en: "Staged for review — not sent", zh: "已暂存待复核 — 未发送" })}</span>
        </div>
        <div className="ri-staged-body">{body}</div>
        <div className="ri-boundary">
          <Icon name="lock" size={13} />
          <span>{t({ en: "No external message, notification, calendar entry, saved record, or network request happened.", zh: "未发生任何外部消息、通知、日历、保存记录或网络请求。" })}</span>
        </div>
        <button className="btn btn-quiet btn-sm" onClick={() => setStaged(false)} type="button">
          {t({ en: "Edit draft", zh: "继续编辑" })}
        </button>
      </div>
    );
  }

  return (
    <div className="ri-composer">
      <label className="ri-composer-label">{t({ en: "Draft reply", zh: "回复草稿" })}</label>
      <textarea
        className="field ri-composer-input"
        onChange={(event) => setBody(event.target.value)}
        placeholder={t({ en: "Write a reply…", zh: "写一条回复…" })}
        value={body}
      />
      <div className="ri-boundary">
        <Icon name="lock" size={13} />
        <span>{t({ en: "Draft & review only — sending requires confirmation, no message is sent automatically.", zh: "仅草稿与复核 — 发送需确认，不会自动发送任何消息。" })}</span>
      </div>
      <div className="ri-composer-actions">
        <button className="btn btn-ghost btn-sm" disabled={rewriting || !body.trim()} onClick={onRewrite} type="button">
          <Icon name="sparkle" size={15} />
          {rewriting ? t({ en: "Rewriting…", zh: "改写中…" }) : t({ en: "Rule-based rewrite", zh: "规则改写" })}
        </button>
        <button className="btn btn-primary btn-sm" disabled={!body.trim()} onClick={() => setStaged(true)} style={{ flex: 1, justifyContent: "center" }} type="button">
          <Icon name="mail" size={15} />
          {t({ en: "Stage for review", zh: "暂存待复核" })}
        </button>
      </div>
    </div>
  );
}

function ThreadDetailView({
  detail,
  currentUserName,
  onBack,
  t,
}: {
  detail: InboxThreadDetail;
  currentUserName: string;
  onBack: () => void;
  t: (copy: { en: string; zh: string }) => string;
}) {
  const { language } = useOrbitLanguage();

  return (
    <div className="ri-detail">
      <div className="ri-detail-head">
        <button aria-label={t({ en: "Back to list", zh: "返回列表" })} className="ri-back" onClick={onBack} type="button">
          <Icon name="chevL" size={18} />
        </button>
        <div style={{ minWidth: 0 }}>
          <div className="ri-detail-subject">{detail.subject}</div>
          {detail.summary ? <div className="ri-detail-summary">{detail.summary}</div> : null}
        </div>
      </div>

      {detail.sourceContextLabels.length ? (
        <div className="ri-src-row">
          {detail.sourceContextLabels.map((label) => (
            <span className="chip" key={label}>{label}</span>
          ))}
        </div>
      ) : null}

      <div className="ri-msgs">
        {detail.messages.map((message) => (
          <div className={`ri-msg${message.fromMe ? " is-me" : ""}`} key={message.messageId}>
            <div className="ri-msg-meta">
              <span className="ri-msg-sender">{message.fromMe ? currentUserName : message.senderName}</span>
              <span className="ri-msg-time mono">{formatOrbitDateTime(message.occurredAt, language)}</span>
            </div>
            <div className="ri-msg-body">{message.body}</div>
          </div>
        ))}
      </div>

      <ReplyComposer detail={detail} t={t} />
    </div>
  );
}

function ThreadContextRail({
  detail,
  t,
}: {
  detail: InboxThreadDetail;
  t: (copy: { en: string; zh: string }) => string;
}) {
  return (
    <aside className="ri-thread-context">
      <div className="ri-context-person">
        <Avatar
          letter={initialOf(detail.participantName)}
          g="g-violet"
          size={46}
        />
        <div>
          <div className="ri-context-name">{detail.participantName}</div>
          <div className="ri-context-org">
            {detail.organization ||
              t({ en: "Organization not listed", zh: "未填写组织" })}
          </div>
        </div>
      </div>

      <div className="ri-context-section">
        <div className="ri-context-label">
          {t({ en: "Relationship context", zh: "关系上下文" })}
        </div>
        <p className="ri-context-summary">
          {detail.summary ||
            t({
              en: "Review the conversation before deciding the next follow-up.",
              zh: "先复核对话，再决定下一步跟进。",
            })}
        </p>
      </div>

      {detail.sourceContextLabels.length ? (
        <div className="ri-context-section">
          <div className="ri-context-label">
            {t({ en: "Source signals", zh: "来源线索" })}
          </div>
          <div className="ri-context-signals">
            {detail.sourceContextLabels.map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="ri-context-safety">
        <Icon name="lock" size={14} />
        <span>
          {t({
            en: "Draft-only workspace. Nothing is delivered without confirmation.",
            zh: "仅用于草稿复核。未经确认不会投递任何内容。",
          })}
        </span>
      </div>
    </aside>
  );
}

// 发起新对话：填写收件人 → 规则生成草稿 → 确认创建 staged 线程。
// 生成走 message-draft-generator，创建走 async createConversationFromDraft，
// 全程草稿优先、不发送、无外部副作用。
function NewThreadForm({
  initialBody,
  initialContactId,
  initialRecipient,
  initialOrganization,
  initialSubject,
  onCreated,
  onCancel,
  t,
}: {
  initialBody?: string;
  initialContactId?: string;
  initialRecipient?: string;
  initialOrganization?: string;
  initialSubject?: string;
  onCreated: (created: ReturnType<typeof toCreatedThread>) => void;
  onCancel: () => void;
  t: (copy: { en: string; zh: string }) => string;
}) {
  const { language } = useOrbitLanguage();
  const [recipient, setRecipient] = useState(initialRecipient ?? "");
  const [organization, setOrganization] = useState(initialOrganization ?? "");
  const [subject, setSubject] = useState(initialSubject ?? "");
  const [body, setBody] = useState(initialBody ?? "");
  const requestIdRef = useRef<string | null>(null);
  const [busy, setBusy] = useState<"idle" | "generating" | "creating">("idle");
  const [error, setError] = useState(false);

  if (!requestIdRef.current) {
    requestIdRef.current =
      globalThis.crypto?.randomUUID?.() ??
      `relationship-draft-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  const onGenerate = async () => {
    setBusy("generating");
    setError(false);
    const draft = await generateMessageDraft({
      contactId: initialContactId,
      language,
      recipientName: recipient,
      organization,
    });
    if (draft) {
      setSubject(draft.subject);
      setBody(draft.body);
    } else {
      setError(true);
    }
    setBusy("idle");
  };

  const onCreate = async () => {
    setBusy("creating");
    setError(false);
    const created = await createThreadFromDraft(
      {
        contactId: initialContactId,
        requestId: requestIdRef.current,
        participantName: recipient,
        organization,
        subject,
        body,
      },
      language,
    );
    if (created) {
      onCreated(created);
    } else {
      setError(true);
      setBusy("idle");
    }
  };

  const canCreate =
    Boolean(recipient.trim() && subject.trim() && body.trim()) && busy === "idle";

  return (
    <div className="ri-new">
      <div className="ri-new-head">
        <button aria-label={t({ en: "Back to list", zh: "返回列表" })} className="ri-back" onClick={onCancel} type="button">
          <Icon name="chevL" size={18} />
        </button>
        <div className="ri-detail-subject">{t({ en: "New conversation", zh: "发起新对话" })}</div>
      </div>

      <label className="ri-new-label">{t({ en: "Recipient", zh: "收件人" })}</label>
      <input className="field" onChange={(event) => setRecipient(event.target.value)} placeholder={t({ en: "Contact name", zh: "联系人姓名" })} value={recipient} />

      <label className="ri-new-label">{t({ en: "Organization", zh: "公司/组织" })}</label>
      <input className="field" onChange={(event) => setOrganization(event.target.value)} placeholder={t({ en: "Optional", zh: "选填" })} value={organization} />

      <button className="btn btn-ghost btn-sm" disabled={!recipient.trim() || busy !== "idle"} onClick={onGenerate} type="button">
        <Icon name="sparkle" size={15} />
        {busy === "generating" ? t({ en: "AI is drafting…", zh: "AI 起草中…" }) : t({ en: "Draft with AI", zh: "AI 起草邮件" })}
      </button>

      <label className="ri-new-label">{t({ en: "Subject", zh: "主题" })}</label>
      <input className="field" onChange={(event) => setSubject(event.target.value)} placeholder={t({ en: "Thread title", zh: "对话标题" })} value={subject} />

      <label className="ri-new-label">{t({ en: "Message", zh: "正文" })}</label>
      <textarea className="field ri-composer-input" onChange={(event) => setBody(event.target.value)} placeholder={t({ en: "Write the first message…", zh: "写下第一条消息…" })} value={body} />

      <div className="ri-boundary">
        <Icon name="lock" size={13} />
        <span>{t({ en: "Creates a staged draft thread — nothing is sent, confirm before any real send.", zh: "创建的是本地暂存草稿线程 — 不发送任何消息，真实发送前需确认。" })}</span>
      </div>

      {error ? (
        <div className="ri-new-error">{t({ en: "Something went wrong. Please try again.", zh: "出了点问题，请重试。" })}</div>
      ) : null}

      <button className="btn btn-primary btn-sm" disabled={!canCreate} onClick={onCreate} type="button">
        <Icon name="mail" size={15} />
        {busy === "creating" ? t({ en: "Creating…", zh: "创建中…" }) : t({ en: "Create thread (confirm)", zh: "创建对话（确认）" })}
      </button>
    </div>
  );
}

function ThreadsTab({
  newThreadSeed,
  onNewThreadConsumed,
}: {
  newThreadSeed?: NewThreadSeed | null;
  onNewThreadConsumed?: () => void;
}) {
  const { t, language } = useOrbitLanguage();
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [viewModel, setViewModel] = useState<InboxPanelViewModel | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [created, setCreated] = useState<ReturnType<typeof toCreatedThread>[]>([]);
  const [search, setSearch] = useState("");
  const emptyWorkspace: InboxPanelViewModel = {
    title: t({ en: "Relationship inbox", zh: "关系收件箱" }),
    currentUserName: t({ en: "You", zh: "我" }),
    threads: [],
    selected: null,
  };

  useEffect(() => {
    let active = true;
    setState("loading");
    fetchInboxWorkspace(undefined, language)
      .then((model) => {
        if (!active) return;
        setViewModel(model);
        setState("ready");
      })
      .catch(() => {
        if (active) setState("error");
      });
    return () => {
      active = false;
    };
  }, [language]);

  // 联系人详情页"起草邮件"带着收件人进入面板时，直接打开发起新对话表单。
  useEffect(() => {
    if (newThreadSeed) {
      setComposing(true);
    }
  }, [newThreadSeed]);

  const openThread = (conversationId: string) => {
    setOpenId(conversationId);
    // 新建的 staged 线程只在本地，不去 fetch；其余线程拉取完整消息。
    if (created.some((entry) => entry.detail.conversationId === conversationId)) {
      return;
    }
    fetchInboxWorkspace(conversationId, language)
      .then((model) => setViewModel(model))
      .catch(() => undefined);
  };

  if (state === "loading" && !composing) {
    return <EmptyState hint={t({ en: "Loading conversations…", zh: "正在加载对话…" })} icon="message" title={t({ en: "Loading", zh: "加载中" })} />;
  }

  if ((state === "error" || !viewModel) && !composing && created.length === 0) {
    return (
      <div style={{ display: "grid", justifyItems: "center" }}>
        <EmptyState
          hint={t({
            en: "No live mailbox provider is connected. You can still prepare a local draft without sending it.",
            zh: "当前未连接在线邮箱，但仍可准备一份不会自动发送的本地草稿。",
          })}
          icon="message"
          title={t({ en: "Mailbox not connected", zh: "邮箱尚未连接" })}
        />
        <button className="btn btn-primary btn-sm" onClick={() => setComposing(true)} type="button">
          <Icon name="plus" size={15} />
          {t({ en: "Prepare a local draft", zh: "准备本地草稿" })}
        </button>
      </div>
    );
  }

  const workspace = viewModel ?? emptyWorkspace;
  const createdDetail = created.find((entry) => entry.detail.conversationId === openId)?.detail;
  const fetchedDetail =
    openId && workspace.selected && workspace.selected.conversationId === openId
      ? workspace.selected
      : null;
  const detail =
    createdDetail ??
    fetchedDetail ??
    (openId === null ? workspace.selected : null);

  const allThreads = [...created.map((entry) => entry.item), ...workspace.threads];
  const query = search.trim().toLocaleLowerCase();
  const visibleThreads = query
    ? allThreads.filter((thread) =>
        [
          thread.participantName,
          thread.subject,
          thread.preview,
        ]
          .join(" ")
          .toLocaleLowerCase()
          .includes(query),
      )
    : allThreads;
  const activeId = detail?.conversationId ?? null;

  return (
    <div
      className={`ri-thread-workspace${openId || composing ? " has-open-thread" : ""}`}
    >
      <aside className="ri-thread-list">
        <div className="ri-list-head">
          <div>
            <span className="ri-list-count">
              {t({ en: "Conversation history", zh: "对话历史" })}
            </span>
            <span className="ri-list-total">
              {allThreads.length}
            </span>
          </div>
          <button
            aria-label={t({ en: "New conversation", zh: "发起新对话" })}
            className="ri-new-thread"
            onClick={() => setComposing(true)}
            type="button"
          >
            <Icon name="plus" size={16} />
          </button>
        </div>
        <label className="ri-thread-search">
          <Icon name="search" size={15} />
          <input
            aria-label={t({
              en: "Search conversation history",
              zh: "搜索对话历史",
            })}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t({ en: "Search conversations", zh: "搜索对话" })}
            type="search"
            value={search}
          />
        </label>
        <div className="ri-thread-scroll scroll">
          {visibleThreads.length ? (
            visibleThreads.map((thread) => (
              <ThreadRow
                active={thread.conversationId === activeId}
                key={thread.conversationId}
                onOpen={() => openThread(thread.conversationId)}
                thread={thread}
              />
            ))
          ) : (
            <EmptyState
              hint={t({
                en: "Try another name or subject.",
                zh: "换一个姓名或主题试试。",
              })}
              icon="search"
              title={t({ en: "No matches", zh: "没有匹配对话" })}
            />
          )}
        </div>
      </aside>

      <section className="ri-thread-main">
        {composing ? (
          <NewThreadForm
            initialBody={newThreadSeed?.body}
            initialContactId={newThreadSeed?.contactId}
            initialOrganization={newThreadSeed?.organization}
            initialRecipient={newThreadSeed?.recipient}
            initialSubject={newThreadSeed?.subject}
            onCancel={() => {
              setComposing(false);
              onNewThreadConsumed?.();
            }}
            onCreated={(entry) => {
              setCreated((previous) => [entry, ...previous]);
              setComposing(false);
              setOpenId(entry.detail.conversationId);
              onNewThreadConsumed?.();
            }}
            t={t}
          />
        ) : detail ? (
          <ThreadDetailView
            currentUserName={workspace.currentUserName}
            detail={detail}
            onBack={() => setOpenId(null)}
            t={t}
          />
        ) : (
          <EmptyState
            hint={t({
              en: "Select a conversation to review its history and prepare a reply.",
              zh: "选择一段对话，查看往来历史并准备回复。",
            })}
            icon="message"
            title={t({ en: "Choose a conversation", zh: "选择对话" })}
          />
        )}
      </section>

      {detail && !composing ? (
        <ThreadContextRail detail={detail} t={t} />
      ) : (
        <aside className="ri-thread-context ri-thread-context-empty" />
      )}
    </div>
  );
}

function RelationshipInboxPanel({
  onClose,
  initialSeed,
}: {
  onClose: () => void;
  initialSeed?: NewThreadSeed | null;
}) {
  const { t } = useOrbitLanguage();
  // 带 seed（来自联系人详情页"起草邮件"）时默认进对话 tab。
  const [tab, setTab] = useState<InboxTab>("threads");
  const [seed, setSeed] = useState<NewThreadSeed | null>(initialSeed ?? null);
  const [panelWidth, setPanelWidth] = useState(
    RELATIONSHIP_INBOX_DEFAULT_WIDTH,
  );
  const [widthHydrated, setWidthHydrated] = useState(false);
  const [resizing, setResizing] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const resizeOrigin = useRef<{ pointerX: number; width: number } | null>(
    null,
  );

  const focusable = useCallback(() => {
    const root = panelRef.current;
    if (!root) return [] as HTMLElement[];
    return Array.from(
      root.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((node) => node.offsetParent !== null || node === document.activeElement);
  }, []);

  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const items = focusable();
    (items[0] ?? panelRef.current)?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const nodes = focusable();
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const activeEl = document.activeElement;

      if (event.shiftKey && activeEl === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeEl === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused.current?.focus?.();
    };
  }, [focusable, onClose]);

  useEffect(() => {
    const storedWidth = Number(
      window.localStorage.getItem(RELATIONSHIP_INBOX_WIDTH_STORAGE_KEY),
    );
    if (Number.isFinite(storedWidth) && storedWidth > 0) {
      setPanelWidth(normalizeRelationshipInboxWidth(storedWidth));
    } else {
      setPanelWidth(RELATIONSHIP_INBOX_DEFAULT_WIDTH);
    }
    setWidthHydrated(true);
  }, []);

  useEffect(() => {
    if (!widthHydrated) return;
    window.localStorage.setItem(
      RELATIONSHIP_INBOX_WIDTH_STORAGE_KEY,
      String(panelWidth),
    );
  }, [panelWidth, widthHydrated]);

  useEffect(() => {
    if (!resizing) return;

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";

    function onPointerMove(event: PointerEvent) {
      const origin = resizeOrigin.current;
      if (!origin) return;
      setPanelWidth(
        clampRelationshipInboxWidth(
          origin.width + origin.pointerX - event.clientX,
        ),
      );
    }

    function onPointerUp() {
      resizeOrigin.current = null;
      setResizing(false);
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
    };
  }, [resizing]);

  const startPanelResize = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (event.button !== 0) return;
    event.preventDefault();
    resizeOrigin.current = {
      pointerX: event.clientX,
      width: panelWidth,
    };
    setResizing(true);
  };

  const resizePanelFromKeyboard = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
  ) => {
    const step = event.shiftKey ? 96 : 32;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setPanelWidth((current) =>
        clampRelationshipInboxWidth(current + step),
      );
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      setPanelWidth((current) =>
        clampRelationshipInboxWidth(current - step),
      );
    } else if (event.key === "Home") {
      event.preventDefault();
      setPanelWidth(
        clampRelationshipInboxWidth(RELATIONSHIP_INBOX_DEFAULT_WIDTH),
      );
    } else if (event.key === "End") {
      event.preventDefault();
      setPanelWidth(
        clampRelationshipInboxWidth(RELATIONSHIP_INBOX_MIN_WIDTH),
      );
    }
  };

  const tabs: { id: InboxTab; icon: string; label: ReactNode }[] = [
    { id: "threads", icon: "message", label: t({ en: "Threads", zh: "对话" }) },
    { id: "alerts", icon: "bell", label: t({ en: "Alerts", zh: "提醒" }) },
  ];

  return (
    <div
      data-orbit-real-page="relationship-inbox"
      style={{ inset: 0, position: "fixed", zIndex: ORBIT_Z.overlay }}
    >
      <div
        aria-hidden="true"
        onClick={onClose}
        style={{ background: "var(--scrim, rgba(10,12,16,0.42))", inset: 0, position: "absolute" }}
      />
      <div
        aria-label={t({ en: "Relationship inbox", zh: "关系收件箱" })}
        aria-modal="true"
        className={`ri-panel${resizing ? " is-resizing" : ""}`}
        ref={panelRef}
        role="dialog"
        style={{
          background: "var(--bg, #fff)",
          borderLeft: "1px solid var(--border)",
          bottom: 0,
          boxShadow: "var(--sh-pop, -8px 0 40px rgba(10,12,16,0.18))",
          display: "flex",
          flexDirection: "column",
          maxWidth: "calc(100vw - 24px)",
          outline: "none",
          position: "absolute",
          right: 0,
          top: 0,
          width: panelWidth,
        }}
        tabIndex={-1}
      >
        <div className="ri-panel-header">
          <div>
            <h2 className="h-section" style={{ margin: 0 }}>
              {t({ en: "Inbox", zh: "收件箱" })}
            </h2>
            <div className="ri-panel-kicker">
              {t({ en: "Relationships and follow-ups", zh: "关系与跟进" })}
            </div>
          </div>
          <button
            aria-label={t({ en: "Close", zh: "关闭" })}
            className="hit-44"
            onClick={onClose}
            style={{ alignItems: "center", background: "var(--surface-2)", border: "none", borderRadius: 999, color: "var(--text-2)", cursor: "pointer", display: "flex", height: 32, justifyContent: "center", width: 32 }}
            type="button"
          >
            <Icon name="x" size={17} />
          </button>
        </div>

        <button
          aria-label={t({
            en: "Resize inbox. Use left and right arrow keys.",
            zh: "调整收件箱宽度，可使用左右方向键。",
          })}
          aria-orientation="vertical"
          aria-valuemax={RELATIONSHIP_INBOX_MAX_WIDTH}
          aria-valuemin={RELATIONSHIP_INBOX_MIN_WIDTH}
          aria-valuenow={panelWidth}
          className="ri-resize-handle"
          data-relationship-inbox-resize-handle
          onDoubleClick={() =>
            setPanelWidth(
              clampRelationshipInboxWidth(RELATIONSHIP_INBOX_DEFAULT_WIDTH),
            )
          }
          onKeyDown={resizePanelFromKeyboard}
          onPointerDown={startPanelResize}
          role="separator"
          title={t({
            en: "Drag to resize · Double-click to reset",
            zh: "拖动调整宽度 · 双击恢复默认",
          })}
          type="button"
        >
          <span aria-hidden="true" />
        </button>

        <div className="ri-panel-tabs" role="tablist">
          {tabs.map((item) => (
            <button
              aria-selected={tab === item.id}
              className={`ri-tab${tab === item.id ? " is-on" : ""}`}
              key={item.id}
              onClick={() => setTab(item.id)}
              role="tab"
              type="button"
            >
              <Icon name={item.icon} size={15} />
              {item.label}
            </button>
          ))}
        </div>

        <div className={`ri-panel-body${tab === "alerts" ? " scroll" : ""}`}>
          {tab === "threads" ? (
            <ThreadsTab newThreadSeed={seed} onNewThreadConsumed={() => setSeed(null)} />
          ) : (
            <AlertsTab />
          )}
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
[data-orbit-real-page="relationship-inbox"] .ri-panel { animation:ri-slide .22s cubic-bezier(.22,1,.36,1); container:relationship-inbox / inline-size; }
@keyframes ri-slide { from { transform: translateX(24px); opacity: .6; } to { transform: translateX(0); opacity: 1; } }
[data-orbit-real-page="relationship-inbox"] .ri-tab { display:inline-flex; align-items:center; gap:6px; height:34px; padding:0 14px; border-radius:var(--r-pill, 999px); border:1px solid transparent; background:transparent; color:var(--text-3); font-family:var(--ff); font-size:13.5px; font-weight:600; cursor:pointer; transition:background .15s, color .15s; }
[data-orbit-real-page="relationship-inbox"] .ri-tab:hover { color:var(--text); }
[data-orbit-real-page="relationship-inbox"] .ri-tab.is-on { background:var(--accent-soft); color:var(--accent); }
@media (prefers-reduced-motion: reduce) { [data-orbit-real-page="relationship-inbox"] .ri-panel { animation:none; } }

[data-orbit-real-page="relationship-inbox"] .ri-row { display:grid; grid-template-columns:38px 1fr auto; gap:11px; align-items:start; width:100%; text-align:left; padding:11px 12px; border:0; border-radius:12px; background:transparent; cursor:pointer; transition:background .14s; }
[data-orbit-real-page="relationship-inbox"] .ri-row:hover { background:var(--surface-2); }
[data-orbit-real-page="relationship-inbox"] .ri-row-main { min-width:0; display:flex; flex-direction:column; gap:2px; }
[data-orbit-real-page="relationship-inbox"] .ri-row-top { display:flex; align-items:baseline; justify-content:space-between; gap:8px; }
[data-orbit-real-page="relationship-inbox"] .ri-row-name { font-size:13.5px; font-weight:700; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
[data-orbit-real-page="relationship-inbox"] .ri-row-time { font-size:11px; color:var(--text-3); flex-shrink:0; }
[data-orbit-real-page="relationship-inbox"] .ri-row-subject { font-size:13px; font-weight:600; color:var(--text-2); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
[data-orbit-real-page="relationship-inbox"] .ri-row-preview { font-size:12.5px; color:var(--text-3); line-height:1.4; overflow:hidden; text-overflow:ellipsis; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
[data-orbit-real-page="relationship-inbox"] .ri-row-unread { align-self:center; min-width:18px; height:18px; padding:0 5px; border-radius:999px; background:var(--accent); color:#fff; font-size:11px; font-weight:700; line-height:18px; text-align:center; }

[data-orbit-real-page="relationship-inbox"] .ri-detail { display:flex; flex-direction:column; gap:12px; padding:6px 8px; }
[data-orbit-real-page="relationship-inbox"] .ri-detail-head { display:flex; align-items:flex-start; gap:8px; }
[data-orbit-real-page="relationship-inbox"] .ri-back { flex-shrink:0; display:inline-flex; align-items:center; justify-content:center; width:30px; height:30px; border:0; border-radius:999px; background:var(--surface-2); color:var(--text-2); cursor:pointer; }
[data-orbit-real-page="relationship-inbox"] .ri-detail-subject { font-size:15px; font-weight:700; color:var(--text); line-height:1.3; }
[data-orbit-real-page="relationship-inbox"] .ri-detail-summary { font-size:12.5px; color:var(--text-3); line-height:1.5; margin-top:3px; }
[data-orbit-real-page="relationship-inbox"] .ri-src-row { display:flex; flex-wrap:wrap; gap:6px; }
[data-orbit-real-page="relationship-inbox"] .ri-msgs { display:flex; flex-direction:column; gap:12px; }
[data-orbit-real-page="relationship-inbox"] .ri-msg { max-width:86%; align-self:flex-start; background:var(--surface-2); border-radius:12px; padding:9px 12px; }
[data-orbit-real-page="relationship-inbox"] .ri-msg.is-me { align-self:flex-end; background:var(--accent-soft); }
[data-orbit-real-page="relationship-inbox"] .ri-msg-meta { display:flex; align-items:baseline; justify-content:space-between; gap:8px; margin-bottom:3px; }
[data-orbit-real-page="relationship-inbox"] .ri-msg-sender { font-size:12px; font-weight:700; color:var(--text-2); }
[data-orbit-real-page="relationship-inbox"] .ri-msg-time { font-size:10.5px; color:var(--text-3); }
[data-orbit-real-page="relationship-inbox"] .ri-msg-body { font-size:13.5px; color:var(--text); line-height:1.5; white-space:pre-wrap; }
[data-orbit-real-page="relationship-inbox"] .ri-boundary { display:flex; align-items:flex-start; gap:7px; padding:9px 11px; border-radius:10px; background:var(--surface-2); color:var(--text-3); font-size:11.5px; line-height:1.45; }
[data-orbit-real-page="relationship-inbox"] .ri-boundary svg { color:var(--text-3); flex-shrink:0; margin-top:1px; }

[data-orbit-real-page="relationship-inbox"] .ri-composer { display:flex; flex-direction:column; gap:9px; border-top:1px solid var(--hairline); padding-top:12px; }
[data-orbit-real-page="relationship-inbox"] .ri-composer-label { font-size:12px; font-weight:600; color:var(--text-3); }
[data-orbit-real-page="relationship-inbox"] .ri-composer-input { min-height:96px; resize:vertical; font-family:var(--ff); font-size:13.5px; line-height:1.5; }
[data-orbit-real-page="relationship-inbox"] .ri-composer-actions { display:flex; gap:8px; }
[data-orbit-real-page="relationship-inbox"] .ri-staged { display:flex; flex-direction:column; gap:10px; border-top:1px solid var(--hairline); padding-top:12px; }
[data-orbit-real-page="relationship-inbox"] .ri-staged-head { display:flex; align-items:center; gap:7px; font-size:12.5px; font-weight:700; color:var(--accent); }
[data-orbit-real-page="relationship-inbox"] .ri-staged-body { font-size:13.5px; color:var(--text); line-height:1.5; white-space:pre-wrap; padding:11px 12px; border-radius:10px; background:var(--accent-softer); }

[data-orbit-real-page="relationship-inbox"] .ri-list-head { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:4px 10px 10px; }
[data-orbit-real-page="relationship-inbox"] .ri-list-count { font-size:12px; font-weight:700; color:var(--text-3); text-transform:uppercase; letter-spacing:.04em; }
[data-orbit-real-page="relationship-inbox"] .ri-new { display:flex; flex-direction:column; gap:8px; padding:6px 8px; }
[data-orbit-real-page="relationship-inbox"] .ri-new-head { display:flex; align-items:center; gap:8px; margin-bottom:4px; }
[data-orbit-real-page="relationship-inbox"] .ri-new-label { font-size:12px; font-weight:600; color:var(--text-3); margin-top:4px; }
[data-orbit-real-page="relationship-inbox"] .ri-new-error { font-size:12.5px; color:#e5484d; }

[data-orbit-real-page="relationship-inbox"] .ri-alerts { display:flex; flex-direction:column; gap:16px; padding:6px 8px; }
[data-orbit-real-page="relationship-inbox"] .ri-alert-group { display:flex; flex-direction:column; gap:8px; }
[data-orbit-real-page="relationship-inbox"] .ri-alert-eyebrow { font-size:11px; font-weight:700; color:var(--text-3); text-transform:uppercase; letter-spacing:.05em; padding:0 4px; }
[data-orbit-real-page="relationship-inbox"] .ri-alert { display:grid; grid-template-columns:1fr auto; gap:8px; align-items:start; padding:11px 12px; border-radius:12px; background:var(--surface-2); border-left:3px solid transparent; }
[data-orbit-real-page="relationship-inbox"] .ri-alert-proactive { border-left-color:var(--accent); background:var(--accent-softer); }
[data-orbit-real-page="relationship-inbox"] .ri-alert-pri-high { border-left-color:#e5484d; }
[data-orbit-real-page="relationship-inbox"] .ri-alert-pri-normal { border-left-color:var(--accent); }
[data-orbit-real-page="relationship-inbox"] .ri-alert-main { display:flex; flex-direction:column; gap:4px; min-width:0; }
[data-orbit-real-page="relationship-inbox"] .ri-alert-nav { text-decoration:none; color:inherit; }
[data-orbit-real-page="relationship-inbox"] .ri-alert-title { font-size:13.5px; font-weight:700; color:var(--text); line-height:1.35; }
[data-orbit-real-page="relationship-inbox"] .ri-alert-body { font-size:12.5px; color:var(--text-2); line-height:1.5; }
[data-orbit-real-page="relationship-inbox"] .ri-alert-meta { font-size:12px; color:var(--text-3); }
[data-orbit-real-page="relationship-inbox"] .ri-alert-due { font-size:11.5px; color:var(--text-3); }
[data-orbit-real-page="relationship-inbox"] .ri-alert-link { display:inline-flex; align-items:center; gap:5px; margin-top:3px; font-size:12px; font-weight:600; color:var(--accent); text-decoration:none; width:fit-content; }
[data-orbit-real-page="relationship-inbox"] .ri-alert-dismiss { display:inline-flex; align-items:center; justify-content:center; width:26px; height:26px; border:0; border-radius:999px; background:transparent; color:var(--text-3); cursor:pointer; flex-shrink:0; }
[data-orbit-real-page="relationship-inbox"] .ri-alert-dismiss:hover { background:var(--surface-3); color:var(--text); }

[data-orbit-real-page="relationship-inbox"] .ri-panel-header { min-height:74px; padding:16px 20px 13px; border-bottom:1px solid var(--hairline); display:flex; align-items:center; justify-content:space-between; gap:16px; }
[data-orbit-real-page="relationship-inbox"] .ri-panel-kicker { margin-top:3px; color:var(--text-3); font-size:11.5px; line-height:1.3; }
[data-orbit-real-page="relationship-inbox"] .ri-panel-tabs { height:47px; padding:7px 18px 6px; border-bottom:1px solid var(--hairline); display:flex; align-items:center; gap:3px; }
[data-orbit-real-page="relationship-inbox"] .ri-panel-body { flex:1; min-height:0; overflow:hidden; }
[data-orbit-real-page="relationship-inbox"] .ri-panel-body.scroll { overflow-y:auto; padding:14px 16px 18px; }

[data-orbit-real-page="relationship-inbox"] .ri-resize-handle { position:absolute; z-index:4; top:0; bottom:0; left:-7px; width:14px; padding:0; border:0; background:transparent; cursor:ew-resize; touch-action:none; }
[data-orbit-real-page="relationship-inbox"] .ri-resize-handle::before { content:""; position:absolute; inset:0 6px; background:transparent; transition:background .15s; }
[data-orbit-real-page="relationship-inbox"] .ri-resize-handle span { position:absolute; top:50%; left:3px; width:7px; height:52px; border:1px solid var(--border); border-radius:999px; background:var(--bg); box-shadow:0 2px 10px rgba(22,18,40,.12); opacity:0; transform:translateY(-50%) scale(.9); transition:opacity .15s, transform .15s; }
[data-orbit-real-page="relationship-inbox"] .ri-resize-handle:hover::before,
[data-orbit-real-page="relationship-inbox"] .ri-resize-handle:focus-visible::before,
[data-orbit-real-page="relationship-inbox"] .ri-panel.is-resizing .ri-resize-handle::before { background:var(--accent); }
[data-orbit-real-page="relationship-inbox"] .ri-resize-handle:hover span,
[data-orbit-real-page="relationship-inbox"] .ri-resize-handle:focus-visible span,
[data-orbit-real-page="relationship-inbox"] .ri-panel.is-resizing .ri-resize-handle span { opacity:1; transform:translateY(-50%) scale(1); }
[data-orbit-real-page="relationship-inbox"] .ri-resize-handle:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }

[data-orbit-real-page="relationship-inbox"] .ri-thread-workspace { display:grid; grid-template-columns:minmax(248px, 29%) minmax(340px, 1fr) 220px; height:100%; min-height:0; background:var(--bg); }
[data-orbit-real-page="relationship-inbox"] .ri-thread-list { display:flex; min-width:0; min-height:0; flex-direction:column; border-right:1px solid var(--hairline); background:color-mix(in srgb, var(--surface-2) 52%, var(--bg)); }
[data-orbit-real-page="relationship-inbox"] .ri-thread-main { min-width:0; min-height:0; overflow-y:auto; background:var(--bg); }
[data-orbit-real-page="relationship-inbox"] .ri-thread-context { min-width:0; min-height:0; overflow-y:auto; padding:22px 18px; border-left:1px solid var(--hairline); background:color-mix(in srgb, var(--surface-2) 38%, var(--bg)); }
[data-orbit-real-page="relationship-inbox"] .ri-thread-context-empty { display:block; }
[data-orbit-real-page="relationship-inbox"] .ri-thread-scroll { flex:1; min-height:0; overflow-y:auto; padding:0 8px 14px; }

[data-orbit-real-page="relationship-inbox"] .ri-list-head { padding:16px 14px 10px; }
[data-orbit-real-page="relationship-inbox"] .ri-list-count { color:var(--text-2); font-size:12.5px; letter-spacing:0; text-transform:none; }
[data-orbit-real-page="relationship-inbox"] .ri-list-total { display:inline-flex; align-items:center; justify-content:center; min-width:20px; height:20px; margin-left:7px; padding:0 6px; border-radius:999px; background:var(--surface-3); color:var(--text-3); font-size:10.5px; font-weight:700; }
[data-orbit-real-page="relationship-inbox"] .ri-new-thread { display:inline-flex; align-items:center; justify-content:center; width:30px; height:30px; border:1px solid var(--border); border-radius:9px; background:var(--bg); color:var(--accent); cursor:pointer; transition:border-color .15s, background .15s; }
[data-orbit-real-page="relationship-inbox"] .ri-new-thread:hover { border-color:var(--accent); background:var(--accent-softer); }
[data-orbit-real-page="relationship-inbox"] .ri-thread-search { height:34px; margin:0 12px 10px; padding:0 10px; border:1px solid var(--hairline); border-radius:9px; background:var(--bg); color:var(--text-3); display:flex; align-items:center; gap:7px; transition:border-color .15s, box-shadow .15s; }
[data-orbit-real-page="relationship-inbox"] .ri-thread-search:focus-within { border-color:var(--accent); box-shadow:0 0 0 3px var(--accent-softer); }
[data-orbit-real-page="relationship-inbox"] .ri-thread-search input { width:100%; min-width:0; border:0; outline:0; background:transparent; color:var(--text); font:12.5px/1.3 var(--ff); }
[data-orbit-real-page="relationship-inbox"] .ri-thread-search input::placeholder { color:var(--text-3); }

[data-orbit-real-page="relationship-inbox"] .ri-row { position:relative; grid-template-columns:36px minmax(0,1fr) auto; gap:10px; padding:11px 10px; border-radius:10px; }
[data-orbit-real-page="relationship-inbox"] .ri-row::before { content:""; position:absolute; left:0; top:10px; bottom:10px; width:2px; border-radius:999px; background:transparent; }
[data-orbit-real-page="relationship-inbox"] .ri-row.is-active { background:var(--bg); box-shadow:0 1px 0 rgba(20,16,36,.04), 0 4px 16px rgba(20,16,36,.05); }
[data-orbit-real-page="relationship-inbox"] .ri-row.is-active::before { background:var(--accent); }
[data-orbit-real-page="relationship-inbox"] .ri-row.is-active .ri-row-subject { color:var(--text); }
[data-orbit-real-page="relationship-inbox"] .ri-row-name { font-size:13px; }
[data-orbit-real-page="relationship-inbox"] .ri-row-subject { font-size:12.5px; }
[data-orbit-real-page="relationship-inbox"] .ri-row-preview { -webkit-line-clamp:1; font-size:11.75px; }

[data-orbit-real-page="relationship-inbox"] .ri-detail { min-height:100%; gap:0; padding:0; }
[data-orbit-real-page="relationship-inbox"] .ri-detail-head { position:sticky; z-index:2; top:0; min-height:72px; padding:17px 22px 14px; border-bottom:1px solid var(--hairline); background:color-mix(in srgb, var(--bg) 92%, transparent); backdrop-filter:blur(14px); }
[data-orbit-real-page="relationship-inbox"] .ri-detail > .ri-detail-head .ri-back { display:none; }
[data-orbit-real-page="relationship-inbox"] .ri-detail-subject { font-size:16px; letter-spacing:-.01em; }
[data-orbit-real-page="relationship-inbox"] .ri-detail-summary { max-width:620px; }
[data-orbit-real-page="relationship-inbox"] .ri-src-row { padding:12px 22px 0; }
[data-orbit-real-page="relationship-inbox"] .ri-msgs { flex:1; gap:15px; padding:22px clamp(20px, 4cqi, 42px) 28px; }
[data-orbit-real-page="relationship-inbox"] .ri-msg { max-width:min(82%, 560px); padding:10px 13px; border:1px solid var(--hairline); border-radius:5px 14px 14px 14px; background:var(--surface-2); }
[data-orbit-real-page="relationship-inbox"] .ri-msg.is-me { border-color:color-mix(in srgb, var(--accent) 20%, transparent); border-radius:14px 5px 14px 14px; background:var(--accent-softer); }
[data-orbit-real-page="relationship-inbox"] .ri-msg-body { font-size:13.75px; line-height:1.58; }
[data-orbit-real-page="relationship-inbox"] .ri-composer,
[data-orbit-real-page="relationship-inbox"] .ri-staged { position:sticky; bottom:0; margin:0 20px 18px; padding:14px; border:1px solid var(--border); border-radius:13px; background:color-mix(in srgb, var(--bg) 94%, transparent); box-shadow:0 10px 30px rgba(20,16,36,.09); backdrop-filter:blur(16px); }
[data-orbit-real-page="relationship-inbox"] .ri-composer-input { min-height:82px; }
[data-orbit-real-page="relationship-inbox"] .ri-boundary { border:1px solid var(--hairline); background:color-mix(in srgb, var(--surface-2) 70%, var(--bg)); }
[data-orbit-real-page="relationship-inbox"] .ri-new { max-width:680px; margin:0 auto; padding:22px; }

[data-orbit-real-page="relationship-inbox"] .ri-context-person { display:flex; align-items:center; gap:11px; padding-bottom:19px; border-bottom:1px solid var(--hairline); }
[data-orbit-real-page="relationship-inbox"] .ri-context-name { color:var(--text); font-size:13.5px; font-weight:700; line-height:1.3; }
[data-orbit-real-page="relationship-inbox"] .ri-context-org { margin-top:3px; color:var(--text-3); font-size:11.5px; line-height:1.35; }
[data-orbit-real-page="relationship-inbox"] .ri-context-section { padding:18px 0; border-bottom:1px solid var(--hairline); }
[data-orbit-real-page="relationship-inbox"] .ri-context-label { margin-bottom:8px; color:var(--text-3); font-size:10.5px; font-weight:750; letter-spacing:.07em; text-transform:uppercase; }
[data-orbit-real-page="relationship-inbox"] .ri-context-summary { margin:0; color:var(--text-2); font-size:12px; line-height:1.58; }
[data-orbit-real-page="relationship-inbox"] .ri-context-signals { display:flex; flex-wrap:wrap; gap:6px; }
[data-orbit-real-page="relationship-inbox"] .ri-context-signals span { padding:5px 7px; border:1px solid var(--hairline); border-radius:7px; background:var(--bg); color:var(--text-2); font-size:10.75px; line-height:1.3; }
[data-orbit-real-page="relationship-inbox"] .ri-context-safety { display:flex; align-items:flex-start; gap:7px; margin-top:18px; color:var(--text-3); font-size:10.75px; line-height:1.5; }
[data-orbit-real-page="relationship-inbox"] .ri-context-safety svg { flex:0 0 auto; margin-top:1px; color:var(--accent); }

@container relationship-inbox (max-width: 880px) {
  [data-orbit-real-page="relationship-inbox"] .ri-thread-workspace { grid-template-columns:minmax(228px, 34%) minmax(0, 1fr); }
  [data-orbit-real-page="relationship-inbox"] .ri-thread-context { display:none; }
}

@container relationship-inbox (max-width: 680px) {
  [data-orbit-real-page="relationship-inbox"] .ri-thread-workspace { display:block; }
  [data-orbit-real-page="relationship-inbox"] .ri-thread-list,
  [data-orbit-real-page="relationship-inbox"] .ri-thread-main { width:100%; height:100%; border:0; }
  [data-orbit-real-page="relationship-inbox"] .ri-thread-main { display:none; }
  [data-orbit-real-page="relationship-inbox"] .ri-thread-workspace.has-open-thread .ri-thread-list { display:none; }
  [data-orbit-real-page="relationship-inbox"] .ri-thread-workspace.has-open-thread .ri-thread-main { display:block; }
  [data-orbit-real-page="relationship-inbox"] .ri-detail > .ri-detail-head .ri-back { display:inline-flex; }
  [data-orbit-real-page="relationship-inbox"] .ri-detail-head { padding-left:14px; }
}

@media (max-width: 640px) {
  [data-orbit-real-page="relationship-inbox"] .ri-panel { width:100vw !important; max-width:100vw !important; border-left:0 !important; }
  [data-orbit-real-page="relationship-inbox"] .ri-resize-handle { display:none; }
}
` }} />
    </div>
  );
}

// 顶栏右上角入口：信封图标 + 未读 badge（对话未读 + 待处理提醒的聚合计数）。
// unreadCount prop 作为初始值/测试覆盖；挂载后按真实数据刷新。
export function RelationshipInboxTrigger({ unreadCount = 0 }: { unreadCount?: number }) {
  const { t, language } = useOrbitLanguage();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(unreadCount);
  const [seed, setSeed] = useState<NewThreadSeed | null>(null);
  // 顶栏（含 backdrop-filter）会成为 fixed 定位的包含块，把面板困在 72px 高的导航条内。
  // 用 portal 把面板挂到 document.body，让 slide-over 正确覆盖整个视口。
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // 挂载后拉取真实聚合计数。
  useEffect(() => {
    let active = true;
    fetchBadgeCount(language)
      .then((value) => {
        if (active) setCount(value);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [language]);

  // 监听"起草邮件"等外部入口的 compose 事件，打开面板并带上收件人。
  useEffect(() => {
    function onCompose(event: Event) {
      // 多数页面同时保留 desktop/mobile DOM，再由 CSS 只显示其中一个。
      // 只有当前可见的 trigger 消费全局 compose 事件，避免两个 portal 同时打开。
      if (
        !triggerRef.current ||
        !hasRenderedComposeTriggerArea(triggerRef.current)
      ) {
        return;
      }
      const detail = (event as CustomEvent<NewThreadSeed>).detail ?? {};
      setSeed({
        body: detail.body,
        contactId: detail.contactId,
        recipient: detail.recipient,
        organization: detail.organization,
        subject: detail.subject,
      });
      setOpen(true);
    }
    window.addEventListener(RELATIONSHIP_INBOX_COMPOSE_EVENT, onCompose);
    return () => window.removeEventListener(RELATIONSHIP_INBOX_COMPOSE_EVENT, onCompose);
  }, []);

  // 「打开草稿箱」类入口：只开面板到线程列表，不带 compose 种子。
  useEffect(() => {
    function onOpen() {
      if (
        !triggerRef.current ||
        !hasRenderedComposeTriggerArea(triggerRef.current)
      ) {
        return;
      }
      setSeed(null);
      setOpen(true);
    }
    window.addEventListener(RELATIONSHIP_INBOX_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(RELATIONSHIP_INBOX_OPEN_EVENT, onOpen);
  }, []);

  const displayCount = count;

  return (
    <>
      <button
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={t({ en: "Open inbox", zh: "打开收件箱" })}
        className="hit-44 ri-trigger"
        ref={triggerRef}
        onClick={() => {
          setSeed(null);
          setOpen(true);
        }}
        style={{
          alignItems: "center",
          background: "transparent",
          border: "none",
          borderRadius: 999,
          color: "var(--text-2)",
          cursor: "pointer",
          display: "inline-flex",
          height: 36,
          justifyContent: "center",
          position: "relative",
          width: 36,
        }}
        type="button"
      >
        <Icon name="bell" size={19} stroke={1.7} />
        {displayCount > 0 ? (
          <span
            aria-hidden="true"
            style={{
              background: "var(--signal, #c8323b)",
              borderRadius: 999,
              color: "#fff",
              fontSize: 11,
              fontWeight: 700,
              lineHeight: "17px",
              minWidth: 17,
              padding: "0 4px",
              position: "absolute",
              right: 2,
              textAlign: "center",
              top: 2,
            }}
          >
            {displayCount > 99 ? "99+" : displayCount}
          </span>
        ) : null}
      </button>
      {open && mounted
        ? createPortal(
            <RelationshipInboxPanel initialSeed={seed} onClose={() => setOpen(false)} />,
            document.body,
          )
        : null}
    </>
  );
}
