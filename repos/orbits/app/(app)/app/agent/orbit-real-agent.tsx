"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";

import type {
  OrbitAgentEventResultView,
  OrbitAgentHistoryView,
  OrbitAgentPeopleResultView,
  OrbitAgentScenarioView,
  OrbitAgentViewModel,
} from "../orbit-agent-route-view-model";
import { AccountTopNav } from "../orbit-account-shell";
import { useOrbitLanguage } from "../orbit-language-context";
import { productHref } from "../orbit-public-shell";
import { Avatar, Cover, Icon, gradientFromString } from "../orbit-reference-primitives";

// OrbitRealAgent 是 `/app/agent` 和 `/app/chat` 共享的真实聊天界面。
// 初始欢迎页/历史建议来自静态 viewModel；用户真正发送消息后，
// 会通过 `/api/ai/conversations` 进入服务端 Chat Agent。
interface OrbitRealAgentProps {
  viewModel: OrbitAgentViewModel;
}

type ReferenceAgentPanel = Pick<OrbitAgentScenarioView, "items" | "kind" | "panelTitle"> & {
  source: "reference";
};

interface AgentArtifactActionPreview {
  id: string;
  label: string;
  requiresConfirmation: boolean;
}

interface AgentArtifactItemPreview {
  actions: readonly AgentArtifactActionPreview[];
  body: string | null;
  confidenceLabel: string | null;
  id: string;
  metadata: readonly { label: string; value: string }[];
  reason: string | null;
  subtitle: string | null;
  title: string;
}

interface AgentArtifactSectionPreview {
  body: string | null;
  items: readonly AgentArtifactItemPreview[];
  title: string;
}

interface AgentArtifactPreview {
  actions: readonly AgentArtifactActionPreview[];
  id: string;
  kind: string;
  sections: readonly AgentArtifactSectionPreview[];
  status: string;
  subtitle: string | null;
  summary: string;
  title: string;
}

interface AgentToolIntentPreview {
  id: string;
  label: string;
  reason: string | null;
  requiresUserConfirmation: boolean;
  toolFamily: string | null;
}

interface ApiAgentPanel {
  artifacts: readonly AgentArtifactPreview[];
  intents: readonly AgentToolIntentPreview[];
  nextAction: string | null;
  panelTitle: string;
  source: "api";
  sourceLabel: string | null;
}

type AgentPanel = ReferenceAgentPanel | ApiAgentPanel;

type AgentMessage =
  | { role: "user"; text: string }
  | {
      error?: boolean;
      panel?: AgentPanel;
      note?: string;
      role: "assistant";
      sourceLabel?: string | null;
      text: string;
    };

interface OrbitAgentApiData {
  artifacts?: unknown;
  assistantMessage?: unknown;
  nextAction?: unknown;
  proposedToolIntents?: unknown;
  provenance?: unknown;
}

interface OrbitAgentApiEnvelope {
  data?: OrbitAgentApiData;
  error?: { message?: unknown };
  success?: boolean;
}

type Copy = { en: string; zh: string };
type Translate = (copy: Copy) => string;

function depthFor(t: Translate) {
  return {
    to_contact: { label: t({ en: "To break ice · Just met", zh: "待破冰 · 一面之缘" }), color: "var(--amber)", soft: "var(--amber-soft)" },
    in_progress: { label: t({ en: "In progress · In touch", zh: "在推进 · 已有交流" }), color: "var(--sky)", soft: "var(--sky-soft)" },
    partnered: { label: t({ en: "Partnered · Solid", zh: "已合作 · 关系稳固" }), color: "var(--live)", soft: "var(--live-soft)" },
  };
}

const TZ = { timeZone: "Asia/Tokyo" };

function fmtMonth(date: Date, language: "en" | "zh") {
  return new Intl.DateTimeFormat(language === "en" ? "en-US" : "zh-CN", { month: "short", ...TZ }).format(date);
}

function fmtDay(date: Date, language: "en" | "zh") {
  return new Intl.DateTimeFormat(language === "en" ? "en-US" : "zh-CN", { day: "2-digit", ...TZ }).format(date);
}

function parseDate(value: string) {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date : null;
}

// API envelope 来自 fetch JSON，前端必须把它当 unknown 防御解析。
// 这些 read* helper 让 UI 遇到缺字段或未来 schema 扩展时降级显示，而不是崩溃。
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function readBoolean(value: unknown): boolean {
  return value === true;
}

function readArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function isPeopleResult(item: OrbitAgentPeopleResultView | OrbitAgentEventResultView): item is OrbitAgentPeopleResultView {
  return "connection" in item;
}

function currentAgentQuery() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("q") ?? "";
}

// artifactKindLabel 把服务端 artifact kind 转成用户可读标签。
function artifactKindLabel(kind: string, t: Translate) {
  const labels: Record<string, Copy> = {
    contact_recommendations: { en: "Contact recommendations", zh: "人脉推荐" },
    email_context: { en: "Message context", zh: "消息上下文" },
    event_recommendations: { en: "Event recommendations", zh: "活动推荐" },
    followup_queue: { en: "Follow-up queue", zh: "跟进队列" },
    generic: { en: "Orbit result", zh: "Orbit 结果" },
    relationship_chat_context: { en: "Relationship context", zh: "关系上下文" },
  };

  return t(labels[kind] ?? labels.generic);
}

// 以下 read*Preview 函数把服务端 conversation payload 收窄成右侧结果面板可渲染的结构。
// 它们只读取白名单字段；未知字段会被忽略。
function readActionPreview(value: unknown, index: number): AgentArtifactActionPreview | null {
  if (!isRecord(value)) return null;
  const label = readString(value.label);
  if (!label) return null;

  return {
    id: readString(value.actionId) ?? `action-${index + 1}`,
    label,
    requiresConfirmation: readBoolean(value.requiresConfirmation),
  };
}

function readItemPreview(value: unknown, index: number, t: Translate): AgentArtifactItemPreview | null {
  if (!isRecord(value)) return null;
  const title = readString(value.title);
  if (!title) return null;

  return {
    actions: readArray(value.actions)
      .map((action, actionIndex) => readActionPreview(action, actionIndex))
      .filter((action): action is AgentArtifactActionPreview => Boolean(action)),
    body: readString(value.body),
    confidenceLabel: readString(value.confidenceLabel),
    id: readString(value.id) ?? `item-${index + 1}`,
    metadata: readArray(value.metadata)
      .map((metadata) => {
        if (!isRecord(metadata)) return null;
        const label = readString(metadata.label);
        const valueText = readString(metadata.value);
        return label && valueText ? { label, value: valueText } : null;
      })
      .filter((metadata): metadata is { label: string; value: string } => Boolean(metadata)),
    reason: readString(value.reason),
    subtitle: readString(value.subtitle),
    title: title || t({ en: "Untitled result", zh: "未命名结果" }),
  };
}

function readSectionPreview(value: unknown, index: number, t: Translate): AgentArtifactSectionPreview | null {
  if (!isRecord(value)) return null;
  const items = readArray(value.items)
    .map((item, itemIndex) => readItemPreview(item, itemIndex, t))
    .filter((item): item is AgentArtifactItemPreview => Boolean(item));
  const title = readString(value.title);

  if (!title && items.length === 0) return null;

  return {
    body: readString(value.body),
    items,
    title: title ?? t({ en: "Results", zh: "结果" }),
  };
}

function readArtifactPreview(value: unknown, index: number, t: Translate): AgentArtifactPreview | null {
  if (!isRecord(value)) return null;

  const task = isRecord(value.task) ? value.task : {};
  const result = isRecord(value.result) ? value.result : {};
  const presentation = isRecord(result.presentation) ? result.presentation : {};
  const generatedView = isRecord(result.generatedView) ? result.generatedView : {};
  const kind = readString(task.kind) ?? readString(result.kind) ?? "generic";
  const sections = readArray(generatedView.sections)
    .map((section, sectionIndex) => readSectionPreview(section, sectionIndex, t))
    .filter((section): section is AgentArtifactSectionPreview => Boolean(section));
  const title = readString(presentation.title) ?? artifactKindLabel(kind, t);

  return {
    actions: sections.flatMap((section) => section.items.flatMap((item) => item.actions)),
    id: readString(task.artifactId) ?? readString(result.artifactId) ?? `artifact-${index + 1}`,
    kind,
    sections,
    status: readString(result.status) ?? readString(task.status) ?? "ready",
    subtitle: readString(presentation.subtitle),
    summary:
      readString(generatedView.summary) ??
      readString(result.nextAction) ??
      readString(task.query) ??
      t({ en: "Orbit prepared this result for review.", zh: "Orbit 已整理好这份结果，等待你确认。" }),
    title,
  };
}

function readToolIntentPreview(value: unknown, index: number): AgentToolIntentPreview | null {
  if (!isRecord(value)) return null;
  const label = readString(value.label);
  if (!label) return null;

  return {
    id: readString(value.intentId) ?? `intent-${index + 1}`,
    label,
    reason: readString(value.reason),
    requiresUserConfirmation: readBoolean(value.requiresUserConfirmation),
    toolFamily: readString(value.toolFamily),
  };
}

// API panel 只消费 conversation payload 里的 artifacts/proposedToolIntents。
// 如果 live agent 只是普通聊天、没有 artifact 或计划工具，这里返回 null，
// UI 就只渲染 assistant 气泡，不打开右侧结果面板。
function panelFromApiData(data: OrbitAgentApiData, t: Translate): ApiAgentPanel | null {
  const artifacts = readArray(data.artifacts)
    .map((artifact, index) => readArtifactPreview(artifact, index, t))
    .filter((artifact): artifact is AgentArtifactPreview => Boolean(artifact));
  const intents = readArray(data.proposedToolIntents)
    .map((intent, index) => readToolIntentPreview(intent, index))
    .filter((intent): intent is AgentToolIntentPreview => Boolean(intent));

  if (artifacts.length === 0 && intents.length === 0) return null;

  const provenance = isRecord(data.provenance) ? data.provenance : {};

  return {
    artifacts,
    intents,
    nextAction: readString(data.nextAction),
    panelTitle: t({ en: "Orbit result", zh: "Orbit 结果" }),
    source: "api",
    sourceLabel: readString(provenance.sourceLabel),
  };
}

// 浏览器端唯一的真实 Chat Agent 请求入口。
// mock/live 的选择不在前端决定，而是在服务端 service factory 根据环境变量解析。
async function sendOrbitAgentMessage(message: string, locale: "en" | "zh", t: Translate) {
  const response = await fetch("/api/ai/conversations", {
    body: JSON.stringify({ locale, message }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const envelope = (await response.json().catch(() => ({}))) as OrbitAgentApiEnvelope;

  if (!response.ok || envelope.success === false) {
    return {
      error: true,
      panel: null,
      sourceLabel: null,
      text:
        readString(envelope.error?.message) ??
        t({ en: "Orbit could not reply right now. Please try again.", zh: "Orbit 现在没有返回结果，请稍后再试。" }),
    };
  }

  const data = isRecord(envelope.data) ? envelope.data : {};
  const provenance = isRecord(data.provenance) ? data.provenance : {};

  return {
    error: false,
    panel: panelFromApiData(data, t),
    sourceLabel: readString(provenance.sourceLabel),
    text:
      readString(data.assistantMessage) ??
      t({ en: "Orbit replied, but no message text was returned.", zh: "Orbit 已返回，但没有可显示的回复文本。" }),
  };
}

function AgentHistoryList({
  activeQ,
  history,
  onPick,
}: {
  activeQ: string;
  history: OrbitAgentHistoryView[];
  onPick: (history: OrbitAgentHistoryView) => void;
}) {
  const groups = useMemo(() => [...new Set(history.map((item) => item.group))], [history]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
      {groups.map((group) => (
        <div key={group}>
          <div className="eyebrow" style={{ padding: "0 8px 6px" }}>
            {group}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {history
              .filter((item) => item.group === group)
              .map((item) => {
                const active = Boolean(activeQ && item.q === activeQ);

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onPick(item)}
                    style={{
                      alignItems: "center",
                      background: active ? "var(--accent-softer)" : "transparent",
                      border: "none",
                      borderRadius: 10,
                      cursor: "pointer",
                      display: "flex",
                      fontFamily: "var(--ff)",
                      gap: 9,
                      padding: "9px 10px",
                      textAlign: "left",
                      width: "100%",
                    }}
                  >
                    <Icon name="message" size={15} color={active ? "var(--accent)" : "var(--text-4)"} />
                    <span style={{ color: active ? "var(--accent)" : "var(--text)", flex: 1, fontSize: 13.5, fontWeight: active ? 600 : 500, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.title}
                    </span>
                    <span className="mono" style={{ color: "var(--text-4)", flexShrink: 0, fontSize: 10.5 }}>
                      {item.when}
                    </span>
                  </button>
                );
              })}
          </div>
        </div>
      ))}
    </div>
  );
}

function agentSuggestLabel(label: string, language: "en" | "zh") {
  if (language === "zh") return label;

  const labels: Record<string, string> = {
    "找金融 AI 方向的人脉": "Find AI finance contacts",
    "想认识女装设计师": "Meet womenswear designers",
    "推荐 AI / 出海活动": "Recommend AI / global events",
  };

  return labels[label] ?? label;
}

// AgentWelcome 是空会话状态，建议按钮会直接提交预置 query。
function AgentWelcome({ onPick, viewModel }: { onPick: (query: string) => void; viewModel: OrbitAgentViewModel }) {
  const { language, t } = useOrbitLanguage();

  return (
    <div style={{ alignItems: "center", display: "flex", flexDirection: "column", justifyContent: "center", minHeight: "50vh", padding: "24px 8px", textAlign: "center" }}>
      <span className="avatar g-indigo" style={{ alignItems: "center", borderRadius: 16, display: "flex", fontSize: 0, height: 54, justifyContent: "center", width: 54 }}>
        <Icon name="sparkle" size={26} color="var(--on-dark)" />
      </span>
      <h2 className="h-title" style={{ margin: "16px 0 6px" }}>
        {t({ en: "I am iOrbit", zh: "我是 iOrbit" })}
      </h2>
      <p style={{ color: "var(--text-2)", fontSize: 14, lineHeight: 1.65, margin: "0 0 22px", maxWidth: 380 }}>
        {t({
          en: "Tell me what you want to do. I will find the right people in your network, the right events to join, and how to start the conversation.",
          zh: "说出你想做的事，我帮你从人脉里找对的人、从活动里找对的局，并告诉你该怎么开口。",
        })}
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 9, width: "min(420px, 100%)" }}>
        {viewModel.suggests.map((suggest) => (
          <button
            key={suggest.label}
            type="button"
            onClick={() => onPick(suggest.q)}
            style={{ alignItems: "center", background: "var(--surface)", border: "1px solid var(--border-2)", borderRadius: 13, cursor: "pointer", display: "flex", fontFamily: "var(--ff)", gap: 11, padding: "13px 15px", textAlign: "left" }}
          >
            <Icon name={suggest.icon} size={17} color="var(--accent)" />
            <span style={{ color: "var(--ink)", fontSize: 14, fontWeight: 550 }}>{agentSuggestLabel(suggest.label, language)}</span>
            <div style={{ flex: 1 }} />
            <Icon name="arrow" size={16} color="var(--text-4)" />
          </button>
        ))}
      </div>
    </div>
  );
}

function AgentPeopleCard({ item, navigate, t }: { item: OrbitAgentPeopleResultView; navigate: (href: string) => void; t: Translate }) {
  const connection = item.connection;
  const depth = depthFor(t);
  const status = depth[connection.pipelineStatus] ?? depth.to_contact;

  return (
    <button type="button" className="card card-hover" style={{ cursor: "pointer", display: "block", fontFamily: "var(--ff)", padding: 15, textAlign: "left", width: "100%" }} onClick={() => navigate(`/home/cards/${connection.id}`)}>
      <div style={{ alignItems: "center", display: "flex", gap: 12 }}>
        <Avatar letter={connection.initial} g={connection.g} size={46} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: "var(--ink)", fontSize: 15.5, fontWeight: 650 }}>{connection.displayName}</div>
          <div style={{ color: "var(--text-3)", fontSize: 12.5, marginTop: 1 }}>
            {connection.title} · {connection.company}
          </div>
        </div>
        <div style={{ flexShrink: 0, textAlign: "right" }}>
          <div style={{ color: "var(--accent)", fontFamily: "var(--ff-tight)", fontSize: 20, fontWeight: 750, lineHeight: 1 }}>{item.match}%</div>
          <div className="mono" style={{ color: "var(--text-4)", fontSize: 9.5 }}>{t({ en: "Match", zh: "匹配度" })}</div>
        </div>
      </div>
      <div style={{ background: "var(--surface-3)", borderRadius: 99, height: 6, marginTop: 12, overflow: "hidden" }}>
        <span style={{ background: "var(--accent-grad-bar)", display: "block", height: "100%", width: `${item.match}%` }} />
      </div>
      <div style={{ alignItems: "center", display: "flex", gap: 6, marginTop: 11 }}>
        <span style={{ alignItems: "center", background: status.soft, borderRadius: 999, color: status.color, display: "inline-flex", fontSize: 11.5, fontWeight: 600, gap: 6, height: 24, padding: "0 10px" }}>
          <span style={{ background: status.color, borderRadius: 999, height: 6, width: 6 }} />
          {status.label}
        </span>
        <span className="chip" style={{ height: 24 }}>{connection.industry}</span>
      </div>
      <div style={{ color: "var(--text-2)", fontSize: 13, lineHeight: 1.6, marginTop: 11 }}>{item.reason}</div>
      <div style={{ background: "var(--accent-softer)", borderRadius: 11, display: "flex", gap: 9, marginTop: 11, padding: 11 }}>
        <Icon name="message" size={15} color="var(--accent)" style={{ flexShrink: 0, marginTop: 1 }} />
        <div>
          <div style={{ color: "var(--accent)", fontSize: 11.5, fontWeight: 650 }}>{t({ en: "How to start", zh: "怎么开口" })}</div>
          <div style={{ color: "var(--text-2)", fontSize: 12.5, lineHeight: 1.5, marginTop: 2 }}>{item.opener}</div>
        </div>
      </div>
      <div style={{ alignItems: "center", color: "var(--accent)", display: "flex", fontSize: 12.5, fontWeight: 650, gap: 3, justifyContent: "flex-end", marginTop: 12 }}>
        {t({ en: "View contact", zh: "查看名片" })}
        <Icon name="chevR" size={14} />
      </div>
    </button>
  );
}

function AgentEventCard({ item, language, navigate, t }: { item: OrbitAgentEventResultView; language: "en" | "zh"; navigate: (href: string) => void; t: Translate }) {
  const event = item.event;
  const date = parseDate(event.startsAt);
  const weekday = date ? new Intl.DateTimeFormat(language === "en" ? "en-US" : "zh-CN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo", weekday: "short" }).format(date) : "";
  const dateLabel = date
    ? (language === "en" ? `${fmtMonth(date, language)} ${fmtDay(date, language)} · ${weekday}` : `${fmtMonth(date, language)}${fmtDay(date, language)}日 · ${weekday}`)
    : t({ en: "Time TBD", zh: "时间待定" });

  return (
    <button type="button" className="card card-hover" style={{ cursor: "pointer", display: "block", fontFamily: "var(--ff)", overflow: "hidden", padding: 0, textAlign: "left", width: "100%" }} onClick={() => navigate(`/events/${event.code}`)}>
      <div style={{ display: "flex", gap: 13, padding: 15 }}>
        <Cover g={gradientFromString(event.code)} monogram={{ text: event.name.slice(0, 1), size: 22 }} style={{ borderRadius: 13, flexShrink: 0, height: 60, width: 60 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ alignItems: "flex-start", display: "flex", gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: "var(--ink)", fontSize: 15.5, fontWeight: 650, lineHeight: 1.25 }}>{event.name}</div>
              <div style={{ color: "var(--text-3)", fontSize: 12, marginTop: 3 }}>{dateLabel}</div>
            </div>
            <div style={{ flexShrink: 0, textAlign: "right" }}>
              <div style={{ color: "var(--accent)", fontFamily: "var(--ff-tight)", fontSize: 20, fontWeight: 750, lineHeight: 1 }}>{item.score}</div>
              <div className="mono" style={{ color: "var(--text-4)", fontSize: 9.5 }}>{t({ en: "Score", zh: "匹配分" })}</div>
            </div>
          </div>
          <div style={{ alignItems: "center", color: "var(--text-3)", display: "flex", fontSize: 12, gap: 8, marginTop: 8 }}>
            <Icon name="pin" size={13} />
            {event.place}
          </div>
        </div>
      </div>
      <div style={{ padding: "0 15px 15px" }}>
        <div style={{ color: "var(--text-2)", fontSize: 13, lineHeight: 1.6 }}>{item.reason}</div>
        <div style={{ background: "var(--accent-softer)", borderRadius: 11, display: "flex", gap: 9, marginTop: 11, padding: 11 }}>
          <Icon name="sparkle" size={15} color="var(--accent)" style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={{ color: "var(--accent)", fontSize: 11.5, fontWeight: 650 }}>{t({ en: "How to network on site", zh: "怎么在现场社交" })}</div>
            <div style={{ color: "var(--text-2)", fontSize: 12.5, lineHeight: 1.5, marginTop: 2 }}>{item.howto}</div>
          </div>
        </div>
        <div style={{ alignItems: "center", color: "var(--accent)", display: "flex", fontSize: 12.5, fontWeight: 650, gap: 3, justifyContent: "flex-end", marginTop: 12 }}>
          {t({ en: "View event", zh: "查看活动" })}
          <Icon name="chevR" size={14} />
        </div>
      </div>
    </button>
  );
}

// reference panel 渲染来自静态 viewModel 的人脉/活动卡片。
function PanelCards({ language, navigate, panel, t }: { language: "en" | "zh"; navigate: (href: string) => void; panel: ReferenceAgentPanel; t: Translate }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {panel.items.map((item, index) =>
        isPeopleResult(item) ? (
          <AgentPeopleCard key={`${item.connection.id}-${index}`} item={item} navigate={navigate} t={t} />
        ) : (
          <AgentEventCard key={`${item.event.code}-${index}`} item={item} language={language} navigate={navigate} t={t} />
        ),
      )}
    </div>
  );
}

// live/API panel 渲染 Chat Agent 返回的 artifact 和 proposed tool intents。
function LiveAgentPanelCards({ panel, t }: { panel: ApiAgentPanel; t: Translate }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {panel.artifacts.map((artifact) => {
        const items = artifact.sections.flatMap((section) => section.items).slice(0, 4);

        return (
          <div key={artifact.id} className="card" style={{ padding: 15 }}>
            <div style={{ alignItems: "flex-start", display: "flex", gap: 11 }}>
              <span style={{ alignItems: "center", background: "var(--accent-soft)", borderRadius: 10, color: "var(--accent)", display: "flex", flexShrink: 0, height: 34, justifyContent: "center", width: 34 }}>
                <Icon name="sparkle" size={17} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: "var(--ink)", fontSize: 15, fontWeight: 680, lineHeight: 1.3 }}>{artifact.title}</div>
                {artifact.subtitle ? <div style={{ color: "var(--text-3)", fontSize: 12.5, marginTop: 3 }}>{artifact.subtitle}</div> : null}
                <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: 6, marginTop: 9 }}>
                  <span className="chip" style={{ height: 24 }}>{artifactKindLabel(artifact.kind, t)}</span>
                  <span className="chip" style={{ height: 24 }}>{artifact.status}</span>
                </div>
              </div>
            </div>
            <p style={{ color: "var(--text-2)", fontSize: 13, lineHeight: 1.6, margin: "12px 0 0" }}>{artifact.summary}</p>
            {items.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
                {items.map((item) => (
                  <div key={item.id} style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 11, padding: 11 }}>
                    <div style={{ color: "var(--ink)", fontSize: 13.5, fontWeight: 650 }}>{item.title}</div>
                    {item.subtitle ? <div style={{ color: "var(--text-3)", fontSize: 12, marginTop: 2 }}>{item.subtitle}</div> : null}
                    {item.body ?? item.reason ? <div style={{ color: "var(--text-2)", fontSize: 12.5, lineHeight: 1.5, marginTop: 7 }}>{item.body ?? item.reason}</div> : null}
                    {item.metadata.length > 0 ? (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 8 }}>
                        {item.metadata.slice(0, 4).map((metadata) => (
                          <span key={`${item.id}-${metadata.label}`} className="mono" style={{ background: "var(--bg)", borderRadius: 999, color: "var(--text-3)", fontSize: 10.5, padding: "4px 7px" }}>
                            {metadata.label}: {metadata.value}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
            {artifact.actions.length > 0 ? (
              <div style={{ background: "var(--amber-soft)", borderRadius: 11, color: "var(--amber)", fontSize: 12.5, lineHeight: 1.5, marginTop: 12, padding: "9px 11px" }}>
                {t({ en: "Actions need your confirmation before anything is sent or changed.", zh: "动作需要你确认后才会发送或改动。" })}
              </div>
            ) : null}
          </div>
        );
      })}
      {panel.intents.map((intent) => (
        <div key={intent.id} className="card" style={{ padding: 14 }}>
          <div style={{ alignItems: "center", display: "flex", gap: 9 }}>
            <Icon name="eye" size={16} color="var(--amber)" />
            <div style={{ color: "var(--ink)", flex: 1, fontSize: 14, fontWeight: 650, minWidth: 0 }}>{intent.label}</div>
            {intent.requiresUserConfirmation ? <span className="chip" style={{ height: 24 }}>{t({ en: "Confirm", zh: "需确认" })}</span> : null}
          </div>
          {intent.reason ? <div style={{ color: "var(--text-2)", fontSize: 12.5, lineHeight: 1.5, marginTop: 8 }}>{intent.reason}</div> : null}
          {intent.toolFamily ? <div className="mono" style={{ color: "var(--text-4)", fontSize: 10.5, marginTop: 8 }}>{intent.toolFamily}</div> : null}
        </div>
      ))}
      {panel.nextAction ? (
        <div style={{ color: "var(--text-3)", fontSize: 12.5, lineHeight: 1.5, padding: "0 2px" }}>{panel.nextAction}</div>
      ) : null}
    </div>
  );
}

// AgentPanelContent 根据 panel.source 在静态参考结果和 live API 结果之间切换。
function AgentPanelContent({
  language,
  navigate,
  panel,
  t,
}: {
  language: "en" | "zh";
  navigate: (href: string) => void;
  panel: AgentPanel;
  t: Translate;
}) {
  return panel.source === "reference" ? (
    <PanelCards language={language} panel={panel} navigate={navigate} t={t} />
  ) : (
    <LiveAgentPanelCards panel={panel} t={t} />
  );
}

function agentPanelIcon(panel: AgentPanel) {
  if (panel.source === "api") return "sparkle";
  return panel.kind === "people" ? "users" : "calendar";
}

function agentPanelHint(panel: AgentPanel, t: Translate) {
  if (panel.source === "api") {
    return panel.sourceLabel ?? t({ en: "Review before confirming anything.", zh: "确认前先看清楚。" });
  }

  return panel.kind === "people"
    ? t({ en: "Click a card to open the contact page.", zh: "点卡片可直接跳转到对应名片页" })
    : t({ en: "Click a card to open the event page.", zh: "点卡片可直接跳转到对应活动页" });
}

// ChatBox 只负责收集输入和触发 onSend。
// 空输入由 onSend 守卫，按钮保持可命中，避免响应式重复 DOM 被误判为不可点击。
function ChatBox({
  big,
  busy,
  onChange,
  onSend,
  value,
}: {
  big?: boolean;
  busy?: boolean;
  onChange: (value: string) => void;
  onSend: () => void;
  value: string;
}) {
  const { t } = useOrbitLanguage();
  const isBlank = !value.trim();
  const requestState = busy ? "provider-thinking" : "idle";

  function submitChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSend();
  }

  return (
    <form aria-busy={busy} onSubmit={submitChat} style={{ background: "var(--surface)", border: "1px solid var(--border-2)", borderRadius: 20, boxShadow: "0 18px 50px rgba(99,89,233,0.12), 0 2px 8px rgba(18,18,28,0.05)", padding: big ? "18px 18px 12px" : "12px 12px 8px", width: "100%" }}>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            onSend();
          }
        }}
        placeholder={t({ en: "Ask Orbit: what you want to do, who to meet, which event to attend…", zh: "问问 Orbit：想做什么、想认识谁、想去什么活动…" })}
        rows={big ? 2 : 1}
        style={{ background: "transparent", border: "none", color: "var(--ink)", fontFamily: "var(--ff)", fontSize: big ? 17 : 15, lineHeight: 1.5, outline: "none", padding: "2px 4px", resize: "none", width: "100%" }}
      />
      <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", marginTop: big ? 8 : 4 }}>
        <div style={{ alignItems: "center", display: "flex", gap: 8 }}>
          <span style={{ alignItems: "center", background: "var(--accent-soft)", borderRadius: 999, color: "var(--accent)", display: "inline-flex", fontSize: 12.5, fontWeight: 650, gap: 6, height: 32, padding: "0 12px" }}>
            <Icon name="sparkle" size={14} />
            iOrbit
          </span>
          <span data-orbit-agent-request-state={requestState} style={{ color: "var(--text-4)", fontSize: 12 }}>
            {busy
              ? t({ en: "Orbit is thinking", zh: "Orbit 正在生成" })
              : t({ en: "Contacts · Events · Business value", zh: "人脉 · 活动 · 商业价值" })}
          </span>
        </div>
        <button
          type="submit"
          aria-disabled={isBlank}
          aria-label={t({ en: "Send", zh: "发送" })}
          data-orbit-agent-submit="true"
          style={{ alignItems: "center", background: isBlank ? "var(--surface-3)" : "var(--accent-grad)", border: "none", borderRadius: 12, boxShadow: isBlank ? "none" : "0 8px 18px rgba(99,76,226,0.28)", color: isBlank ? "var(--text-4)" : "var(--on-dark)", cursor: "pointer", display: "flex", height: 40, justifyContent: "center", width: 40 }}
        >
          <Icon name="arrow" size={19} style={{ transform: "rotate(-90deg)" }} />
        </button>
      </div>
    </form>
  );
}

function TypingDots() {
  return (
    <span style={{ display: "inline-flex", gap: 4 }}>
      {[0, 1, 2].map((index) => (
        <span key={index} style={{ animation: `blink 1s ${index * 0.2}s infinite`, background: "var(--text-4)", borderRadius: 999, height: 6, width: 6 }} />
      ))}
    </span>
  );
}

export function OrbitRealAgent({ viewModel }: OrbitRealAgentProps) {
  const { language, preserveHref, t } = useOrbitLanguage();
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [panel, setPanel] = useState<AgentPanel | null>(null);
  const [thinking, setThinking] = useState(false);
  const [histOpen, setHistOpen] = useState(false);
  const [isMobileLayout, setIsMobileLayout] = useState(false);
  const [activeQ, setActiveQ] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const requestSeqRef = useRef(0);

  // navigate 负责在 prototype 路由和真实详情页之间切换。
  // agent 内部 query 只更新 history state，其它页面则交给浏览器跳转。
  const navigate = useCallback((prototypeHref: string) => {
    const href = preserveHref(productHref(prototypeHref));
    if (typeof window === "undefined") return;

    if (href.startsWith("/app/agent")) {
      window.history.pushState({}, "", href);
      setActiveQ(new URL(href, window.location.origin).searchParams.get("q") ?? "");
      return;
    }

    window.location.href = href;
  }, [preserveHref]);

  // ask 是一次完整前端 turn：
  // 先乐观追加 user 气泡，再等待 API 返回 assistant 文本和可选结果面板。
  // requestSeqRef 用来丢弃较旧请求，避免连续点击时旧响应覆盖新响应。
  const ask = useCallback(async (query: string) => {
    const requestSeq = requestSeqRef.current + 1;
    requestSeqRef.current = requestSeq;
    setMessages((current) => [...current, { role: "user", text: query }]);
    setThinking(true);
    setPanel(null);

    try {
      const reply = await sendOrbitAgentMessage(query, language, t);
      if (requestSeq !== requestSeqRef.current) return;

      setMessages((current) => [
        ...current,
        {
          error: reply.error,
          panel: reply.panel ?? undefined,
          role: "assistant",
          sourceLabel: reply.sourceLabel,
          text: reply.text,
        },
      ]);
      setPanel(reply.panel);
    } catch {
      if (requestSeq !== requestSeqRef.current) return;

      setMessages((current) => [
        ...current,
        {
          error: true,
          role: "assistant",
          text: t({ en: "Orbit could not reply right now. Please try again.", zh: "Orbit 现在没有返回结果，请稍后再试。" }),
        },
      ]);
      setPanel(null);
    } finally {
      if (requestSeq === requestSeqRef.current) setThinking(false);
    }
  }, [language, t]);

  useEffect(() => {
    const query = currentAgentQuery();
    setActiveQ(query);
    if (query) {
      setMessages([]);
      setPanel(null);
      setText("");
      ask(query);
    }

    return undefined;
  }, [ask]);

  useEffect(() => {
    const scroll = scrollRef.current;
    if (scroll) scroll.scrollTop = scroll.scrollHeight;
  }, [messages, thinking]);

  useEffect(() => {
    if (!histOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setHistOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [histOpen]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const media = window.matchMedia("(max-width: 760px)");
    const syncLayout = () => setIsMobileLayout(media.matches);

    syncLayout();
    media.addEventListener("change", syncLayout);

    return () => media.removeEventListener("change", syncLayout);
  }, []);

  const send = () => {
    const value = text.trim();
    if (!value) return;
    setText("");
    ask(value);
  };

  const pickHistory = (item: OrbitAgentHistoryView) => {
    setHistOpen(false);
    setMessages([]);
    setPanel(null);
    setText("");
    navigate(`/agent?q=${encodeURIComponent(item.q)}`);
    ask(item.q);
  };

  const newChat = () => {
    requestSeqRef.current += 1;
    setHistOpen(false);
    setMessages([]);
    setPanel(null);
    setText("");
    setThinking(false);
    setActiveQ("");
    navigate("/agent");
  };

  const chatBox = (
    <ChatBox
      busy={thinking}
      value={text}
      onChange={setText}
      onSend={send}
    />
  );

  const renderBubbles = (inlinePanel: boolean) => (
    <>
      {messages.map((message, index) =>
        message.role === "user" ? (
          <div key={`user-${index}`} style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
            <div style={{ background: "var(--accent)", borderRadius: "16px 16px 4px 16px", color: "var(--on-dark)", fontSize: 14.5, lineHeight: 1.55, maxWidth: "82%", padding: "11px 15px" }}>{message.text}</div>
          </div>
        ) : (
          <div key={`assistant-${index}`} style={{ display: "flex", gap: 11, marginBottom: 18 }}>
            <span className="avatar g-indigo" style={{ borderRadius: 10, flexShrink: 0, fontSize: 0, height: 32, width: 32 }}>
              <Icon name="sparkle" size={16} color="var(--on-dark)" />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              {message.note ? (
                <div style={{ alignItems: "center", background: "var(--amber-soft)", borderRadius: 12, color: "var(--amber)", display: "inline-flex", fontSize: 13, fontWeight: 550, gap: 7, marginBottom: 10, padding: "7px 12px" }}>
                  <Icon name="eye" size={14} />
                  {message.note}
                </div>
              ) : null}
              <div style={{ background: message.error ? "var(--amber-soft)" : "var(--surface)", border: `1px solid ${message.error ? "var(--amber)" : "var(--border)"}`, borderRadius: "4px 16px 16px 16px", color: message.error ? "var(--amber)" : "var(--text)", fontSize: 14.5, lineHeight: 1.6, padding: "12px 15px" }}>{message.text}</div>
              {inlinePanel && message.panel ? (
                <div style={{ marginTop: 12 }}>
                  <div className="eyebrow" style={{ marginBottom: 10 }}>{message.panel.panelTitle}</div>
                  <AgentPanelContent language={language} panel={message.panel} navigate={navigate} t={t} />
                </div>
              ) : null}
            </div>
          </div>
        ),
      )}
      {thinking ? (
        <div style={{ display: "flex", gap: 11, marginBottom: 18 }}>
          <span className="avatar g-indigo" style={{ borderRadius: 10, flexShrink: 0, fontSize: 0, height: 32, width: 32 }}>
            <Icon name="sparkle" size={16} color="var(--on-dark)" />
          </span>
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "4px 16px 16px 16px", padding: "14px 16px" }}>
            <TypingDots />
          </div>
        </div>
      ) : null}
    </>
  );

  return (
    <div data-orbit-real-page="agent" style={{ background: "var(--bg-soft)", display: "flex", flexDirection: "column", height: "100dvh" }}>
      {!isMobileLayout ? (
        <div className="orbit-desktop-only">
        <AccountTopNav
          active="agent"
          rightExtra={(
            <button aria-label={t({ en: "New chat", zh: "新对话" })} className="orbit-top-icon-btn" onClick={newChat} type="button">
              <Icon name="plus" size={18} />
            </button>
          )}
        />
        </div>
      ) : null}
      {isMobileLayout ? (
        <div className="orbit-mobile-only" style={{ flexShrink: 0 }}>
        <AccountTopNav
          active="agent"
          rightExtra={(
            <button aria-label={t({ en: "Chat history", zh: "对话历史" })} className="orbit-top-icon-btn orbit-agent-history-btn" onClick={() => setHistOpen(true)} type="button">
              <Icon name="clock" size={16} />
            </button>
          )}
        />
        </div>
      ) : null}

      {!isMobileLayout ? (
        <div className="orbit-desktop-only" style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <aside style={{ background: "var(--bg)", borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", flexShrink: 0, width: 248 }}>
          <div style={{ padding: 14 }}>
            <button type="button" onClick={newChat} style={{ alignItems: "center", background: "var(--surface)", border: "1px solid var(--border-2)", borderRadius: 11, color: "var(--ink)", cursor: "pointer", display: "flex", fontFamily: "var(--ff)", fontSize: 13.5, fontWeight: 600, gap: 7, height: 40, justifyContent: "center", width: "100%" }}>
              <Icon name="plus" size={16} color="var(--accent)" />
              {t({ en: "New chat", zh: "新对话" })}
            </button>
          </div>
          <div style={{ padding: "4px 18px 8px" }}>
            <div className="eyebrow">{t({ en: "Chat history", zh: "对话历史" })}</div>
          </div>
          <div className="scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "2px 10px 18px" }}>
            <AgentHistoryList activeQ={activeQ} history={viewModel.history} onPick={pickHistory} />
          </div>
        </aside>
        <div style={{ display: "flex", flex: 1, flexDirection: "column", minWidth: 0 }}>
          <div ref={scrollRef} className="scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "24px 28px" }}>
            <div style={{ margin: "0 auto", maxWidth: 720 }}>
              {!messages.length && !thinking ? <AgentWelcome onPick={ask} viewModel={viewModel} /> : renderBubbles(false)}
            </div>
          </div>
          <div style={{ background: "var(--bg)", borderTop: "1px solid var(--border)", padding: "12px 28px 18px" }}>
            <div style={{ margin: "0 auto", maxWidth: 720 }}>
              {chatBox}
            </div>
          </div>
        </div>
        {panel ? (
          <aside key={`${panel.panelTitle}-${messages.length}`} style={{ animation: "agentpanel .32s cubic-bezier(.22,1,.36,1)", background: "var(--bg)", borderLeft: "1px solid var(--border)", display: "flex", flexDirection: "column", flexShrink: 0, width: 444 }}>
            <div style={{ borderBottom: "1px solid var(--border)", padding: "18px 20px 12px" }}>
              <div style={{ alignItems: "center", display: "flex", gap: 8 }}>
                <span style={{ alignItems: "center", background: "var(--accent-soft)", borderRadius: 9, color: "var(--accent)", display: "flex", height: 30, justifyContent: "center", width: 30 }}>
                  <Icon name={agentPanelIcon(panel)} size={17} />
                </span>
                <h3 className="h-section">{panel.panelTitle}</h3>
              </div>
              <div style={{ color: "var(--text-3)", fontSize: 12, marginTop: 6 }}>
                {agentPanelHint(panel, t)}
              </div>
            </div>
            <div className="scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "16px 18px 24px" }}>
              <AgentPanelContent language={language} panel={panel} navigate={navigate} t={t} />
            </div>
          </aside>
        ) : null}
        </div>
      ) : null}

      {isMobileLayout ? (
        <div className="orbit-mobile-only" style={{ flex: 1, flexDirection: "column", minHeight: 0 }}>
        <div ref={scrollRef} className="scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "18px 16px 12px" }}>
          {!messages.length && !thinking ? <AgentWelcome onPick={ask} viewModel={viewModel} /> : renderBubbles(true)}
        </div>
        <div style={{ background: "var(--bg)", borderTop: "1px solid var(--border)", padding: "10px 16px 18px" }}>
          {chatBox}
        </div>
        </div>
      ) : null}

      {isMobileLayout && histOpen ? (
        <div className="orbit-mobile-only" style={{ inset: 0, position: "fixed", zIndex: 90 }}>
          <div onClick={() => setHistOpen(false)} style={{ backdropFilter: "blur(3px)", background: "var(--scrim)", inset: 0, position: "absolute" }} />
          <div style={{ animation: "slideInLeft .26s cubic-bezier(.22,1,.36,1)", background: "var(--bg)", bottom: 0, boxShadow: "var(--sh-pop)", display: "flex", flexDirection: "column", left: 0, maxWidth: 320, position: "absolute", top: 0, width: "84%" }}>
            <div style={{ alignItems: "center", borderBottom: "1px solid var(--border)", display: "flex", flexShrink: 0, height: 54, padding: "0 14px" }}>
              <span style={{ color: "var(--ink)", fontSize: 15, fontWeight: 700 }}>{t({ en: "Chat history", zh: "对话历史" })}</span>
              <div style={{ flex: 1 }} />
              <button type="button" className="hit-44" onClick={() => setHistOpen(false)} aria-label={t({ en: "Close", zh: "关闭" })} style={{ alignItems: "center", background: "var(--surface-2)", border: "none", borderRadius: 999, color: "var(--text-2)", cursor: "pointer", display: "flex", fontSize: 15, height: 30, justifyContent: "center", width: 30 }}><Icon name="x" size={16} /></button>
            </div>
            <div style={{ padding: 12 }}>
              <button type="button" onClick={newChat} style={{ alignItems: "center", background: "var(--surface)", border: "1px solid var(--border-2)", borderRadius: 11, color: "var(--ink)", cursor: "pointer", display: "flex", fontFamily: "var(--ff)", fontSize: 13.5, fontWeight: 600, gap: 7, height: 40, justifyContent: "center", width: "100%" }}>
                <Icon name="plus" size={16} color="var(--accent)" />
                {t({ en: "New chat", zh: "新对话" })}
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 1, padding: "0 12px 4px" }}>
              <div className="eyebrow" style={{ padding: "2px 8px 6px" }}>{t({ en: "Go to", zh: "前往" })}</div>
              {[
                ["/", "home", t({ en: "Home", zh: "首页" })],
                ["/explore", "calendar", t({ en: "Events", zh: "活动" })],
                ["/home/schedule", "clock", t({ en: "Calendar", zh: "日程" })],
                ["/home/cards", "wallet", t({ en: "Contacts", zh: "人脉" })],
              ].map(([href, icon, label]) => (
                <button key={href} type="button" onClick={() => { setHistOpen(false); navigate(href); }} style={{ alignItems: "center", background: "none", border: "none", borderRadius: 9, color: "var(--ink)", cursor: "pointer", display: "flex", fontFamily: "var(--ff)", fontSize: 14, fontWeight: 550, gap: 11, padding: "9px 8px", textAlign: "left", width: "100%" }}>
                  <Icon name={icon} size={17} color="var(--accent)" />
                  {label}
                </button>
              ))}
              <div style={{ background: "var(--border)", height: 1, margin: "7px 8px 2px" }} />
              <div className="eyebrow" style={{ padding: "2px 8px 4px" }}>{t({ en: "Chat history", zh: "对话历史" })}</div>
            </div>
            <div className="scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "2px 8px 18px" }}>
              <AgentHistoryList activeQ={activeQ} history={viewModel.history} onPick={pickHistory} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
