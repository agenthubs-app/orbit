"use client";

// R17 イベント運営（Web 1440：web.html #20 概要 · 開場前；b12 #408 定型のお知らせ確認、#440 / #442 / #444 下書き · 中止 · アーカイブ 横幅）。
// 页头：活动名 +「主催 · 本日 19:00 · 渋谷ストリーム」+ 共同运营者头像 +「共同運営者」（&drawer=cohosts，下一段做抽屉）。
// 页签：概要 / マッチング / 参加者 N / 受付（跳 kiosk）/ 申込設定 / レポート；本段只做概要，其余是占位（HostConsoleTabs.tsx，后续替换）。
// 数据：GET /api/host/events/[id]/overview（requireEventCapability 在服务端）；定型通知 /notices/preview → /notices/send。
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { HostOverviewResponse, HostProgressStep } from "../../../../../shared/contract/host-console";
import type { HostEventView } from "../../../../../shared/contract/host-events";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import type { HostNoticePreview } from "../../../../../shared/contract/host-notices";
import { ShellPage } from "../shell/slots";
import { Icon, Modal, Orbit2026Scope, ToastProvider, useToast } from "../ui";
import { failureOf, hostApi, type HostApiFailure } from "./host-api";
import { HOST_CONSOLE_TABS, HostTabPlaceholder, parseConsoleTab, type HostConsoleTab } from "./HostConsoleTabs";
import { checkInHref, consoleHref, hostDateLong, hostDateShort, hostTime, hostTranslator, sameTokyoDay, type HostT } from "./host-model";
import s from "./host.module.css";

const id = (value: string) => encodeURIComponent(value);
const AVATAR_TONES = ["a_c4", "a_c2", "a_c1", "a_c3", "a_c5"] as const;
const STEPS: readonly HostProgressStep[] = ["registration", "generation", "review_groups", "publish", "check_in"];
const STEP_LABEL = { check_in: "pCheckIn", generation: "pGeneration", publish: "pPublish", registration: "pRegistration", review_groups: "pReview" } as const;
const INACTIVE = new Set(["draft", "cancelled", "archived"]);
const TAB_LABEL = { checkin: "tCheckIn", matching: "tMatching", overview: "tOverview", people: "tPeople", report: "tReport", setup: "tSetup" } as const;

/** 「主催 · 本日 19:00 · 渋谷ストリーム」；下書き / 中止 / アーカイブ は会場の代わりに状態（b12 #440–#444）。 */
export function consoleSubtitle(event: HostEventView, language: OrbitLanguage, t: HostT, now: Date): string {
  const when = event.startsAt ? (sameTokyoDay(event.startsAt, now) ? `${t("today")} ${hostTime(event.startsAt)}` : hostDateLong(event.startsAt, language, t)) : "";
  const tail = event.status === "draft" ? t("sDraft") : event.status === "cancelled" ? t("sCancelled") : event.status === "archived" ? t("sArchived") : event.venueName;
  return [t("roleHost"), when, tail].filter(Boolean).join(" · ");
}

function stepAction(step: HostProgressStep, eventId: string, t: HostT): { href: string; label: string } {
  switch (step) {
    case "registration": return { href: consoleHref(eventId, "setup"), label: t("aOpenSetup") };
    case "generation": return { href: consoleHref(eventId, "matching"), label: t("aGenerate") };
    case "review_groups": return { href: consoleHref(eventId, "matching"), label: t("aReview") };
    case "publish": return { href: consoleHref(eventId, "matching"), label: t("aPublish") };
    case "check_in": return { href: checkInHref(eventId), label: t("pCheckIn") };
  }
}

function Kpi({ chip, tone, value, unit, lbl, faded }: { chip: string; tone: string; value: number; unit?: string; lbl: string; faded?: boolean }) {
  return (
    <div className={`${s.card} ${s.span3} ${faded ? s.faded : ""}`}>
      <span className={`${s.chip} ${s[`c_${tone}`]}`}>{chip}</span>
      <div className={`${s.big} ${s.big10}`}>{value}{unit ? <small>{unit}</small> : null}</div>
      <div className={s.lbl}>{lbl}</div>
    </div>
  );
}

/** 下書き / 中止 / アーカイブ の横幅（b12 #440 / #442 / #444）。 */
function StatusBanner({ event, t, busy, onPublish, onArchive }: { event: HostEventView; t: HostT; busy: boolean; onPublish: () => void; onArchive: (archived: boolean) => void }) {
  if (event.status === "draft") {
    return (
      <div className={`${s.card} ${s.span12} ${s.banner} ${s.b_draft}`} data-host-banner="draft">
        <div className={s.row} style={{ gap: 12 }}>
          <span className={`${s.emo} ${s.e_apricot}`}>📝</span>
          <div className={s.grow}><b>{t("bDraft")}</b><div className={s.lbl}>{t("bDraftSub")}</div></div>
          <a className={`btn ${s.btn}`} href={`/app/events/${id(event.eventId)}/edit`}>{t("editBasics")}</a>
          <button type="button" className={`btn ${s.btn} ${s.primary}`} disabled={busy} onClick={onPublish}>{t("aPublish")}</button>
        </div>
      </div>
    );
  }
  if (event.status === "cancelled") {
    return (
      <div className={`${s.card} ${s.span12} ${s.banner} ${s.b_cancelled}`} data-host-banner="cancelled">
        <div className={s.row} style={{ gap: 12 }}>
          <span className={`${s.emo} ${s.e_surface}`}>⛔</span>
          <div className={s.grow}><b>{t("bCancelled", { d: hostDateShort(event.cancelledAt, t) })}</b><div className={s.lbl}>{t("bCancelledSub", { n: event.appliedCount })}</div></div>
          <button type="button" className={`btn ${s.btn}`} disabled={busy} onClick={() => onArchive(true)}>{t("archive")}</button>
        </div>
      </div>
    );
  }
  if (event.status === "archived") {
    return (
      <div className={`${s.card} ${s.span12} ${s.banner}`} data-host-banner="archived">
        <div className={s.row} style={{ gap: 12 }}>
          <span className={`${s.emo} ${s.e_surface2}`}>🗄️</span>
          <div className={s.grow}><b>{t("bArchived")}</b><div className={s.lbl}>{t("bArchivedSub")}</div></div>
          <button type="button" className={`btn ${s.btn}`} disabled={busy} onClick={() => onArchive(false)}>{t("unarchive")}</button>
        </div>
      </div>
    );
  }
  return null;
}

export type HostOverviewViewProps = { data: HostOverviewResponse; t: HostT; onNotice?: () => void };

/** 概要页签（web.html #20）。下書き / 中止 / アーカイブ 只画四格（b12 #440–#444）。 */
export function HostOverviewView({ data, t }: HostOverviewViewProps) {
  const event = data.event;
  const inactive = INACTIVE.has(event.status);
  const archived = event.status === "archived";
  const preOpen = data.checkedIn === 0 && data.recommendationRate != null;
  const arrival = inactive ? "" : data.arrivalRate != null ? t("oArrival", { r: data.arrivalRate }) : data.doorsOpenAt ? t("oDoorsOpen", { time: hostTime(data.doorsOpenAt) }) : "";
  const walkIn = data.todos.find((todo) => todo.kind === "review_pending")?.walkInSlots;
  const profile = data.todos.find((todo) => todo.kind === "profile_incomplete");
  const max = Math.max(1, ...data.trend);
  const hiIndex = data.trend.indexOf(Math.max(...data.trend));
  return (
    <>
      <Kpi chip={t("kApplied")} tone="lav" value={data.applied} lbl={data.capacity ? t("kCapacity", { n: data.capacity }) : ""} faded={archived} />
      <Kpi chip={t("oMatchable")} tone="blue" value={data.matchable} lbl={t("oProfileDone")} faded={archived} />
      <Kpi chip={t("oCheckedIn")} tone="teal" value={data.checkedIn} lbl={arrival} faded={archived} />
      {preOpen && !inactive
        ? <Kpi chip={t("oRecommend")} tone="apricot" value={data.recommendationRate!} unit="%" lbl={t("oPerPerson", { n: data.recommendationsPerPerson })} />
        : <Kpi chip={t("kPending")} tone="apricot" value={data.pendingReview} lbl={!inactive && walkIn ? t("oWalkIn") : ""} faded={archived} />}
      {!inactive ? (
        <>
          <div className={`${s.card} ${s.span8}`} data-host-trend="">
            <div className={s.cardH}><h3>{t("trendTitle")}</h3><span className={s.lbl}>{t("trendRange")}</span></div>
            <div className={s.bars}>{data.trend.map((value, index) => <i key={index} className={index === hiIndex ? s.hi : undefined} style={{ height: `${Math.round((value / max) * 96)}px` }} />)}</div>
          </div>
          <div className={`${s.card} ${s.span4}`} data-host-progress={data.currentStep}>
            <div className={s.cardH}><h3>{t("progTitle")}</h3></div>
            {STEPS.map((step) => {
              const done = data.completedSteps.includes(step);
              const current = !done && step === data.currentStep;
              const action = current ? stepAction(step, event.eventId, t) : null;
              return (
                <div key={step} className={`${s.chk} ${done ? s.chkDone : ""}`} data-step={step}>
                  <span className={s.box}>{done ? <Icon name="check" size={16} /> : null}</span>
                  <div className={s.grow}><b>{t(STEP_LABEL[step])}</b></div>
                  {action ? <a className={`btn ${s.btn} ${s.sm} ${s.primary}`} href={action.href}>{action.label}</a> : null}
                </div>
              );
            })}
          </div>
          {profile ? (
            <div className={`${s.card} ${s.span12} ${s.flat} ${s.todoCard}`} data-host-todo="profile_incomplete">
              <span className={`${s.emo} ${s.e_apricot} ${s.alertEmo}`}><Icon name="alert" size={20} /></span>
              <div className={s.grow}><b>{t("todoProfile", { n: profile.count })}</b><div className={s.lbl}>{t("profileTodoSub")}</div></div>
              <a className={`btn ${s.btn}`} href={`${consoleHref(event.eventId, "people")}&incomplete=1`}>{t("seeList")}</a>
            </div>
          ) : null}
        </>
      ) : null}
    </>
  );
}

/** 定型のお知らせの確認（b12 #408）：先 preview 再 send；主办方不能写自由文本。 */
export function NoticeConfirm({ preview, t, busy, onCancel, onSend }: { preview: HostNoticePreview; t: HostT; busy: boolean; onCancel: () => void; onSend: () => void }) {
  const channels = preview.channels.map((channel) => (channel === "inbox" ? t("chInbox") : t("chEmail"))).join(t("chJoin"));
  const title = t("noticeTitle", { n: preview.recipients });
  return (
    <Modal open onClose={onCancel} title={title} size={480} header={<span className={`${s.emo} ${s.e_pink}`}>🙋</span>}>
      <div className={s.noticeTitle}>{title}</div>
      <div className={`${s.sub} ${s.noticeSub}`}>{t("noticeSub")}</div>
      <div className={s.noticeBox}><b>{preview.title}</b><div className={s.sub}>{preview.body}</div></div>
      <div className={`${s.lbl} ${s.noticeTo}`}>{t("noticeTo", { channels, n: preview.recipients })}</div>
      <div className={`${s.row} ${s.noticeActs}`}>
        <button type="button" className={`btn ${s.btn}`} onClick={onCancel}>{t("cancel")}</button>
        <button type="button" className={`btn ${s.btn} ${s.primary}`} disabled={busy || preview.remainingSends <= 0} onClick={onSend}>{t("noticeSend", { n: preview.recipients })}</button>
      </div>
    </Modal>
  );
}

export type HostConsoleViewProps = {
  data: HostOverviewResponse;
  tab: HostConsoleTab;
  language: OrbitLanguage;
  now?: Date;
  busy?: boolean;
  onPublish?: () => void;
  onArchive?: (archived: boolean) => void;
};

/** 純粋な描画：页头 + 页签 + 当前页签内容。 */
export function HostConsoleView({ data, tab, language, now = new Date(), busy = false, onPublish, onArchive }: HostConsoleViewProps) {
  const t = useMemo(() => hostTranslator(language), [language]);
  const event = data.event;
  // 页签画法两套画板不一致：web.html #20（概要 · 進行中）是 .seg 胶囊；b6 其余页签与 b12 #440–#444（下書き / 中止 / アーカイブ）是 .htabs 下划线。
  // 照各自画板实现，已报 design-decisions 统一（见 R17-web-progress.md）。
  const underline = tab !== "overview" || INACTIVE.has(event.status);
  const back = <a className={`btn ${s.btn} ${s.backBtn}`} href="/app/events/center" aria-label={t("back")}><Icon name="left" size={20} /></a>;
  const right = (
    <div className={s.headRight}>
      <div className={s.avs}>{event.cohosts.slice(0, 3).map((person, index) => <div key={person.actorId} className={`${s.av} ${s[AVATAR_TONES[index % AVATAR_TONES.length]!]}`} title={person.name}>{person.initial}</div>)}</div>
      <a className={`btn ${s.btn}`} href={`${consoleHref(event.eventId, tab)}&drawer=cohosts`}><Icon name="users" size={16} />{t("cohostsBtn")}</a>
    </div>
  );
  return (
    <>
      <ShellPage title={event.title} subtitle={consoleSubtitle(event, language, t, now)} left={back} right={right} rightRail={false} />
      {underline ? (
        <div className={s.htabs} role="tablist" data-host-tabs="underline">
          {HOST_CONSOLE_TABS.map((key) => {
            const href = key === "checkin" ? checkInHref(event.eventId) : consoleHref(event.eventId, key);
            return <a key={key} role="tab" aria-selected={tab === key} className={`${s.htab} ${tab === key ? s.htabOn : ""}`} href={href}>{t(TAB_LABEL[key])}{key === "people" && data.pendingReview > 0 ? <span className={s.cntB}>{data.pendingReview}</span> : null}</a>;
          })}
        </div>
      ) : (
        <div className={`${s.seg} ${s.tabs}`} role="tablist" data-host-tabs="seg">
          {HOST_CONSOLE_TABS.map((key) => {
            const href = key === "checkin" ? checkInHref(event.eventId) : consoleHref(event.eventId, key);
            const label = key === "people" ? `${t(TAB_LABEL[key])} ${data.pendingReview}` : t(TAB_LABEL[key]);
            return <a key={key} role="tab" aria-selected={tab === key} className={`btn ${s.segBtn} ${tab === key ? s.segOn : ""}`} href={href}>{label}</a>;
          })}
        </div>
      )}
      <div className={s.wgrid} data-host-console={tab}>
        <StatusBanner event={event} t={t} busy={busy} onPublish={() => onPublish?.()} onArchive={(archived) => onArchive?.(archived)} />
        {tab === "overview" ? <HostOverviewView data={data} t={t} /> : <HostTabPlaceholder tab={tab} t={t} />}
      </div>
    </>
  );
}

function failureText(reason: HostApiFailure, t: HostT): string {
  if (reason === "forbidden") return t("noAccess");
  if (reason === "not_found") return t("notFound");
  return t("loadError");
}

function ConsoleInner({ eventId, language }: { eventId: string; language: OrbitLanguage }) {
  const t = useMemo(() => hostTranslator(language), [language]);
  const toast = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const tab = parseConsoleTab(params.get("tab"));
  const [data, setData] = useState<HostOverviewResponse | null>(null);
  const [failure, setFailure] = useState<HostApiFailure | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<HostNoticePreview | null>(null);

  const load = useCallback(async () => {
    const res = await hostApi.overview(eventId);
    if (res.ok) { setData(res.data); setFailure(null); } else setFailure(failureOf(res));
  }, [eventId]);
  useEffect(() => { void load(); }, [load]);

  // ?notice=profile_incomplete（運営センターの「対応が必要なこと」から）：先取预览再弹确认。
  const noticeParam = params.get("notice");
  useEffect(() => {
    if (noticeParam !== "profile_incomplete") return;
    void hostApi.noticePreview(eventId, "profile_incomplete").then((res) => { if (res.ok) setNotice(res.data); });
  }, [eventId, noticeParam]);
  const closeNotice = () => {
    setNotice(null);
    if (noticeParam) {
      const search = new URLSearchParams(params.toString());
      search.delete("notice");
      router.replace(`?${search.toString()}`, { scroll: false });
    }
  };
  const sendNotice = async () => {
    if (!notice) return;
    setBusy(true);
    const res = await hostApi.noticeSend(eventId, notice.kind);
    setBusy(false);
    if (!res.ok) { toast.error(failureOf(res) === "conflict" || failureOf(res) === "rate_limited" ? t("noticeLimit") : t("saveError")); return; }
    toast.success(t("noticeSent", { n: res.data.queued }));
    closeNotice();
  };

  const write = async (run: () => ReturnType<typeof hostApi.publish>, done: string) => {
    setBusy(true);
    const res = await run();
    setBusy(false);
    if (!res.ok) { toast.error(failureOf(res) === "conflict" ? t("conflictError") : t("saveError")); return; }
    toast.success(done);
    await load();
  };

  const back = <a className={`btn ${s.btn} ${s.backBtn}`} href="/app/events/center" aria-label={t("back")}><Icon name="left" size={20} /></a>;
  if (failure && !data) {
    return (
      <>
        <ShellPage title={t("centerTitle")} left={back} rightRail={false} />
        <div className={`${s.card} ${s.empty}`} data-host-failure={failure}>{failureText(failure, t)}{failure !== "forbidden" && failure !== "not_found" ? <> <button type="button" className={`btn ${s.btn} ${s.sm}`} onClick={() => void load()}>{t("retry")}</button></> : <> <a className={`btn ${s.btn} ${s.sm}`} href="/app/events/center">{t("back")}</a></>}</div>
      </>
    );
  }
  if (!data) return <ShellPage title={t("centerTitle")} left={back} rightRail={false} />;
  return (
    <>
      <HostConsoleView data={data} tab={tab} language={language} busy={busy}
        onPublish={() => void write(() => hostApi.publish(eventId, data.event.version), t("publishedToast"))}
        onArchive={(archived) => void write(() => hostApi.archive(eventId, data.event.version, archived), archived ? t("archivedToast") : t("unarchivedToast"))} />
      {notice ? <NoticeConfirm preview={notice} t={t} busy={busy} onCancel={closeNotice} onSend={() => void sendNotice()} /> : null}
    </>
  );
}

export function HostConsole({ eventId, language }: { eventId: string; language: OrbitLanguage }) {
  return (
    <Orbit2026Scope language={language} className={s.page}>
      <ToastProvider>
        <ConsoleInner eventId={eventId} language={language} />
      </ToastProvider>
    </Orbit2026Scope>
  );
}
