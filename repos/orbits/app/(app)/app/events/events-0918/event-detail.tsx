"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";

import type { OrbitLandingEventView } from "../../orbit-landing-route-view-model";
import { useOrbitLanguage, type OrbitLanguage } from "../../orbit-language-context";
import { agentHrefForContext } from "../../orbit-agent-context-href";
import { eventTemporalBounds } from "../../orbit-event-temporal";
import { productHref } from "../../orbit-public-shell";
import { gradientFromString } from "../../orbit-reference-primitives";
import { getDemoEventSceneAsset } from "../../../../../shared/demo-visual-assets";
import { EventCover } from "../orbit-event-cover";
import { OrbitEventMatchmaking, type EventMatchmakingSummary } from "../[id]/orbit-event-matchmaking";
import { OrbitPostEventCenter } from "../[id]/orbit-post-event-center";
import { eventRegistrationIsOpen, eventRegistrationLabel, type EventRegistrationAvailability } from "../../orbit-event-registration-view-model";
import { registrationBlockingReasonCopy } from "../../../../../features/events/registration/blocking-reason-copy";
import type { EventRegistrationBlockingReason } from "../../../../../features/events/registration/contract";
import { CTA_TONE, STATUS_CHIP, ctaFor, eventChipKind, eventDetailHref, formatEventDateRange, type EventListLanguage } from "./events-model";
import { EVENTS_STYLES } from "./events-shell";

/**
 * Orbit_0918 Events（参与者侧）活动详情 + 回顾态。
 * JSX 逐元素来自 docs/designs/Orbit_0918/Events.dc.html 第 141–219 行（详情）与 521–580 行（回顾）。
 * 数据层不动（page.tsx 的 canonical 详情解析 / 报名快照 / 参会者名单原样传入）；
 * chip / CTA 在 ./events-model.ts；参会者 / 会后中心继续组合 ../[id]/ 下的既有组件（任务 5 重做弹窗）。
 *
 * 数据真实性决定（2026-09-22 计划）：
 * - 封面 = 真实 orbit-event-cover（设计的渐变 + coverText 无来源）；状态 chip 放封面右上（与列表卡一致）；
 * - hero 简介 = 活动摘要 / 描述；标签 = 活动 tags（无 → 省略）；「N 人已报名」仅在真实人数存在时；
 * - CTA 按 `ctaFor`：进行中且已报名 → 进入活动现场；未报名且报名开放 → 立即报名；未报名且未开放 → 禁用并显示报名窗口状态；
 *   「修改报名信息」= 已报名时链 `/register`（报名窗口未开放 → 禁用）；`⋮` 菜单省略；
 * - 页签重叠语义按设计：介绍 = 介绍 + 参会者；议程 = 介绍（含议程卡）；参会者 = 参会者；主办方 = 主办方；
 * - 介绍段落 = 活动描述（亮点三卡 `highlights` 固定文案无来源 → 省略）；议程 = 真实议程（`agendaShort`）；
 * - 参会者 = 既有 OrbitEventMatchmaking（推荐 / 名单 / 交换）；未报名 → 「报名后可见」空态；
 * - 主办方 = 详情 VM 主办信息；「主办方后台 →」仅当 `canOpenOperations`（主办方 / 活动角色）时链 `/operations`；
 * - 回顾态（`?view=recap` 或已结束）：四页签共用一个正文；统计四卡只有总参会人数真实，其余「—」；
 *   参会者列表 = 已发布名单（有已接受交换的 contactId → 「保持联系」链联系人，否则省略）；
 *   「探索更多活动」→ `/app/events`；回看现场 / 完整视频 / 会后资料三条 → 省略；
 *   「生成总结」页签 → 显式「等 W4」空态；「交流记录」页签在共用正文下追加既有会后中心（保持既有能力可达）。
 */

type Translate = (copy: { en: string; zh: string }) => string;
type RegistrationStatus = "cancelled" | "rsvped" | null;
type JourneyStage = "joined" | "post" | "pre";
type DetailTab = "agenda" | "host" | "intro" | "people";
type RecapTab = "notes" | "people" | "recap" | "summary";
export type EventDetailView = "detail" | "recap";

const TOKYO_TIME_ZONE = { timeZone: "Asia/Tokyo" } as const;

const EVENT_TAG_COPY: Record<string, { en: string; zh: string }> = {
  calendar_sync: { en: "Calendar synced", zh: "日历已同步" },
  confirmed: { en: "Confirmed", zh: "已确认" },
  "event import": { en: "Event import", zh: "活动导入" },
  invite_only: { en: "Invite only", zh: "仅限邀请" },
  live: { en: "In person", zh: "线下活动" },
  online: { en: "Online", zh: "线上活动" },
  partners: { en: "Partners", zh: "合作伙伴" },
  "relationship building": { en: "Relationship building", zh: "关系建立" },
};

function eventTagLabel(tag: string, t: Translate): string {
  const copy = EVENT_TAG_COPY[tag.trim().toLowerCase()];
  return copy ? t(copy) : tag;
}

function dateLocale(language: OrbitLanguage): string {
  return language === "en" ? "en-US" : "zh-CN";
}

function listLanguage(language: OrbitLanguage): EventListLanguage {
  return language === "ja" ? "en" : language;
}

function fmtMonth(date: Date, language: OrbitLanguage): string {
  return new Intl.DateTimeFormat(dateLocale(language), { month: "short", ...TOKYO_TIME_ZONE }).format(date);
}

function fmtDay(date: Date, language: OrbitLanguage): string {
  return new Intl.DateTimeFormat(dateLocale(language), { day: "2-digit", ...TOKYO_TIME_ZONE }).format(date);
}

export function eventTime(event: OrbitLandingEventView, t: Translate, language: OrbitLanguage) {
  const bounds = eventTemporalBounds(event.startsAt, event.endsAt);
  if (bounds.start === null) {
    return {
      date: t({ en: "Time TBD", zh: "时间待定" }),
      day: "--",
      month: "--",
      time: t({ en: "Start time TBD", zh: "开始时间待定" }),
    };
  }

  const date = new Intl.DateTimeFormat(dateLocale(language), {
    weekday: "long",
    month: "short",
    day: "numeric",
    ...TOKYO_TIME_ZONE,
  }).format(bounds.start);
  const formatter = new Intl.DateTimeFormat(dateLocale(language), {
    hour: "2-digit",
    minute: "2-digit",
    ...TOKYO_TIME_ZONE,
  });

  return {
    date,
    day: fmtDay(bounds.start, language),
    month: fmtMonth(bounds.start, language),
    time: bounds.hasValidRange && bounds.end !== null
      ? `${formatter.format(bounds.start)}–${formatter.format(bounds.end)}`
      : `${formatter.format(bounds.start)} · ${t({ en: "End time TBD", zh: "结束时间待确认" })}`,
  };
}

export function canUseEventDetailHistoryBack(referrer: string, currentHref: string): boolean {
  if (!referrer) return false;
  try {
    const current = new URL(currentHref);
    const previous = new URL(referrer);
    const isOrbitProductPath = previous.pathname === "/" || previous.pathname.startsWith("/app/");
    return previous.origin === current.origin
      && isOrbitProductPath
      && `${previous.pathname}${previous.search}${previous.hash}` !== `${current.pathname}${current.search}${current.hash}`;
  } catch {
    return false;
  }
}

export function agendaProgress(
  event: Pick<OrbitLandingEventView, "agenda" | "endsAt" | "startsAt" | "status">,
  now: Date,
): { currentIndex: number; items: { label: string; time: string }[] } {
  const items = event.agenda.map((item) => ({ label: item.label, time: item.time }));
  if (!items.length) return { currentIndex: -1, items };
  if (event.status === "ended") return { currentIndex: items.length, items };

  const bounds = eventTemporalBounds(event.startsAt, event.endsAt);
  if (bounds.start === null || now.getTime() < bounds.start.getTime()) return { currentIndex: -1, items };

  const wallMinutes = (value: string): number | null => {
    const match = /^(\d{1,2}):(\d{2})/u.exec(value.trim());
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
  };
  const [hour, minute] = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    ...TOKYO_TIME_ZONE,
  }).format(bounds.start).split(":").map(Number);
  const startWallMinutes = hour * 60 + minute;
  let currentIndex = -1;
  for (let index = 0; index < items.length; index += 1) {
    const minutes = wallMinutes(items[index].time);
    if (minutes === null) continue;
    const at = bounds.start.getTime() + (minutes - startWallMinutes) * 60_000;
    if (now.getTime() >= at) currentIndex = index;
  }
  return { currentIndex: currentIndex === -1 ? 0 : currentIndex, items };
}

/** 回顾态参会者卡片的最小字段；`contactId` 只在已接受的交换存在时出现（「保持联系」门槛）。 */
export interface RecapPerson {
  company: string | null;
  contactId: string | null;
  initial: string;
  name: string;
  role: string | null;
}

/**
 * 回顾态参会者列表：优先用已发布运营名单（含已接受交换的 contactId），否则用服务端已注册名单
 * （无 contactId → 「保持联系」省略）；未报名 → 空数组（调用方渲染「仅向已确认参会者开放」）。
 */
export function recapPeople(
  event: Pick<OrbitLandingEventView, "stats">,
  summary: EventMatchmakingSummary | null,
  youRsvped: boolean,
): RecapPerson[] {
  if (!youRsvped) return [];
  if (summary && summary.people.length > 0) {
    return summary.people.map((person) => ({
      company: person.company,
      contactId: person.contactId,
      initial: person.displayName.trim().slice(0, 1).toUpperCase() || "?",
      name: person.displayName,
      role: person.role,
    }));
  }
  return event.stats.attendees.map((attendee) => ({
    company: null,
    contactId: null,
    initial: attendee.initial,
    name: attendee.name,
    role: attendee.role || null,
  }));
}

/** 回顾统计四卡（设计 101 `recapStats`）：总参会人数真实，其余无来源 → 「—」。 */
export function recapStats(
  event: Pick<OrbitLandingEventView, "stats">,
  youRsvped: boolean,
): { icon: string; n: string; label: { en: string; zh: string } }[] {
  const count = typeof event.stats.count === "number" && Number.isFinite(event.stats.count)
    ? event.stats.count
    : youRsvped && event.stats.attendees.length > 0
      ? event.stats.attendees.length
      : null;
  return [
    { icon: "◎", n: count === null ? "—" : String(count), label: { en: "Total attendees", zh: "总参会人数" } },
    { icon: "▤", n: "—", label: { en: "Conversations", zh: "交流对话数" } },
    { icon: "✦", n: "—", label: { en: "Follow-ups agreed", zh: "达成后续意向" } },
    { icon: "▦", n: "—", label: { en: "Companies / orgs", zh: "参与企业 / 机构" } },
  ];
}

function BackButton({ t }: { t: Translate }) {
  const goBack = () => {
    if (window.history.length > 1 && canUseEventDetailHistoryBack(document.referrer, window.location.href)) {
      window.history.back();
      return;
    }
    window.location.assign(productHref("/events"));
  };

  return (
    <button aria-label={t({ en: "Back to previous page", zh: "返回上一页" })} className="btn ev-back" onClick={goBack} type="button">
      ← {t({ en: "Back to events", zh: "返回活动列表" })}
    </button>
  );
}

function StatusChip({ event, hero = false }: { event: OrbitLandingEventView; hero?: boolean }) {
  const { t } = useOrbitLanguage();
  const chip = STATUS_CHIP[eventChipKind(event.status, Boolean(event.stats.youRsvped))];
  return (
    <span className={`ev-chip ${hero ? "ev-chip-hero" : "ev-chip-cover"}`} style={{ background: chip.bg, color: chip.fg }}>
      {t(chip.label)}
    </span>
  );
}

function coverImageUrl(event: OrbitLandingEventView): string {
  const sceneAsset = getDemoEventSceneAsset(event.id) ?? getDemoEventSceneAsset(event.code);
  return event.detailLogoUrl || event.logoUrl || sceneAsset?.src || "";
}

function participantCountLabel(event: OrbitLandingEventView, t: Translate): string | null {
  if (typeof event.stats.count !== "number" || !Number.isFinite(event.stats.count)) return null;
  const cap = typeof event.cap === "number" && Number.isFinite(event.cap) ? ` / ${event.cap}` : "";
  const noun = event.status === "active"
    ? t({ en: "attending now", zh: "人正在参加" })
    : event.status === "ended"
      ? t({ en: "attended", zh: "人参加过" })
      : t({ en: "registered", zh: "人已报名" });
  return `${event.stats.count}${cap} ${noun}`;
}

/**
 * hero 主 CTA（设计 160）：按 `ctaFor` 映射；未报名且报名未开放 → 禁用并显示报名窗口状态
 * （与 dashboard 共用 `eventRegistrationLabel` 口径）。已报名且未开始 → 无主 CTA（只有「修改报名信息」）。
 */
function PrimaryCta({
  event,
  registrationAvailability,
  registrationStatus,
  t,
}: {
  event: OrbitLandingEventView;
  registrationAvailability: EventRegistrationAvailability;
  registrationStatus: RegistrationStatus;
  t: Translate;
}) {
  const { preserveHref } = useOrbitLanguage();
  const registered = registrationStatus === "rsvped";
  const cta = ctaFor({ code: event.code || event.id, registered, status: event.status }, registrationAvailability);
  const tone = CTA_TONE[cta.tone];
  if (cta.kind === "live" || cta.kind === "register") {
    return (
      <a className="btn ev-cta-primary" data-events-cta={cta.kind} href={preserveHref(cta.href)} style={{ background: tone.bg, color: tone.fg }}>
        {cta.kind === "register" && registrationStatus === "cancelled" ? t({ en: "Register again", zh: "重新报名" }) : t(cta.label)}{cta.kind === "live" ? " →" : ""}
      </a>
    );
  }
  if (registered) return null;
  const label = event.status !== "upcoming"
    ? t({ en: "Registration closed", zh: "报名已结束" })
    : t(eventRegistrationLabel(registrationAvailability));
  return (
    <button className="btn ev-cta-primary ev-cta-disabled" data-events-cta="closed" disabled type="button">
      {label}
    </button>
  );
}

/** 「修改报名信息」（设计 161）：已报名时链 `/register`；报名窗口未开放（资料锁定 / 已结束）→ 禁用。 */
function ModifyRegistrationCta({
  event,
  registrationAvailability,
  t,
}: {
  event: OrbitLandingEventView;
  registrationAvailability: EventRegistrationAvailability;
  t: Translate;
}) {
  const { preserveHref } = useOrbitLanguage();
  const registrationHref = `/app/events/${encodeURIComponent(event.code || event.id)}/register`;
  const label = t({ en: "Edit registration", zh: "修改报名信息" });
  if (event.status === "upcoming" && eventRegistrationIsOpen(registrationAvailability)) {
    return <a className="btn ev-cta-secondary" data-events-cta="modify" href={preserveHref(registrationHref)}>{label}</a>;
  }
  return (
    <button className="btn ev-cta-secondary ev-cta-disabled" data-events-cta="modify" disabled title={t(eventRegistrationLabel(registrationAvailability))} type="button">
      {label}
    </button>
  );
}

/** 设计 172–188：活动介绍卡 + 活动议程卡（`agendaShort`：time / title / sub / ⌄）。 */
function IntroPanel({ event, t }: { event: OrbitLandingEventView; t: Translate }) {
  const paragraphs = [event.summaryZh, event.descriptionZh !== event.summaryZh ? event.descriptionZh : ""].filter((text) => text && text.trim());
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    if (event.status !== "active") return undefined;
    if (typeof window === "undefined" || typeof window.setInterval !== "function") return undefined;
    const timer = window.setInterval(() => setNowTick(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, [event.status]);
  const progress = agendaProgress(event, new Date(nowTick));
  return (
    <div className="ev-intro-grid">
      <div className="ev-card-panel">
        <h2 className="ev-h2">{t({ en: "About this event", zh: "活动介绍" })}</h2>
        {paragraphs.length ? paragraphs.map((text, index) => <p className="ev-p" key={index}>{text}</p>) : (
          <p className="ev-p ev-muted">{t({ en: "The organizer has not published an introduction yet.", zh: "主办方暂未发布活动介绍。" })}</p>
        )}
      </div>
      <div className="ev-card-panel ev-card-panel-agenda">
        <h2 className="ev-h2">{t({ en: "Agenda", zh: "活动议程" })}</h2>
        {event.agenda.length ? event.agenda.map((item, index) => {
          const done = index < progress.currentIndex || progress.currentIndex >= progress.items.length;
          const current = index === progress.currentIndex && progress.currentIndex < progress.items.length;
          return (
            <div className="ev-agenda-row" data-state={done ? "done" : current ? "now" : undefined} key={`${item.time}-${item.label}`}>
              <span className="ev-agenda-time">{item.time}</span>
              <span className="ev-agenda-copy">
                <strong className="ev-agenda-title">{item.label}</strong>
                {item.description ? <span className="ev-agenda-sub">{item.description}</span> : null}
              </span>
              <span aria-hidden="true" className="ev-agenda-caret">⌄</span>
            </div>
          );
        }) : (
          <p className="ev-p ev-muted">{t({ en: "The agenda will be announced by the organizer.", zh: "议程待主办方公布。" })}</p>
        )}
      </div>
    </div>
  );
}

/** 设计 191–209：「你可能感兴趣的参会者」卡；数据源 = 既有 OrbitEventMatchmaking；未报名 → 「报名后可见」。 */
function PeoplePanel({
  event,
  onSummary,
  registrationAvailability,
  registrationStatus,
  t,
  youRsvped,
}: {
  event: OrbitLandingEventView;
  onSummary: (summary: EventMatchmakingSummary | null) => void;
  registrationAvailability: EventRegistrationAvailability;
  registrationStatus: RegistrationStatus;
  t: Translate;
  youRsvped: boolean;
}) {
  const { preserveHref } = useOrbitLanguage();
  if (!youRsvped) {
    return (
      <div className="ev-card-panel" data-events-people="teaser">
        <div className="ev-panel-head">
          <h2 className="ev-h2">{t({ en: "Attendees you may like", zh: "你可能感兴趣的参会者" })}</h2>
        </div>
        <p className="ev-p ev-muted">
          {t({
            en: "The attendee list and your matches appear here after you register. Names are never shown before registration — including for ended events.",
            zh: "报名后可见：报名后，这里会展示参会者名单与你的人脉匹配。报名前（含已结束的活动）不公开任何姓名。",
          })}
        </p>
        <div className="ev-cta-row">
          <PrimaryCta event={event} registrationAvailability={registrationAvailability} registrationStatus={registrationStatus} t={t} />
        </div>
      </div>
    );
  }
  // 参会者名单是唯一的参会者目录（data-event-participant-directory），
  // 不再额外渲染重复的「全部参会者」入口。
  return (
    <div className="ev-card-panel" data-events-people="real">
      <div className="ev-panel-head">
        <h2 className="ev-h2">{t({ en: "Attendees you may like", zh: "你可能感兴趣的参会者" })}</h2>
        {event.status === "active" ? (
          <a className="btn ev-link" href={preserveHref(`${eventDetailHref(event.code || event.id)}/live`)}>{t({ en: "See all attendees →", zh: "查看全部参会者 →" })}</a>
        ) : null}
      </div>
      <OrbitEventMatchmaking
        authenticated={event.stats.authed}
        contactRequestsOpen={event.status !== "upcoming"}
        eventId={event.id}
        onWorkspaceSummary={onSummary}
        registrationOpen={event.status === "upcoming" && eventRegistrationIsOpen(registrationAvailability)}
      />
    </div>
  );
}

/** 设计 212–217：主办方卡；「主办方后台 →」仅当当前用户可打开运营台。 */
function HostPanel({ canOpenOperations, event, t }: { canOpenOperations: boolean; event: OrbitLandingEventView; t: Translate }) {
  const { preserveHref } = useOrbitLanguage();
  const organizer = event.organizer.trim();
  if (!organizer) {
    return (
      <div className="ev-card-panel">
        <h2 className="ev-h2">{t({ en: "Organizer", zh: "主办方" })}</h2>
        <p className="ev-p ev-muted">{t({ en: "Organizer pending — the event source has not provided organizer information yet.", zh: "主办方待确认：活动来源暂未提供主办方信息。" })}</p>
      </div>
    );
  }
  const initial = organizer.slice(0, 1).toUpperCase();
  return (
    <div className="ev-host">
      <span className="ev-host-logo">{initial}</span>
      <span className="ev-host-copy">
        <strong className="ev-host-name">{organizer}</strong>
        <span className="ev-host-desc">{event.host && event.host !== organizer ? event.host : t({ en: "Event organizer on Orbit.", zh: "本场活动的主办方。" })}</span>
      </span>
      {canOpenOperations ? (
        <a className="btn ev-host-btn" href={preserveHref(`${eventDetailHref(event.code || event.id)}/operations`)}>
          {t({ en: "Organizer console →", zh: "主办方后台 →" })}
        </a>
      ) : null}
    </div>
  );
}

function RecapBody({
  event,
  people,
  t,
  youRsvped,
}: {
  event: OrbitLandingEventView;
  people: RecapPerson[];
  t: Translate;
  youRsvped: boolean;
}) {
  const { language, preserveHref } = useOrbitLanguage();
  const stats = recapStats(event, youRsvped);
  const bounds = eventTemporalBounds(event.startsAt, event.endsAt);
  // 设计 545 的「于 … 圆满结束」句：只在真正结束后用真实结束日期；`?view=recap` 提前进入回顾态时省略。
  const endedOn = event.status === "ended" && bounds.end
    ? new Intl.DateTimeFormat(dateLocale(language), { year: "numeric", month: "long", day: "numeric", ...TOKYO_TIME_ZONE }).format(bounds.end)
    : null;
  const name = event.name || event.code;
  return (
    <div className="ev-recap-grid">
      <div className="ev-recap-col">
        <div className="ev-recap-card">
          <div className="ev-recap-card-head">
            <span className="ev-recap-card-title ev-recap-card-title-center">
              <span aria-hidden="true" className="ev-icon-44">▶</span>
              <h2 className="ev-h2">{t({ en: "Event recap", zh: "活动回顾" })}</h2>
            </span>
          </div>
          <p className="ev-recap-p">
            {endedOn ? t({ en: `${name} wrapped up on ${endedOn}. `, zh: `${name} 于 ${endedOn} 结束。` }) : null}
            {event.descriptionZh || event.summaryZh || ""}
          </p>
        </div>
        <div className="ev-recap-card">
          <div className="ev-recap-card-head">
            <span className="ev-recap-card-title">
              <span aria-hidden="true" className="ev-icon-44">◎</span>
              <span className="ev-recap-card-copy">
                <h2 className="ev-h2">{t({ en: "Featured attendees", zh: "精选参会者" })}</h2>
                <span className="ev-recap-desc">{t({ en: "Meet the people who were active at this event and keep in touch.", zh: "认识在本次活动中活跃的参与者，继续保持联系。" })}</span>
              </span>
            </span>
          </div>
          {people.length ? (
            <div className="ev-recap-people-grid">
              {people.map((person) => (
                <div className="ev-recap-person" data-events-recap-person={person.contactId ? "contact" : "attendee"} key={`${person.name}-${person.role ?? ""}`}>
                  <div className="ev-recap-person-head">
                    <span className="ev-avatar">{person.initial}</span>
                    <span className="ev-recap-person-copy">
                      <strong className="ev-person-name">{person.name}</strong>
                      {person.role ? <span className="ev-recap-person-sub">{person.role}</span> : null}
                      {person.company ? <span className="ev-recap-person-sub">{person.company}</span> : null}
                    </span>
                  </div>
                  {person.contactId ? (
                    <a className="btn ev-person-btn" href={preserveHref(`/app/contacts/${encodeURIComponent(person.contactId)}`)}>◎ {t({ en: "Keep in touch", zh: "保持联系" })}</a>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="ev-p ev-muted">
              {youRsvped
                ? t({ en: "The attendee roster for this event has not been published.", zh: "本场活动的参会者名单尚未发布。" })
                : t({ en: "This event has ended. Private participant records are only available to confirmed attendees.", zh: "活动已结束；参会者名单仅向已确认参会者开放。" })}
            </p>
          )}
        </div>
        <div className="ev-banner">
          <span aria-hidden="true" className="ev-icon-44">◎</span>
          <span className="ev-banner-copy">
            <strong className="ev-banner-title">{t({ en: "Keep the connections going", zh: "让连接延续下去" })}</strong>
            <span className="ev-recap-desc">{t({ en: "Review the connections you made at this event, or explore more related events.", zh: "查看你在本次活动中建立的连接，或探索更多相关活动，拓展你的可能性。" })}</span>
          </span>
          <a className="btn ev-banner-btn" href={preserveHref("/app/events")}>{t({ en: "Explore more events →", zh: "探索更多活动 →" })}</a>
        </div>
      </div>
      <div className="ev-recap-col">
        <div className="ev-side-card">
          <span className="ev-side-head">
            <span aria-hidden="true" className="ev-icon-40">▮</span>
            <h2 className="ev-h2 ev-h2-20">{t({ en: "Highlights", zh: "数据亮点" })}</h2>
          </span>
          <div className="ev-stat-grid">
            {stats.map((stat) => (
              <div className="ev-rstat" data-events-recap-stat key={stat.label.zh}>
                <span aria-hidden="true" className="ev-rstat-icon">{stat.icon}</span>
                <span className="ev-rstat-copy">
                  <strong className="ev-rstat-n">{stat.n}</strong>
                  <span className="ev-rstat-label">{t(stat.label)}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function RecapSummaryEmpty({ t }: { t: Translate }) {
  return (
    <div className="ev-card-panel" data-events-recap-empty="summary">
      <h2 className="ev-h2">{t({ en: "Generate summary", zh: "生成总结" })}</h2>
      <p className="ev-p ev-muted">{t({ en: "Waiting for W4 — the AI recap summary lands with workstream 4.", zh: "等 W4：活动 AI 总结将随工作流 4 上线，当前不生成。" })}</p>
    </div>
  );
}

function Tabs<T extends string>({ active, label, onSelect, tabs }: { active: T; label: string; onSelect: (tab: T) => void; tabs: { id: T; label: string }[] }) {
  return (
    <nav aria-label={label} className="ev-tabs" role="tablist">
      {tabs.map((item) => (
        <button
          aria-selected={active === item.id}
          className={`btn ev-tab ${active === item.id ? "ev-tab-on" : "ev-tab-off"}`}
          key={item.id}
          onClick={() => onSelect(item.id)}
          role="tab"
          type="button"
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}

function AskOrbit({ event, name, t, language, time }: { event: OrbitLandingEventView; name: string; t: Translate; language: OrbitLanguage; time: string }) {
  const askAgentHref = agentHrefForContext({
    details: [event.status === "ended" ? t({ en: "Ended", zh: "已结束" }) : event.status === "active" ? t({ en: "In progress", zh: "进行中" }) : t({ en: "Upcoming", zh: "即将开始" }), event.venue, time].filter(Boolean).join(" · "),
    id: event.id,
    kind: "event",
    label: name,
    language: language === "zh" ? "zh" : "en",
  });
  return (
    <div className="ev-orb-dock">
      <a aria-label={t({ en: "Ask iOrbit about this event", zh: "向 iOrbit 询问这场活动" })} className="ev-orb" data-agent-context="event" href={askAgentHref} title={t({ en: "Ask iOrbit", zh: "问 iOrbit" })}>
        ✦<span className="ev-orb-pip" />
      </a>
    </div>
  );
}

export function EventDetail({
  canOpenOperations = false,
  event,
  registrationAvailability = "unavailable",
  registrationBlockingReason,
  view,
}: {
  canOpenOperations?: boolean;
  event: OrbitLandingEventView;
  registrationAvailability?: EventRegistrationAvailability;
  registrationBlockingReason?: EventRegistrationBlockingReason;
  view?: EventDetailView;
  /** 旧属性：现场入口改由 `ctaFor` 决定（已报名且进行中 → `/live`），此值不再参与渲染。 */
  workspaceAvailable?: boolean;
}) {
  const { t, language } = useOrbitLanguage();
  const lang = listLanguage(language);
  const name = event.name || event.code || t({ en: "Event", zh: "活动" });
  const imageUrl = coverImageUrl(event);
  const sceneAsset = getDemoEventSceneAsset(event.id) ?? getDemoEventSceneAsset(event.code);
  const registrationStatus: RegistrationStatus = event.stats.youRsvped ? "rsvped" : null;
  const youRsvped = registrationStatus === "rsvped";
  const stage: JourneyStage = event.status === "ended" ? "post" : youRsvped ? "joined" : "pre";
  const recap = view === "recap" || event.status === "ended";
  const [tab, setTab] = useState<DetailTab>("intro");
  const [recapTab, setRecapTab] = useState<RecapTab>("recap");
  const [summary, setSummary] = useState<EventMatchmakingSummary | null>(null);
  const onSummary = useCallback((value: EventMatchmakingSummary | null) => setSummary(value), []);
  const dateFull = formatEventDateRange(event, lang, true);
  const lede = event.summaryZh || event.descriptionZh || "";
  const countLabel = participantCountLabel(event, t);

  const cover = (className: string, monogramSize: number, children?: ReactNode) => (
    <EventCover
      className={className}
      g={gradientFromString(event.code || name)}
      imageAlt={name}
      imageLoading="eager"
      imageSizes="(min-width: 900px) 480px, 100vw"
      imageUrl={imageUrl}
      monogram={imageUrl ? null : { text: name.slice(0, 1), size: monogramSize }}
    >
      {children}
    </EventCover>
  );

  const peoplePanel = (
    <PeoplePanel event={event} onSummary={onSummary} registrationAvailability={registrationAvailability} registrationStatus={registrationStatus} t={t} youRsvped={youRsvped} />
  );

  if (recap) {
    const people = recapPeople(event, summary, youRsvped);
    const recapTabs: { id: RecapTab; label: string }[] = [
      { id: "recap", label: t({ en: "Recap", zh: "回顾" }) },
      { id: "people", label: t({ en: "Attendees", zh: "参会者" }) },
      { id: "notes", label: t({ en: "Notes", zh: "交流记录" }) },
      { id: "summary", label: t({ en: "Summary", zh: "生成总结" }) },
    ];
    return (
      <main className="ev-main" data-appscroll data-event-journey-state={stage} data-events-view="recap" data-orbit-route="app-event-detail">
        <style>{EVENTS_STYLES}</style>
        <div className="ev-detail">
          <BackButton t={t} />
          <div className="ev-recap-hero">
            <div data-demo-visual-asset-id={sceneAsset?.assetId} data-demo-visual-source={sceneAsset?.sourceLabel} data-demo-visual-source-label={sceneAsset?.sourceLabel}>
              {cover("ev-recap-cover", 40)}
            </div>
            <div className="ev-recap-copy">
              <StatusChip event={event} hero />
              <h1 className="ev-recap-h1">{name}</h1>
              {lede ? <span className="ev-recap-sub">{lede}</span> : null}
              <span className="ev-recap-meta">
                <span><span aria-hidden="true">▦</span> {dateFull}</span>
                <span><span aria-hidden="true">◎</span> {event.place || event.venue}</span>
              </span>
              {countLabel ? (
                <span className="ev-recap-people">
                  {youRsvped && event.stats.attendees.length ? (
                    <span className="ev-initials">
                      {event.stats.attendees.slice(0, 4).map((attendee, index) => <span className="ev-initial" key={`${attendee.name}-${index}`}>{attendee.initial}</span>)}
                    </span>
                  ) : null}
                  <span className="ev-recap-n">{countLabel}</span>
                </span>
              ) : null}
            </div>
          </div>
          <Tabs<RecapTab> active={recapTab} label={t({ en: "Recap sections", zh: "回顾栏目" })} onSelect={setRecapTab} tabs={recapTabs} />
          {recapTab === "summary" ? <RecapSummaryEmpty t={t} /> : <RecapBody event={event} people={people} t={t} youRsvped={youRsvped} />}
          {/* 会后中心只在活动真正结束后挂载（其 followups API 对未结束活动返回 409）。 */}
          {recapTab === "notes" && youRsvped && event.status === "ended" ? (
            <div className="ev-card-panel" data-events-recap-notes>
              <h2 className="ev-h2">{t({ en: "Post-event center", zh: "会后中心" })}</h2>
              <OrbitPostEventCenter acceptedContacts={summary?.acceptedContacts ?? 0} eventId={event.id} />
            </div>
          ) : null}
          {/* 已发布名单（含已接受交换的 contactId）只来自既有参会者组件；回顾态保持其挂载但不展示。 */}
          {youRsvped ? <div className="ev-panel" hidden>{peoplePanel}</div> : null}
        </div>
        <AskOrbit event={event} language={language} name={name} t={t} time={dateFull} />
      </main>
    );
  }

  const tabs: { id: DetailTab; label: string }[] = [
    { id: "intro", label: t({ en: "About", zh: "介绍" }) },
    { id: "agenda", label: t({ en: "Agenda", zh: "议程" }) },
    { id: "people", label: t({ en: "Attendees", zh: "参会者" }) },
    { id: "host", label: t({ en: "Organizer", zh: "主办方" }) },
  ];
  // 设计 88：dIntro = intro || agenda；dPeople = people || intro；dHost = host。
  const showIntro = tab === "intro" || tab === "agenda";
  const showPeople = tab === "people" || tab === "intro";
  const showHost = tab === "host";
  const tags = event.tags.filter((tag) => tag.trim());

  return (
    <main className="ev-main" data-appscroll data-event-journey-state={stage} data-events-view="detail" data-orbit-route="app-event-detail">
      <style>{EVENTS_STYLES}</style>
      <div className="ev-detail">
        <BackButton t={t} />

        <section className="ev-hero">
          <div
            className="ev-hero-cover-wrap"
            data-demo-visual-asset-id={sceneAsset?.assetId}
            data-demo-visual-source={sceneAsset?.sourceLabel}
            data-demo-visual-source-label={sceneAsset?.sourceLabel}
          >
            {cover("ev-hero-cover", 64, <StatusChip event={event} />)}
          </div>

          <div className="ev-hero-copy">
            <h1 className="ev-hero-h1">{name}</h1>
            {lede ? <p className="ev-hero-lede">{lede}</p> : null}
            {tags.length || event.cap !== undefined ? (
              <div className="ev-dtags">
                {tags.map((tag) => <span className="ev-dtag" key={tag}>{eventTagLabel(tag, t)}</span>)}
                {event.cap === null ? <span className="ev-dtag">{t({ en: "No capacity limit", zh: "不设人数上限" })}</span> : null}
                {typeof event.cap === "number" && Number.isFinite(event.cap) ? <span className="ev-dtag">{t({ en: `Capacity ${event.cap}`, zh: `限 ${event.cap} 人` })}</span> : null}
              </div>
            ) : null}
            <div className="ev-info">
              <span className="ev-info-row"><span aria-hidden="true" className="ev-info-icon">▦</span>{dateFull}</span>
              <span className="ev-info-row"><span aria-hidden="true" className="ev-info-icon">◎</span>{event.venue || event.place || t({ en: "Venue TBD", zh: "地点待定" })}{event.address ? ` · ${event.address}` : ""}</span>
              <span className="ev-info-row"><span aria-hidden="true" className="ev-info-icon">◫</span>{event.organizer.trim() || t({ en: "Organizer pending", zh: "主办方待确认" })}</span>
              {countLabel ? <span className="ev-info-row"><span aria-hidden="true" className="ev-info-icon">◌</span>{countLabel}</span> : null}
            </div>
            {registrationAvailability === "unavailable" && !youRsvped ? <p className="ev-alert" role="status">{registrationBlockingReasonCopy(registrationBlockingReason, language === "zh" ? "zh" : "en")}</p> : null}
            <div className="ev-cta-row">
              <PrimaryCta event={event} registrationAvailability={registrationAvailability} registrationStatus={registrationStatus} t={t} />
              {youRsvped ? <ModifyRegistrationCta event={event} registrationAvailability={registrationAvailability} t={t} /> : null}
            </div>
          </div>
        </section>

        <Tabs<DetailTab> active={tab} label={t({ en: "Event sections", zh: "活动栏目" })} onSelect={setTab} tabs={tabs} />

        <div className="ev-panel" data-events-panel="intro" hidden={!showIntro}>
          <IntroPanel event={event} t={t} />
        </div>
        <div className="ev-panel" data-events-panel="people" hidden={!showPeople}>
          {peoplePanel}
        </div>
        <div className="ev-panel" data-events-panel="host" hidden={!showHost}>
          <HostPanel canOpenOperations={canOpenOperations} event={event} t={t} />
        </div>
      </div>
      <AskOrbit event={event} language={language} name={name} t={t} time={dateFull} />
    </main>
  );
}
