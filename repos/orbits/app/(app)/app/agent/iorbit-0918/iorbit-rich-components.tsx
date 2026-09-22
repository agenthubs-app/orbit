/**
 * iOrbit（对话域）回合内既有富组件。
 *
 * iOrbit 任务 6a：`../orbit-real-agent.tsx` 删除，本文件承接它里面**仍被新屏消费**的
 * 组件（组件本体逐字搬入，未改一行渲染）：`AgentMessageCopyButton`、
 * `AgentHistoryDeleteDialog`、`AgentWelcome`、`AgentInlineDraftResult`（经 `PanelCards`）、
 * `PanelCards`、`AgentStar`、`ThinkingIndicator`。旧文件其余部分（`OrbitRealAgent` 本体、
 * `AgentHistoryList`、`AgentMobileHistoryDrawer`、`AgentChatComposer`）已随删除消失——
 * 它们的能力由 `iorbit-shell.tsx` / `iorbit-chat.tsx` / `iorbit-history-drawer.tsx` 承担。
 *
 * 这些组件吃的仍是 `[data-orbit-real-page="agent"]` 作用域皮肤（`./console-styles.ts`），
 * 设计里没有它们的槽位，按任务 3/5 的偏差表记录。
 */
"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

import type {
  OrbitAgentEventResultView,
  OrbitAgentHistoryView,
  OrbitAgentPeopleResultView,
  OrbitAgentTodoResultView,
  OrbitAgentViewModel,
} from "../../orbit-agent-route-view-model";
import { eventCoverPhoto } from "../../orbit-event-cover-photo";
import { EventCover } from "../../events/orbit-event-cover";
import { useOrbitLanguage } from "../../orbit-language-context";
import { useOrbitModalA11y } from "../../orbit-modal-a11y";
import { Avatar, Icon, gradientFromString } from "../../orbit-reference-primitives";
import { ORBIT_Z } from "../../orbit-z";
import {
  openRelationshipInbox,
  openRelationshipInboxCompose,
  requestMessageDraft,
} from "../../inbox/relationship-inbox-panel";
import {
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
  todoDueLabel,
  type AgentPanel,
  type AgentTodoGroup,
  type Copy,
  type Translate,
} from "./iorbit-model";

const AgentMarkdown = dynamic(() => import("../agent-markdown"), {
  loading: () => <div aria-hidden="true" className="orbit-agent-markdown" />,
});





// 任务 3：`iorbit-0918/` 的新壳与新对话屏复用同一份实现（组件本体未改）。
// 任务 3：`iorbit-0918/` 的新壳与新对话屏复用同一份实现（组件本体未改）。
export function AgentMessageCopyButton({ text }: { text: string }) {
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


// 任务 3：`iorbit-0918/` 的新壳与新对话屏复用同一份实现（组件本体未改）。
export function AgentHistoryDeleteDialog({
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

// 任务 3：`iorbit-0918/` 的新壳与新对话屏复用同一份实现（组件本体未改）。
export function AgentWelcome({ onPick, viewModel }: { onPick: (query: string) => void; viewModel: OrbitAgentViewModel }) {
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
    // 逐带归因 2026-09-23：`fmtDay` 在 zh-CN 下用 `day:"2-digit"`，Intl 自己就返回
    // 「18日」，后面再补一个「日」会渲染成「9月18日日 · 周五18:30」。与任务 2 修订轮 1
    // 在月历上改掉的 `18日`→`18` 是同一个坑（EXECUTION.md「合并前终审修正」⑤）。
    ? (language === "en" ? `${fmtMonth(date, language)} ${fmtDay(date, language)} · ${weekday}` : `${fmtMonth(date, language)}${fmtDay(date, language)} · ${weekday}`)
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

// 任务 3：`iorbit-0918/` 的新壳与新对话屏复用同一份实现（组件本体未改）。
export function PanelCards({ language, navigate, panel, t }: { language: "en" | "zh"; navigate: (href: string) => void; panel: AgentPanel; t: Translate }) {
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

// 任务 3：`iorbit-0918/` 的新壳与新对话屏复用同一份实现（组件本体未改）。
export function ThinkingIndicator({ t }: { t: Translate }) {
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
