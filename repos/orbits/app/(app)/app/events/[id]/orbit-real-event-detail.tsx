"use client";

import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from "react";

import type { OrbitLandingEventView } from "../../orbit-landing-route-view-model";
import { useOrbitLanguage, type OrbitLanguage } from "../../orbit-language-context";
import { partyHrefForEvent } from "../../orbit-product-href";
import { agentHrefForContext } from "../../orbit-agent-context-href";
import { eventTemporalBounds } from "../../orbit-event-temporal";
import { productHref, PublicTopNav } from "../../orbit-public-shell";
import { Avatar, gradientFromString, Icon } from "../../orbit-reference-primitives";
import { getDemoEventSceneAsset } from "../../../../../shared/demo-visual-assets";
import { EventCover } from "../orbit-event-cover";
import { OrbitEventMatchmaking, type EventMatchmakingSummary } from "./orbit-event-matchmaking";
import { OrbitPostEventCenter } from "./orbit-post-event-center";
import type { EventRegistrationAvailability } from "../../../../../features/events/registration/deadline-gated-service";

type Translate = (copy: { en: string; zh: string }) => string;
type RegistrationStatus = "cancelled" | "rsvped" | null;
type JourneyStage = "joined" | "post" | "pre";

const TOKYO_TIME_ZONE = { timeZone: "Asia/Tokyo" } as const;
const JOURNEY_STAGE_DONE: Record<JourneyStage, number> = { pre: 0, joined: 3, post: 5 };
const JOURNEY_STEPS = [
  { en: "Register and answer 2 questions", zh: "报名并回答 2 题" },
  { en: "Complete your event profile", zh: "完成活动画像" },
  { en: "View matches and seating", zh: "查看匹配与座位" },
  { en: "Exchange business cards", zh: "现场交换名片" },
  { en: "Review and follow up", zh: "会后复盘与跟进" },
] as const;
const SAMPLE_MATCHES = [
  {
    initial: "山田",
    name: { en: "Takuya Yamada", zh: "山田 拓也" },
    role: { en: "Cross-border logistics · BD lead", zh: "跨境物流 · 商务负责人" },
    why: { en: "Looking for overseas-warehouse partners — complementary to a channel-seeking goal.", zh: "他在为日本中小卖家找海外仓伙伴，与你的「找渠道」目标互补。" },
  },
  {
    initial: "陈",
    name: { en: "Jing Chen", zh: "陈 静" },
    role: { en: "DTC brand founder", zh: "DTC 品牌创始人" },
    why: { en: "Preparing to enter Kansai and wants to meet local channels.", zh: "正在筹备进入关西市场，想认识本地渠道。" },
  },
  {
    initial: "金",
    name: { en: "Jiwon Kim", zh: "金 志源" },
    role: { en: "Cross-border payments BD", zh: "跨境支付 BD" },
    why: { en: "Can address the JPY settlement problem mentioned in the profile.", zh: "能解决画像中提到的日元结算问题，双方目标匹配度高。" },
  },
] as const;

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

function BackButton({ t }: { t: Translate }) {
  const goBack = () => {
    if (window.history.length > 1 && canUseEventDetailHistoryBack(document.referrer, window.location.href)) {
      window.history.back();
      return;
    }
    window.location.assign(productHref("/events"));
  };

  return (
    <button aria-label={t({ en: "Back to previous page", zh: "返回上一页" })} className="cover-back hit-44" onClick={goBack} type="button">
      <Icon name="back" size={16} />{t({ en: "Back", zh: "返回" })}
    </button>
  );
}

function ActionButton({
  children,
  className,
  disabled = false,
  href,
  onBeforeNavigate,
  style,
}: {
  children: ReactNode;
  className: string;
  disabled?: boolean;
  href?: string;
  onBeforeNavigate?: () => void;
  style?: CSSProperties;
}) {
  return (
    <button
      className={className}
      disabled={disabled}
      onClick={href && !disabled ? () => {
        onBeforeNavigate?.();
        window.location.href = href;
      } : undefined}
      style={style}
      type="button"
    >
      {children}
    </button>
  );
}

function InfoTile({ icon, sub, title }: { icon: string; sub?: string | null; title: string }) {
  return (
    <div className="a-info">
      <span className="ic"><Icon name={icon} size={16} /></span>
      <div className="a-info-copy">
        <b>{title}</b>
        {sub ? <span title={sub}>{sub}</span> : null}
      </div>
    </div>
  );
}

function primaryAction(
  event: OrbitLandingEventView,
  t: Translate,
  registrationStatus: RegistrationStatus,
  registrationAvailability: EventRegistrationAvailability,
  flex: CSSProperties["flex"] = "0 0 auto",
) {
  const registrationHref = `/app/events/${encodeURIComponent(event.code || event.id)}/register`;
  if (event.status === "ended") {
    return <ActionButton className="btn is-disabled" disabled style={{ flex }}>{t({ en: "Ended", zh: "已结束" })}</ActionButton>;
  }
  if (registrationStatus === "rsvped") {
    return (
      <ActionButton className="btn btn-soft" href={registrationHref} style={{ flex }}>
        <Icon name="check" size={17} />{t({ en: "Manage registration", zh: "管理报名" })}
      </ActionButton>
    );
  }
  if (registrationStatus === "cancelled") {
    if (registrationAvailability !== "open") {
      return <RegistrationUnavailableAction availability={registrationAvailability} event={event} flex={flex} showReminder t={t} />;
    }
    return (
      <ActionButton className="btn btn-primary" href={registrationHref} style={{ flex }}>
        {t({ en: "Register again", zh: "重新报名" })}<Icon color="var(--on-dark)" name="arrow" size={17} />
      </ActionButton>
    );
  }
  if (registrationAvailability !== "open") {
    return <RegistrationUnavailableAction availability={registrationAvailability} event={event} flex={flex} showReminder t={t} />;
  }
  return (
    <ActionButton className="btn btn-primary" href={registrationHref} style={{ flex }}>
      {t({ en: "Answer 2 questions & register", zh: "回答 2 题并报名" })}<Icon color="var(--on-dark)" name="arrow" size={17} />
    </ActionButton>
  );
}

function registrationAvailabilityCopy(
  availability: Exclude<EventRegistrationAvailability, "open">,
  t: Translate,
): string {
  if (availability === "registration_closed") {
    return t({ en: "Registration closed", zh: "报名已截止" });
  }
  if (availability === "profile_edit_closed") {
    return t({ en: "Registration profile closed", zh: "报名资料已冻结" });
  }
  return t({ en: "Registration unavailable", zh: "报名暂不可用" });
}

function RegistrationUnavailableAction({
  availability,
  event,
  flex,
  showReminder = false,
  t,
}: {
  availability: Exclude<EventRegistrationAvailability, "open">;
  event?: OrbitLandingEventView;
  flex: CSSProperties["flex"];
  showReminder?: boolean;
  t: Translate;
}) {
  const detail =
    availability === "registration_closed"
      ? t({
          en: "The cutoff has passed, so this event will not reopen registration.",
          zh: "本场报名截止时间已过，不会再次开放报名。",
        })
      : availability === "profile_edit_closed"
        ? t({
            en: "The required event-profile window is frozen, so the complete registration flow cannot reopen.",
            zh: "报名所需的活动画像编辑窗口已冻结，本场不会重新开放完整报名流程。",
          })
        : t({
            en: "The registration window is missing or cannot be read. A next opening time has not been published.",
            zh: "报名窗口尚未配置或当前无法读取；下一次开放时间尚未公布。",
          });

  return (
    <div data-event-registration-unavailable style={{ display: "grid", flex, gap: 6 }}>
      <ActionButton className="btn is-disabled" disabled style={{ width: "100%" }}>
        {registrationAvailabilityCopy(availability, t)}
      </ActionButton>
      <span role="status" style={{ color: "var(--text-2)", fontSize: 12, lineHeight: 1.5 }}>
        {detail}{" "}
        <a href={productHref("/events")}>
          {t({ en: "View other events accepting registration", zh: "查看其他可报名活动" })}
        </a>
      </span>
      {showReminder && availability === "unavailable" && event ? (
        <RegistrationOpeningReminderButton event={event} t={t} />
      ) : null}
    </div>
  );
}

type OpeningReminderUiState =
  | "error"
  | "loading"
  | "not_subscribed"
  | "subscribed";

function RegistrationOpeningReminderButton({
  event,
  t,
}: {
  event: OrbitLandingEventView;
  t: Translate;
}) {
  const [state, setState] = useState<OpeningReminderUiState>("loading");
  const [saving, setSaving] = useState(false);
  const endpoint = `/api/events/${encodeURIComponent(event.id)}/registration-opening-reminder`;

  useEffect(() => {
    if (!event.stats.authed) {
      setState("not_subscribed");
      return;
    }
    const controller = new AbortController();
    void fetch(endpoint, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json() as {
          data?: { state?: "not_subscribed" | "notified" | "subscribed" };
          success?: boolean;
        };
        if (!response.ok || body.success !== true) throw new Error("Reminder state unavailable");
        setState(body.data?.state === "subscribed" ? "subscribed" : "not_subscribed");
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) setState("error");
      });
    return () => controller.abort();
  }, [endpoint, event.stats.authed]);

  if (!event.stats.authed) {
    return (
      <a
        className="btn btn-ghost btn-sm"
        href={`/app/account/login?next=${encodeURIComponent(`/app/events/${event.code || event.id}`)}`}
      >
        {t({ en: "Sign in to remind me", zh: "登录后提醒我" })}
      </a>
    );
  }

  const subscribed = state === "subscribed";
  const update = async () => {
    setSaving(true);
    try {
      const response = await fetch(endpoint, {
        body: JSON.stringify({ eventTitle: event.name || event.code || "Event" }),
        headers: { "content-type": "application/json" },
        method: subscribed ? "DELETE" : "POST",
      });
      const body = await response.json() as {
        data?: { state?: "not_subscribed" | "subscribed" };
        error?: { message?: string };
        success?: boolean;
      };
      if (!response.ok || body.success !== true) {
        throw new Error(body.error?.message ?? "Reminder update failed");
      }
      setState(body.data?.state === "subscribed" ? "subscribed" : "not_subscribed");
    } catch {
      setState("error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: 8 }}>
      <button
        aria-busy={saving || state === "loading"}
        aria-pressed={subscribed}
        className="btn btn-ghost btn-sm"
        disabled={saving || state === "loading"}
        onClick={() => void update()}
        type="button"
      >
        {saving
          ? t({ en: "Saving…", zh: "保存中…" })
          : subscribed
            ? t({ en: "Reminder subscribed · Cancel", zh: "已订阅提醒 · 取消" })
            : t({ en: "Remind me when registration opens", zh: "开放报名时提醒我" })}
      </button>
      <span aria-live="polite" style={{ color: state === "error" ? "var(--danger)" : "var(--text-3)", fontSize: 12 }}>
        {state === "error"
          ? t({ en: "The reminder could not be saved. Try again.", zh: "提醒未保存，请重试。" })
          : subscribed
            ? t({ en: "Saved to this account. Orbit will create an in-app notification when the window opens.", zh: "已保存到当前账号；窗口开放后会生成站内通知。" })
            : t({ en: "Account-scoped and cancellable at any time.", zh: "仅绑定当前账号，可随时取消。" })}
      </span>
    </div>
  );
}

function enterAction(event: OrbitLandingEventView, t: Translate, workspaceAvailable: boolean) {
  if (!workspaceAvailable) return null;
  const label = event.status === "ended"
    ? t({ en: "Replay event workspace", zh: "回看活动工作台" })
    : event.status === "upcoming"
      ? t({ en: "View event preparation", zh: "查看活动准备" })
      : t({ en: "Enter event", zh: "进入活动" });
  return (
    <ActionButton
      className="btn btn-ghost"
      href={partyHrefForEvent(event.id)}
      onBeforeNavigate={() => window.sessionStorage.setItem("orbit-party-return-url", window.location.href)}
    >
      {label}<Icon name="arrowUR" size={16} />
    </ActionButton>
  );
}

function OrganizerRailCard({ event, t }: { event: OrbitLandingEventView; t: Translate }) {
  const organizer = event.organizer.trim();
  const initial = organizer.slice(0, 1).toUpperCase() || "O";
  const slug = (event.code || "org").toLowerCase();

  if (!organizer) {
    return (
      <div className="card rail-card">
        <div className="eyebrow">{t({ en: "Organizer", zh: "主办方" })}</div>
        <div className="rail-org">
          <Avatar letter={initial} g="g-teal" size={40} />
          <div className="rail-org-copy">
            <b className="rail-org-name">{t({ en: "Organizer pending", zh: "主办方待确认" })}</b>
            <span className="rail-org-meta">{t({ en: "Organizer information is not yet available.", zh: "活动来源暂未提供主办方信息。" })}</span>
          </div>
        </div>
      </div>
    );
  }

  const body = (
    <div className="rail-org">
      <Avatar letter={initial} g="g-teal" size={40} />
      <div className="rail-org-copy">
        <b className="rail-org-name">{organizer}</b>
        <span className="rail-org-meta">{t({ en: `Multiple events hosted · ${event.host}`, zh: `已举办多场 · ${event.host}` })}</span>
      </div>
      <Icon name="chevR" size={17} color="var(--text-4)" />
    </div>
  );

  return (
    <div className="card rail-card">
      <div className="eyebrow">{t({ en: "Organizer", zh: "主办方" })}</div>
      <a href={productHref(`/o/${slug}`)} style={{ color: "inherit", textDecoration: "none" }}>{body}</a>
    </div>
  );
}

function JourneyRail({ participated, stage, t }: { participated: boolean; stage: JourneyStage; t: Translate }) {
  // An ended event is a visual lifecycle state, not evidence that this account
  // completed the attendee journey. Keep the rail neutral for non-participants.
  const done = stage === "post" && !participated ? 0 : JOURNEY_STAGE_DONE[stage];
  return (
    <div className="card rail-card">
      <div className="eyebrow">{t({ en: "My journey", zh: "我的旅程" })}</div>
      <div className="rail-stage">
        {JOURNEY_STEPS.map((step, index) => {
          const stepNumber = index + 1;
          const stateClass = stepNumber <= done ? " done" : stepNumber === done + 1 && stage !== "post" ? " now" : "";
          return (
            <div className={`rail-stage-row${stateClass}`} key={step.en}>
              <span className="n">{stepNumber <= done ? <Icon name="check" size={11} /> : stepNumber}</span>
              {t(step)}
            </div>
          );
        })}
      </div>
    </div>
  );
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

function JourneyCollapse({ children, open }: { children: ReactNode; open: boolean }) {
  return <div className="journey-collapse" hidden={!open}>{children}</div>;
}

function EventDetailsExtra({ event, t }: { event: OrbitLandingEventView; t: Translate }) {
  if (!event.about?.length && !event.agenda.length) return null;
  return (
    <div className="a-details-extra">
      {event.about?.length ? (
        <section>
          <h3>{t({ en: "About this event", zh: "关于活动" })}</h3>
          <div className="a-about-list">
            {event.about.map((item) => (
              <div className="a-about-item" key={item.label}>
                <div className="a-about-label">{item.label}</div>
                <p className="a-about-body">{item.body}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {event.agenda.length ? (
        <section>
          <h3>{t({ en: "Agenda", zh: "活动议程" })}</h3>
          <div className="a-agenda">
            {event.agenda.map((item) => (
              <div className="a-agenda-row" key={`${item.time}-${item.label}`}>
                <span className="a-agenda-time">{item.time}</span>
                <div className="a-agenda-copy"><b>{item.label}</b>{item.description ? <span>{item.description}</span> : null}</div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function ProgressStrip({ event, t }: { event: OrbitLandingEventView; t: Translate }) {
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    if (event.status !== "active") return undefined;
    const timer = window.setInterval(() => setNowTick(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, [event.status]);
  const progress = agendaProgress(event, new Date(nowTick));
  if (!progress.items.length) return null;

  return (
    <div aria-label={t({ en: "Event progress", zh: "活动进程" })} className="progress-wrap">
      <div className="progress-scroll">
        {progress.items.map((item, index) => {
          const done = index < progress.currentIndex || progress.currentIndex >= progress.items.length;
          const current = index === progress.currentIndex && progress.currentIndex < progress.items.length;
          return (
            <div className={`p-step${done ? " done" : ""}${current ? " now" : ""}`} key={`${item.time}-${item.label}`}>
              <div className="p-node">
                <span className="p-dot">{done ? <Icon name="check" size={12} /> : index + 1}</span>
                <span className="p-label">{item.label}</span>
                <span className="p-time">{item.time}</span>
              </div>
              {index < progress.items.length - 1 ? <span className={`p-link${done ? " done" : ""}`} /> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RegistrationPreview({
  event,
  registrationAvailability,
  t,
}: {
  event: OrbitLandingEventView;
  registrationAvailability: EventRegistrationAvailability;
  t: Translate;
}) {
  const registrationHref = `/app/events/${encodeURIComponent(event.code || event.id)}/register`;
  const compactPreview = registrationAvailability !== "open";
  const visibleMatches = compactPreview ? SAMPLE_MATCHES.slice(0, 1) : SAMPLE_MATCHES;
  return (
    <div className="b-hook">
      <p className="hook-lede">
        {compactPreview
          ? t({ en: "Registration is unavailable, so only a short labeled preview is shown.", zh: "当前无法报名，因此这里只保留一条明确标注的简短预览。" })
          : t({ en: "After you register, this becomes your on-site workspace. The content below is a sample:", zh: "报名后，这里会变成你的现场工作台。下面是它为参会者生成的内容（示例）：" })}
      </p>
      <div className="hook-grid">
        <div className="glass-dark hook-card">
          <h4>{t({ en: "People matched for you · sample", zh: "为你推荐的人 · 示例" })}</h4>
          {visibleMatches.map((person, index) => (
            <div className="mock-person" key={person.name.en}>
              <Avatar g={["g-teal", "g-slate", "g-sand"][index]} letter={person.initial} size={36} />
              <div className="mock-person-copy">
                <b>{t(person.name)}</b><span className="role">{t(person.role)}</span><p className="why">{t(person.why)}</p>
              </div>
            </div>
          ))}
        </div>
        {!compactPreview ? <div className="hook-side">
          <div className="glass-dark hook-card">
            <h4>{t({ en: "Your seat · sample", zh: "你的座位 · 示例" })}</h4>
            <div className="hook-seat"><span className="seat-num">{t({ en: "Table 5", zh: "5 桌" })}</span><span className="seat-desc">{t({ en: "Round 2 · table of 6, grouped around market-entry goals", zh: "第 2 轮 · 6 人桌，围绕「市场进入」目标组桌" })}</span></div>
          </div>
          <div className="glass-dark hook-card">
            <h4>{t({ en: "Opener suggestion · sample", zh: "开场白建议 · 示例" })}</h4>
            <p className="hook-open">{t({ en: "“I hear you run overseas warehouses for Japanese sellers — do you have capacity in Kansai?”", zh: "「听说你们在帮日本卖家做海外仓，我们正好在选仓——你们在关西有点位吗？」" })}</p>
          </div>
        </div> : null}
      </div>
      <div className="hook-foot">
        {registrationAvailability === "open" ? (
          <ActionButton className="btn btn-unlock" href={registrationHref}>
            <Icon name="lock" size={15} />{t({ en: "Register to unlock your real matches", zh: "报名后解锁你的真实匹配" })}
          </ActionButton>
        ) : (
          <RegistrationUnavailableAction
            availability={registrationAvailability}
            flex="0 0 auto"
            t={t}
          />
        )}
        <span className="note">{t({ en: "Sample only · real results use your two registration answers", zh: "以上为示例效果，实际内容基于你的两项报名回答生成" })}</span>
      </div>
    </div>
  );
}

function EventInfoCard({
  event,
  mini,
  registrationAvailability,
  registrationStatus,
  stage,
  t,
  workspaceAvailable,
}: {
  event: OrbitLandingEventView;
  mini: { name: string; timeDate: string; timeTime: string; venue: string };
  registrationAvailability: EventRegistrationAvailability;
  registrationStatus: RegistrationStatus;
  stage: JourneyStage;
  t: Translate;
  workspaceAvailable: boolean;
}) {
  const [open, setOpen] = useState(stage === "pre");
  useEffect(() => setOpen(stage === "pre"), [stage]);
  const remainingSeats = Math.max(0, event.cap - event.stats.count);
  const full = stage === "pre" || open;
  // One badge slot for all three stages. Before this the seat count lived above
  // the display title and the registered/ended pill lived on the collapsed
  // bar's small title — two places saying what state you are in.
  const status = stage === "post"
    ? { label: t({ en: "Ended", zh: "已结束" }), tone: "badge-muted" }
    : stage === "joined"
      ? { label: t({ en: "Registered", zh: "已报名" }), tone: "badge-success" }
      : registrationAvailability === "open"
        ? { label: t({ en: `Registration open · ${remainingSeats} seats left`, zh: `报名中 · 剩 ${remainingSeats} 席` }), tone: "badge-success" }
        : { label: registrationAvailabilityCopy(registrationAvailability, t), tone: "badge-muted" };

  return (
    <section aria-label={t({ en: "Event information", zh: "活动信息" })} className="card cardA">
      {/* The title sits outside JourneyCollapse so it is rendered once, at one
          size, in every stage. Folding used to swap a 26px display title for a
          15.5px bar title, which read as two different headings for the same
          event — and while expanded both were on screen at once. */}
      <div className={`a-head a-headline-block${full ? "" : " is-collapsed"}`}>
        <div className="a-headline">
          <h1 className="h-display a-title">{mini.name}</h1>
          <span className={`badge ${status.tone}`}>{status.label}</span>
          {stage !== "pre" ? (
            <button aria-expanded={open} className="fold-btn a-headline-fold" onClick={() => setOpen((value) => !value)} type="button">
              {t({ en: "Event details", zh: "活动详情" })}<span className="chev"><Icon name="chevD" size={14} /></span>
            </button>
          ) : null}
        </div>
        {/* Collapsed only: expanded, the info tiles below carry time and venue. */}
        {full ? null : (
          <div className="a-mini-meta"><Icon name="clock" size={13} />{mini.timeDate} {mini.timeTime}<Icon name="pin" size={13} />{mini.venue}</div>
        )}
      </div>

      <JourneyCollapse open={full}>
        <div>
          <div className="a-head a-head-rest">
            <div className="a-chips">
              <span className="chip">{event.code}</span>
            </div>
            {event.organizer ? <p className="a-sub">Orbit × {event.organizer} {t({ en: "co-hosted", zh: "联合主办" })}</p> : null}
            <div className="a-tags">
              {event.tags.map((tag) => <span className="a-tag" key={tag}>{eventTagLabel(tag, t)}</span>)}
              {event.cap ? <span className="a-tag">{t({ en: `Capacity ${event.cap}`, zh: `限 ${event.cap} 人` })}</span> : null}
            </div>
          </div>

          <div className="orbit-info-grid">
            <InfoTile icon="clock" sub={event.agenda[0] ? `${event.agenda[0].time} ${event.agenda[0].label}` : null} title={`${mini.timeDate} ${mini.timeTime}`} />
            <InfoTile icon="pin" sub={event.address || t({ en: "Address to be announced", zh: "详细地址待主办方公布" })} title={mini.venue} />
            <InfoTile icon="users" sub={event.industry || event.theme} title={`${t({ en: "Registered", zh: "已报名" })} ${event.stats.count}${event.cap ? ` / ${event.cap}` : ""} ${t({ en: "people", zh: "人" })}`} />
            <InfoTile icon="sparkle" sub={event.theme || t({ en: "Matched and seated by Orbit", zh: "由 Orbit 匹配与分桌" })} title={event.feeLabel} />
          </div>

          <div className="a-desc">
            {event.summaryZh ? <p>{event.summaryZh}</p> : null}
            {event.descriptionZh && event.descriptionZh !== event.summaryZh ? <p>{event.descriptionZh}</p> : null}
          </div>

          <div className="a-cta-row">
            {primaryAction(event, t, registrationStatus, registrationAvailability)}
            {registrationStatus === "rsvped" ? enterAction(event, t, workspaceAvailable) : null}
            {stage === "pre" && event.status !== "ended" && registrationAvailability === "open" ? <span className="a-cta-note">{t({ en: "Just 2 questions · your first match direction appears right after", zh: "只需 2 个问题 · 报名后立即看到你的初步匹配方向" })}</span> : null}
          </div>
          <EventDetailsExtra event={event} t={t} />
          {stage !== "pre" ? (
            <div className="a-cta-row" style={{ paddingTop: 0 }}>
              <button className="fold-btn" onClick={() => setOpen(false)} type="button">{t({ en: "Collapse details", zh: "收起详情" })}<span className="chev" style={{ transform: "rotate(180deg)" }}><Icon name="chevD" size={14} /></span></button>
            </div>
          ) : null}
        </div>
      </JourneyCollapse>
    </section>
  );
}

function OnsiteCard({
  event,
  onSummary,
  registrationAvailability,
  stage,
  summary,
  t,
  youRsvped,
}: {
  event: OrbitLandingEventView;
  onSummary: (summary: EventMatchmakingSummary | null) => void;
  registrationAvailability: EventRegistrationAvailability;
  stage: JourneyStage;
  summary: EventMatchmakingSummary | null;
  t: Translate;
  youRsvped: boolean;
}) {
  const [reviewOpen, setReviewOpen] = useState(false);
  const liveOpen = stage === "joined" || (stage === "post" && reviewOpen);
  return (
    <section aria-label={t({ en: "On-site", zh: "活动现场" })} className="cardB">
      <div className="b-head">
        <div className="b-titlewrap"><span className="b-eyebrow">{t({ en: "On-site", zh: "现场阶段" })}</span><span className="b-title">{t({ en: "Event floor", zh: "活动现场" })}</span></div>
        {stage === "joined" && event.status === "active" ? <span className="badge-live"><span className="dot" />LIVE · {t({ en: "In progress", zh: "进行中" })}</span> : null}
        {stage === "pre" ? <span className="ai-chip on-dark"><Icon name="sparkle" size={11} />{t({ en: "Feature sample", zh: "功能示例" })}</span> : null}
        {stage === "post" && youRsvped ? (
          <button aria-expanded={reviewOpen} className="fold-btn" onClick={() => setReviewOpen((value) => !value)} type="button">
            {t({ en: "Review the event floor", zh: "回顾现场内容" })}<span className="chev"><Icon name="chevD" size={14} /></span>
          </button>
        ) : null}
      </div>

      {stage === "pre" ? <RegistrationPreview event={event} registrationAvailability={registrationAvailability} t={t} /> : null}
      {stage === "post" ? (
        <div className="b-ended-bar">
          {youRsvped
            ? <span>{t({ en: "Event ended", zh: "活动已结束" })} · {t({ en: "Cards exchanged", zh: "交换名片" })} <b>{summary?.acceptedContacts ?? "—"}</b></span>
            : <span>{t({ en: "This event has ended. Private participant records are only available to confirmed attendees.", zh: "活动已结束；私人现场记录仅向已确认参会者开放。" })}</span>}
        </div>
      ) : null}

      {youRsvped ? (
        <JourneyCollapse open={liveOpen}>
          <div className="b-live">
            <ProgressStrip event={event} t={t} />
            {summary?.resultsState === "ready" && (summary.roundOneTable || summary.roundTwoTable) ? (
              <div className="journey-matchmaking">
                <div className="glass-dark hook-card">
                  <h4>{t({ en: "My seat", zh: "我的座位" })}</h4>
                  <div className="hook-foot" style={{ marginTop: 0 }}>
                    {[summary.roundOneTable, summary.roundTwoTable].map((table, index) => table ? (
                      <span className="chip" key={`${table.tableNumber}-${index}`}>{t({ en: `Round ${index + 1} · Table ${table.tableNumber}`, zh: `第 ${index + 1} 轮 · ${table.tableNumber} 号桌` })}{table.seat ? ` · ${t({ en: `Seat ${table.seat}`, zh: `座位 ${table.seat}` })}` : ""}</span>
                    ) : null)}
                  </div>
                </div>
              </div>
            ) : null}
            <div className="journey-matchmaking">
              <OrbitEventMatchmaking
                authenticated={event.stats.authed}
                contactRequestsOpen={event.status !== "upcoming"}
                eventId={event.id}
                onWorkspaceSummary={onSummary}
                registrationOpen={event.status !== "ended" && registrationAvailability === "open"}
              />
            </div>
          </div>
        </JourneyCollapse>
      ) : null}
    </section>
  );
}

function PostEventCard({ event, stage, summary, t, youRsvped }: { event: OrbitLandingEventView; stage: JourneyStage; summary: EventMatchmakingSummary | null; t: Translate; youRsvped: boolean }) {
  return (
    <section aria-label={t({ en: "Post-event center", zh: "会后中心" })} className="card cardC">
      <div className="c-head">
        <div className="c-titlewrap"><span className="eyebrow">{t({ en: "Post-Event", zh: "会后阶段" })}</span><h3 className="h-display c-title">{t({ en: "Post-event center", zh: "会后中心" })}</h3></div>
        <div className="right"><span className="ai-chip on-light"><Icon name="sparkle" size={11} />{stage === "post" ? t({ en: "Generated by iOrbit", zh: "iOrbit 生成" }) : t({ en: "Feature sample", zh: "功能示例" })}</span></div>
      </div>
      <div className="c-body">
        {stage === "post" && youRsvped ? (
          <div className="c-real">
            <OrbitPostEventCenter acceptedContacts={summary?.acceptedContacts ?? 0} eventId={event.id} />
          </div>
        ) : stage === "post" ? (
          <div className="c-tint"><div className="glass-light c-empty">{t({ en: "You did not register for this event, so there is no private debrief. Browse Events to start a new journey.", zh: "你没有报名本场活动，因此没有私人会后复盘。可返回活动列表开始新的旅程。" })}</div></div>
        ) : (
          <div className="c-tint">
            <div className="glass-light c-mock">
              <b>{t({ en: "After the event, a debrief like this lands here", zh: "活动结束后，你会在这里收到一份这样的复盘" })}</b>
              <p>{t({ en: "Who exchanged cards with you, what you discussed, what each person can bring, and the next follow-up — organized into an actionable list.", zh: "谁和你交换了名片、聊了什么、这些人分别能给你带来什么、下一步该找谁聊什么——全部整理成可执行的跟进清单。" })}</p>
              <div className="c-stats">
                <span className="stat-pill"><b>4</b><span>{t({ en: "Cards exchanged", zh: "已交换名片" })}</span></span>
                <span className="stat-pill"><b>2</b><span>{t({ en: "Follow-ups agreed", zh: "约定的跟进" })}</span></span>
                <span className="stat-pill"><b>1</b><span>{t({ en: "Potential deals", zh: "潜在渠道合作" })}</span></span>
              </div>
              <p className="c-note">{stage === "joined" ? t({ en: "Generated after the event · numbers above are samples", zh: "活动结束后自动生成 · 以上为示例数据" }) : t({ en: "Sample data · register and attend for your real debrief", zh: "示例数据 · 报名并参加活动后生成你的真实复盘" })}</p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function EventDetailPanel({ askAgentHref, event, mini, registrationAvailability, t, workspaceAvailable }: {
  askAgentHref: string;
  event: OrbitLandingEventView;
  mini: { name: string; timeDate: string; timeTime: string; venue: string };
  registrationAvailability: EventRegistrationAvailability;
  t: Translate;
  workspaceAvailable: boolean;
}) {
  const [registrationStatus, setRegistrationStatus] = useState<RegistrationStatus>(event.stats.youRsvped ? "rsvped" : null);
  const [summary, setSummary] = useState<EventMatchmakingSummary | null>(null);
  const onSummary = useCallback((value: EventMatchmakingSummary | null) => setSummary(value), []);

  useEffect(() => {
    if (!event.stats.authed) {
      setRegistrationStatus(null);
      return;
    }
    const controller = new AbortController();
    void fetch(`/api/events/${encodeURIComponent(event.id)}/registration?questions=false`, { signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json()) as { data?: { registration?: { status?: RegistrationStatus } | null }; success?: boolean };
        if (response.ok && body.success === true) setRegistrationStatus(body.data?.registration?.status ?? null);
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) setRegistrationStatus(null);
      });
    return () => controller.abort();
  }, [event.id, event.stats.authed]);

  const youRsvped = registrationStatus === "rsvped";
  const stage: JourneyStage = event.status === "ended" ? "post" : youRsvped ? "joined" : "pre";

  return (
    <>
      <EventInfoCard event={event} mini={mini} registrationAvailability={registrationAvailability} registrationStatus={registrationStatus} stage={stage} t={t} workspaceAvailable={workspaceAvailable} />
      <OnsiteCard event={event} onSummary={onSummary} registrationAvailability={registrationAvailability} stage={stage} summary={summary} t={t} youRsvped={youRsvped} />
      <PostEventCard event={event} stage={stage} summary={summary} t={t} youRsvped={youRsvped} />
      <div className="orb-dock">
        <a aria-label={t({ en: "Ask iOrbit about this event", zh: "向 iOrbit 询问这场活动" })} className="orb-ball" data-agent-context="event" href={askAgentHref} title={t({ en: "Ask iOrbit", zh: "问 iOrbit" })}>
          <Icon name="sparkle" size={24} /><span className="pip" />
        </a>
      </div>
    </>
  );
}

export function OrbitRealEventDetail({ event, registrationAvailability, workspaceAvailable = false }: { event: OrbitLandingEventView; registrationAvailability: EventRegistrationAvailability; workspaceAvailable?: boolean }) {
  const { t, language } = useOrbitLanguage();
  // The approved journey uses one stable product-green fallback. Real event
  // artwork still wins when supplied; source-less events no longer receive a
  // random purple/red cover from their id hash.
  const cover = event.detailLogoUrl ? gradientFromString(event.code || event.name || "orbit") : "g-emerald";
  const time = eventTime(event, t, language);
  const name = event.name || event.code || t({ en: "Event", zh: "活动" });
  const sceneAsset = getDemoEventSceneAsset(event.id);
  const initialStage: JourneyStage = event.status === "ended" ? "post" : event.stats.youRsvped ? "joined" : "pre";
  const askAgentHref = agentHrefForContext({
    details: [event.status === "ended" ? t({ en: "Ended", zh: "已结束" }) : event.status === "active" ? t({ en: "In progress", zh: "进行中" }) : t({ en: "Upcoming", zh: "即将开始" }), event.venue, time.date].filter(Boolean).join(" · "),
    id: event.id,
    kind: "event",
    label: name,
    language: language === "zh" ? "zh" : "en",
  });
  const mini = { name, timeDate: time.date, timeTime: time.time, venue: event.venue || t({ en: "Venue TBD", zh: "地点待定" }) };

  return (
    <div className="journey orbit-shell" data-appscroll data-event-journey-state={initialStage} data-orbit-real-page="event-detail">
      <link href="/event-journey-green.css" rel="stylesheet" />
      <PublicTopNav active="events" />
      <main>
        <div
          className="detail-cover"
          data-demo-visual-asset-id={sceneAsset?.assetId}
          data-demo-visual-source={sceneAsset?.sourceLabel}
          data-demo-visual-source-label={sceneAsset?.sourceLabel}
        >
          <EventCover g={cover} imageAlt={name} imageLoading="eager" imageSizes="100vw" imageUrl={event.detailLogoUrl} style={{ position: "absolute", inset: 0 }} />
          <span className="detail-cover-star"><Icon name="sparkle" size={54} /></span>
          <BackButton t={t} />
        </div>

        <div className="orbit-detail-layout">
          <aside className="orbit-detail-rail">
            <EventCover className="rail-cover" g={cover} imageAlt={name} imageSizes="360px" imageUrl={event.detailLogoUrl}>
              <span className="rail-cover-code">{String(event.code || event.id).toUpperCase()}</span>
              <span className="rail-cover-status badge">
                {initialStage === "post"
                  ? t({ en: "Ended", zh: "已结束" })
                  : initialStage === "joined"
                    ? t({ en: "Registered", zh: "已报名" })
                    : registrationAvailability === "open"
                      ? t({ en: "Registration open", zh: "报名中" })
                      : registrationAvailabilityCopy(registrationAvailability, t)}
              </span>
            </EventCover>
            <OrganizerRailCard event={event} t={t} />
            <JourneyRail participated={event.stats.youRsvped} stage={initialStage} t={t} />
          </aside>

          <div className="orbit-detail-main">
            <EventDetailPanel askAgentHref={askAgentHref} event={event} mini={mini} registrationAvailability={registrationAvailability} t={t} workspaceAvailable={workspaceAvailable} />
          </div>
        </div>
      </main>
    </div>
  );
}
