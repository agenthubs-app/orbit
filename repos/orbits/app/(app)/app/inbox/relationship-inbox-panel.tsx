"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { useOrbitLanguage } from "../orbit-language-context";
import { Avatar, Icon } from "../orbit-reference-primitives";
import {
  toCreatedThread,
  toInboxPanelViewModel,
  toProactiveAlerts,
  toReminderAlerts,
  unreadThreadCount,
  type InboxPanelViewModel,
  type InboxProactiveAlert,
  type InboxReminderAlert,
  type InboxThreadDetail,
  type InboxThreadListItem,
} from "./inbox-panel-view-model";

type InboxTab = "threads" | "alerts";

interface NewThreadSeed {
  recipient?: string;
  organization?: string;
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

// 拉取 async correspondence workspace。传 conversationId 选中某条线程。
// 面板只经这里的 view model 消费数据，不直接依赖 feature 契约的运行时代码。
async function fetchInboxWorkspace(
  conversationId?: string,
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
  );
}

function initialOf(name: string): string {
  return name.trim().slice(0, 1).toUpperCase() || "?";
}

// badge 聚合：未读对话数 + 待处理提醒（reminders + proactive）数。fail-closed 返回 0。
async function fetchBadgeCount(): Promise<number> {
  try {
    const [inbox, reminders, proactive] = await Promise.all([
      fetchInboxWorkspace().catch(() => null),
      fetchReminderAlerts(),
      fetchProactiveAlerts(),
    ]);
    const unreadThreads = inbox ? unreadThreadCount(inbox.threads) : 0;
    return unreadThreads + reminders.length + proactive.length;
  } catch {
    return 0;
  }
}

// 用 message-draft-generator 生成首封草稿（subject + body），供发起新对话预填。
// 只生成可复核草稿，不发送。失败时返回 null。
async function generateMessageDraft(input: {
  recipientName: string;
  organization: string;
}): Promise<{ subject: string; body: string } | null> {
  try {
    const response = await fetch("/api/message-drafts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        draftKind: "follow_up",
        channel: "email",
        recipientName: input.recipientName,
        organization: input.organization,
      }),
    });
    const envelope = (await response.json()) as {
      success?: boolean;
      data?: { drafts?: { subject?: string; body?: string }[] };
    };
    if (!response.ok || envelope.success !== true) {
      return null;
    }
    const draft = envelope.data?.drafts?.[0];
    if (!draft) {
      return null;
    }
    return { subject: draft.subject ?? "", body: draft.body ?? "" };
  } catch {
    return null;
  }
}

// draft→thread：从确认后的草稿创建一个新的本地 staged 对话线程。
async function createThreadFromDraft(input: {
  participantName: string;
  organization: string;
  subject: string;
  body: string;
}): Promise<ReturnType<typeof toCreatedThread> | null> {
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
    );
  } catch {
    return null;
  }
}

// AI 礼貌改写：把当前草稿文本交给 chat writing-assist（确定性，非真实 AI provider）。
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
async function fetchReminderAlerts(): Promise<readonly InboxReminderAlert[]> {
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
    );
  } catch {
    return [];
  }
}

async function fetchProactiveAlerts(): Promise<readonly InboxProactiveAlert[]> {
  try {
    // GET 返回演示用的主动 nudge（内置 demo 信号），无需构造 signal。
    const response = await fetch("/api/ai/proactive-turns", {
      headers: { accept: "application/json" },
    });
    const envelope = (await response.json()) as { success?: boolean; data?: unknown };
    if (!response.ok || envelope.success !== true || !envelope.data) {
      return [];
    }
    return toProactiveAlerts(
      envelope.data as Parameters<typeof toProactiveAlerts>[0],
    );
  } catch {
    return [];
  }
}

function AlertsTab() {
  const { t } = useOrbitLanguage();
  const [state, setState] = useState<"loading" | "ready">("loading");
  const [reminders, setReminders] = useState<readonly InboxReminderAlert[]>([]);
  const [proactive, setProactive] = useState<readonly InboxProactiveAlert[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    let active = true;
    setState("loading");
    Promise.all([fetchReminderAlerts(), fetchProactiveAlerts()])
      .then(([reminderAlerts, proactiveAlerts]) => {
        if (!active) return;
        setReminders(reminderAlerts);
        setProactive(proactiveAlerts);
        setState("ready");
      })
      .catch(() => {
        if (active) setState("ready");
      });
    return () => {
      active = false;
    };
  }, []);

  const dismiss = (id: string) =>
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });

  if (state === "loading") {
    return <EmptyState hint={t({ en: "Loading alerts…", zh: "正在加载提醒…" })} icon="bell" title={t({ en: "Loading", zh: "加载中" })} />;
  }

  const visibleReminders = reminders.filter((item) => !dismissed.has(item.id));
  const visibleProactive = proactive.filter((item) => !dismissed.has(item.id));

  if (!visibleReminders.length && !visibleProactive.length) {
    return <EmptyState hint={t({ en: "Reminders and proactive nudges will appear here.", zh: "提醒和主动提示会显示在这里。" })} icon="bell" title={t({ en: "All clear", zh: "暂无提醒" })} />;
  }

  return (
    <div className="ri-alerts">
      {visibleProactive.length ? (
        <div className="ri-alert-group">
          <div className="ri-alert-eyebrow">{t({ en: "From Orbit AI", zh: "来自 Orbit AI" })}</div>
          {visibleProactive.map((alert) => (
            <div className="ri-alert ri-alert-proactive" key={alert.id}>
              <div className="ri-alert-main">
                <div className="ri-alert-title">{alert.title}</div>
                <div className="ri-alert-body">{alert.body}</div>
                <a className="ri-alert-link" href={alert.href}>
                  <Icon name="sparkle" size={13} />
                  {alert.actionLabel}
                </a>
              </div>
              <button aria-label={t({ en: "Dismiss", zh: "忽略" })} className="ri-alert-dismiss" onClick={() => dismiss(alert.id)} type="button">
                <Icon name="x" size={14} />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {visibleReminders.length ? (
        <div className="ri-alert-group">
          <div className="ri-alert-eyebrow">{t({ en: "Reminders", zh: "跟进提醒" })}</div>
          {visibleReminders.map((alert) => (
            <div className={`ri-alert ri-alert-pri-${alert.priority}`} key={alert.id}>
              <a className="ri-alert-main ri-alert-nav" href={alert.href}>
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
        <span>{t({ en: "Nothing is delivered — no push, email, SMS, or notification was sent.", zh: "没有任何投递 — 未发送推送、邮件、短信或通知。" })}</span>
      </div>
    </div>
  );
}

function ThreadRow({
  thread,
  onOpen,
}: {
  thread: InboxThreadListItem;
  onOpen: () => void;
}) {
  return (
    <button className="ri-row" onClick={onOpen} type="button">
      <Avatar letter={initialOf(thread.participantName)} g="g-violet" size={38} />
      <span className="ri-row-main">
        <span className="ri-row-top">
          <span className="ri-row-name">{thread.participantName}</span>
          <span className="ri-row-time mono">{thread.lastCorrespondenceAt}</span>
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

// 回复草稿编辑器：本地编辑 + AI 改写 + 发送（需确认）。
// 发送只把草稿转成本地暂存预览（staged_local_preview 语义），不发送任何真实消息，
// 不触发外部副作用。这是页面内"给人脉发信息"的往来回复环节。
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
          {rewriting ? t({ en: "Rewriting…", zh: "改写中…" }) : t({ en: "AI rewrite", zh: "AI 改写" })}
        </button>
        <button className="btn btn-primary btn-sm" disabled={!body.trim()} onClick={() => setStaged(true)} style={{ flex: 1, justifyContent: "center" }} type="button">
          <Icon name="mail" size={15} />
          {t({ en: "Send (confirm)", zh: "发送（需确认）" })}
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
              <span className="ri-msg-time mono">{message.occurredAt}</span>
            </div>
            <div className="ri-msg-body">{message.body}</div>
          </div>
        ))}
      </div>

      <ReplyComposer detail={detail} t={t} />
    </div>
  );
}

// 发起新对话：填写收件人 → AI 生成草稿 → 确认创建 staged 线程。
// 生成走 message-draft-generator，创建走 async createConversationFromDraft，
// 全程草稿优先、不发送、无外部副作用。
function NewThreadForm({
  initialRecipient,
  initialOrganization,
  onCreated,
  onCancel,
  t,
}: {
  initialRecipient?: string;
  initialOrganization?: string;
  onCreated: (created: ReturnType<typeof toCreatedThread>) => void;
  onCancel: () => void;
  t: (copy: { en: string; zh: string }) => string;
}) {
  const [recipient, setRecipient] = useState(initialRecipient ?? "");
  const [organization, setOrganization] = useState(initialOrganization ?? "");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState<"idle" | "generating" | "creating">("idle");
  const [error, setError] = useState(false);

  const onGenerate = async () => {
    setBusy("generating");
    setError(false);
    const draft = await generateMessageDraft({
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
    const created = await createThreadFromDraft({
      participantName: recipient,
      organization,
      subject,
      body,
    });
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
        {busy === "generating" ? t({ en: "Generating…", zh: "生成中…" }) : t({ en: "Generate draft", zh: "AI 生成草稿" })}
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
  newThreadSeed?: { recipient?: string; organization?: string } | null;
  onNewThreadConsumed?: () => void;
}) {
  const { t } = useOrbitLanguage();
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [viewModel, setViewModel] = useState<InboxPanelViewModel | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [created, setCreated] = useState<ReturnType<typeof toCreatedThread>[]>([]);

  useEffect(() => {
    let active = true;
    setState("loading");
    fetchInboxWorkspace()
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
  }, []);

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
    fetchInboxWorkspace(conversationId)
      .then((model) => setViewModel(model))
      .catch(() => undefined);
  };

  if (composing) {
    return (
      <NewThreadForm
        initialOrganization={newThreadSeed?.organization}
        initialRecipient={newThreadSeed?.recipient}
        onCancel={() => {
          setComposing(false);
          onNewThreadConsumed?.();
        }}
        onCreated={(entry) => {
          setCreated((prev) => [entry, ...prev]);
          setComposing(false);
          setOpenId(entry.detail.conversationId);
          onNewThreadConsumed?.();
        }}
        t={t}
      />
    );
  }

  if (state === "loading") {
    return <EmptyState hint={t({ en: "Loading conversations…", zh: "正在加载对话…" })} icon="message" title={t({ en: "Loading", zh: "加载中" })} />;
  }

  if (state === "error" || !viewModel) {
    return <EmptyState hint={t({ en: "Could not load conversations. Close and reopen to retry.", zh: "无法加载对话，关闭后重新打开可重试。" })} icon="message" title={t({ en: "Load failed", zh: "加载失败" })} />;
  }

  const createdDetail = created.find((entry) => entry.detail.conversationId === openId)?.detail;
  const fetchedDetail =
    openId && viewModel.selected && viewModel.selected.conversationId === openId
      ? viewModel.selected
      : null;
  const detail = createdDetail ?? fetchedDetail;

  if (openId && detail) {
    return (
      <ThreadDetailView
        currentUserName={viewModel.currentUserName}
        detail={detail}
        onBack={() => setOpenId(null)}
        t={t}
      />
    );
  }

  const allThreads = [...created.map((entry) => entry.item), ...viewModel.threads];

  return (
    <div>
      <div className="ri-list-head">
        <span className="ri-list-count">{t({ en: "Conversations", zh: "对话" })}</span>
        <button className="btn btn-primary btn-sm" onClick={() => setComposing(true)} type="button">
          <Icon name="mail" size={15} />
          {t({ en: "New", zh: "发起" })}
        </button>
      </div>
      {allThreads.length ? (
        allThreads.map((thread) => (
          <ThreadRow key={thread.conversationId} onOpen={() => openThread(thread.conversationId)} thread={thread} />
        ))
      ) : (
        <EmptyState hint={t({ en: "Start a new conversation with a contact.", zh: "与联系人发起一段新对话。" })} icon="message" title={t({ en: "No conversations yet", zh: "暂无对话" })} />
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
  const panelRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

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

  const tabs: { id: InboxTab; icon: string; label: ReactNode }[] = [
    { id: "threads", icon: "message", label: t({ en: "Threads", zh: "对话" }) },
    { id: "alerts", icon: "bell", label: t({ en: "Alerts", zh: "提醒" }) },
  ];

  return (
    <div
      data-orbit-real-page="relationship-inbox"
      style={{ inset: 0, position: "fixed", zIndex: 300 }}
    >
      <div
        aria-hidden="true"
        onClick={onClose}
        style={{ background: "var(--scrim, rgba(10,12,16,0.42))", inset: 0, position: "absolute" }}
      />
      <div
        aria-label={t({ en: "Relationship inbox", zh: "关系收件箱" })}
        aria-modal="true"
        className="ri-panel"
        ref={panelRef}
        role="dialog"
        style={{
          background: "var(--bg, #fff)",
          borderLeft: "1px solid var(--border)",
          bottom: 0,
          boxShadow: "var(--sh-pop, -8px 0 40px rgba(10,12,16,0.18))",
          display: "flex",
          flexDirection: "column",
          maxWidth: "92vw",
          outline: "none",
          position: "absolute",
          right: 0,
          top: 0,
          width: 420,
        }}
        tabIndex={-1}
      >
        <div style={{ alignItems: "center", borderBottom: "1px solid var(--hairline)", display: "flex", gap: 10, padding: "16px 18px" }}>
          <h2 className="h-section" style={{ flex: 1, margin: 0 }}>{t({ en: "Inbox", zh: "收件箱" })}</h2>
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

        <div role="tablist" style={{ display: "flex", gap: 4, padding: "10px 14px 0" }}>
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

        <div className="scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "6px 8px 16px" }}>
          {tab === "threads" ? (
            <ThreadsTab newThreadSeed={seed} onNewThreadConsumed={() => setSeed(null)} />
          ) : (
            <AlertsTab />
          )}
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
[data-orbit-real-page="relationship-inbox"] .ri-panel { animation: ri-slide .22s cubic-bezier(.22,1,.36,1); }
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
[data-orbit-real-page="relationship-inbox"] .ri-new-error { font-size:12.5px; color:var(--signal, #e5484d); }

[data-orbit-real-page="relationship-inbox"] .ri-alerts { display:flex; flex-direction:column; gap:16px; padding:6px 8px; }
[data-orbit-real-page="relationship-inbox"] .ri-alert-group { display:flex; flex-direction:column; gap:8px; }
[data-orbit-real-page="relationship-inbox"] .ri-alert-eyebrow { font-size:11px; font-weight:700; color:var(--text-3); text-transform:uppercase; letter-spacing:.05em; padding:0 4px; }
[data-orbit-real-page="relationship-inbox"] .ri-alert { display:grid; grid-template-columns:1fr auto; gap:8px; align-items:start; padding:11px 12px; border-radius:12px; background:var(--surface-2); border-left:3px solid transparent; }
[data-orbit-real-page="relationship-inbox"] .ri-alert-proactive { border-left-color:var(--accent); background:var(--accent-softer); }
[data-orbit-real-page="relationship-inbox"] .ri-alert-pri-high { border-left-color:var(--signal, #e5484d); }
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
` }} />
    </div>
  );
}

// 顶栏右上角入口：信封图标 + 未读 badge（对话未读 + 待处理提醒的聚合计数）。
// unreadCount prop 作为初始值/测试覆盖；挂载后按真实数据刷新。
export function RelationshipInboxTrigger({ unreadCount = 0 }: { unreadCount?: number }) {
  const { t } = useOrbitLanguage();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(unreadCount);
  const [seed, setSeed] = useState<NewThreadSeed | null>(null);

  // 挂载后拉取真实聚合计数。
  useEffect(() => {
    let active = true;
    fetchBadgeCount()
      .then((value) => {
        if (active) setCount(value);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  // 监听"起草邮件"等外部入口的 compose 事件，打开面板并带上收件人。
  useEffect(() => {
    function onCompose(event: Event) {
      const detail = (event as CustomEvent<NewThreadSeed>).detail ?? {};
      setSeed({ recipient: detail.recipient, organization: detail.organization });
      setOpen(true);
    }
    window.addEventListener(RELATIONSHIP_INBOX_COMPOSE_EVENT, onCompose);
    return () => window.removeEventListener(RELATIONSHIP_INBOX_COMPOSE_EVENT, onCompose);
  }, []);

  const displayCount = count;

  return (
    <>
      <button
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={t({ en: "Open inbox", zh: "打开收件箱" })}
        className="hit-44 ri-trigger"
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
              background: "var(--signal, #e5484d)",
              borderRadius: 999,
              color: "#fff",
              fontSize: 10,
              fontWeight: 700,
              lineHeight: "16px",
              minWidth: 16,
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
      {open ? (
        <RelationshipInboxPanel initialSeed={seed} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}
