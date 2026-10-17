"use client";

// R17 イベント運営（Web 1440：web.html #20 概要 · 開場前；b12 #408 定型のお知らせ確認、#440 / #442 / #444 下書き · 中止 · アーカイブ 横幅）。
// 页头：活动名 +「主催 · 本日 19:00 · 渋谷ストリーム」+ 共同运营者头像 +「共同運営者」（&drawer=cohosts）+「⋯」菜单（决定表 §44，b12 #480 / #481：
// 基本情報を編集 / 参加コードを再発行 / 申込ページを開く / ― / イベントを中止（珊瑚色，仅 event.cancel = owner）；所有页签同一位置）。
// 页签：概要 / マッチング / 参加者 N / 受付（跳 kiosk）/ 申込設定 / レポート；本段只做概要，其余是占位（HostConsoleTabs.tsx，后续替换）。
// 数据：GET /api/host/events/[id]/overview（requireEventCapability 在服务端）；定型通知 /notices/preview → /notices/send。
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type MouseEvent, type ReactNode } from "react";

import type { HostOverviewResponse, HostProgressStep } from "../../../../../shared/contract/host-console";
import type { HostEventView } from "../../../../../shared/contract/host-events";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import type { HostNoticePreview } from "../../../../../shared/contract/host-notices";
import { ShellPage } from "../shell/slots";
import { ConfirmDialog, Icon, Modal, Orbit2026Scope, ToastProvider, useToast } from "../ui";
import { failureOf, hostApi, hostEventApi, type HostApiFailure, type HostApiResult } from "./host-api";
import { CancelEventConfirm, PublishEventConfirm } from "./HostEventForm";
import { HOST_CONSOLE_TABS, HostTabContent, HostTabPlaceholder, parseConsoleTab, type HostConsoleTab } from "./HostConsoleTabs";
import { HostCohostsDrawer } from "./HostCohosts";
import { checkInHref, consoleHref, hostDateLong, hostDateShort, hostTime, hostTranslator, sameTokyoDay, type HostT } from "./host-model";
import s from "./host.module.css";

const id = (value: string) => encodeURIComponent(value);
const AVATAR_TONES = ["a_c4", "a_c2", "a_c1", "a_c3", "a_c5"] as const;
const STEPS: readonly HostProgressStep[] = ["registration", "generation", "review_groups", "publish", "check_in"];
const STEP_LABEL = { check_in: "pCheckIn", generation: "pGeneration", publish: "pPublish", registration: "pRegistration", review_groups: "pReview" } as const;
const INACTIVE = new Set(["draft", "cancelled", "archived"]);
const TAB_LABEL = { checkin: "tCheckIn", matching: "tMatching", overview: "tOverview", people: "tPeople", report: "tReport", setup: "tSetup" } as const;

/** 「主催 · 本日 19:00 · 渋谷ストリーム」；下書き / 中止 / アーカイブ は会場の代わりに状態（b12 #440–#444）。
 *  申込設定は「主催 · 申込フォーム公開中 / 未公開」（b6 #13–#15），レポートは「主催 · 9月9日（水）19:00 · 終了 / 開催前」（b6 #16–#19）。 */
export function consoleSubtitle(event: HostEventView, language: OrbitLanguage, t: HostT, now: Date, tab: HostConsoleTab = "overview", formPublished: boolean | null = null): string {
  if (tab === "setup" && formPublished != null) return [t("roleHost"), t(formPublished ? "subFormPublished" : "subFormDraft")].join(" · ");
  const inactive = event.status === "draft" ? t("sDraft") : event.status === "cancelled" ? t("sCancelled") : event.status === "archived" ? t("sArchived") : null;
  if (tab === "report") {
    const phase = inactive ?? (event.status === "ended" ? t("fEnded") : event.status === "live" ? t("fLive") : t("fUpcoming"));
    return [t("roleHost"), hostDateLong(event.startsAt, language, t), phase].filter(Boolean).join(" · ");
  }
  const when = event.startsAt ? (sameTokyoDay(event.startsAt, now) ? `${t("today")} ${hostTime(event.startsAt)}` : hostDateLong(event.startsAt, language, t)) : "";
  const tail = inactive ?? event.venueName;
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

export type HostMenuAction = "reissue" | "cancel" | "archive";
export type HostMenuItems = { edit: boolean; reissue: boolean; openPage: boolean; cancel: boolean; archive: boolean };

/** 页头「⋯」菜单里出现哪些项（b12 #480）。中止只给有 `event.cancel` 的人（= owner）；
 *  已结束的活动多一项「アーカイブする」（原来在申込設定折叠区，§44 后统一进菜单）。 */
export function hostMenuItems(event: HostEventView): HostMenuItems {
  const open = event.status === "upcoming" || event.status === "live";
  const canEdit = event.myRole === "owner" || event.myRole === "manager" || event.capabilities.includes("event.edit");
  return {
    edit: canEdit && event.status !== "cancelled" && event.status !== "archived",
    reissue: canEdit && open && Boolean(event.participationCode),
    openPage: Boolean(event.publicSlug) && (open || event.status === "ended"),
    cancel: open && event.capabilities.includes("event.cancel"),
    archive: canEdit && event.status === "ended",
  };
}

/** 页头右端「⋯」（.rbtn.k-hmore）+ 下拉（.dmenu.k-hmenu）。点外面 / Esc 关。 */
export function HostMoreMenu({ event, t, defaultOpen = false, onAction }: { event: HostEventView; t: HostT; defaultOpen?: boolean; onAction?: (action: HostMenuAction) => void }) {
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => {
    if (!open) return;
    const close = (ev: globalThis.MouseEvent | KeyboardEvent) => {
      if (ev instanceof KeyboardEvent ? ev.key === "Escape" : !(ev.target as HTMLElement | null)?.closest("[data-host-menu],[data-host-more]")) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);
  const items = hostMenuItems(event);
  if (!items.edit && !items.reissue && !items.openPage && !items.cancel && !items.archive) return null;
  const pick = (action: HostMenuAction) => { setOpen(false); onAction?.(action); };
  return (
    <span className={s.moreWrap} data-host-more-wrap="">
      <button type="button" className={`btn ${s.moreBtn} ${open ? s.moreOn : ""}`} aria-label={t("hmMore")} aria-haspopup="menu" aria-expanded={open} data-host-more="" onClick={() => setOpen((value) => !value)}><Icon name="more" size={20} /></button>
      {open ? (
        <div className={s.dmenu} role="menu" data-host-menu="">
          {items.edit ? <a role="menuitem" className={`btn ${s.mi}`} href={`/app/events/${id(event.eventId)}/edit`} data-host-menu-item="edit"><Icon name="pen" size={16} /><span>{t("hmEdit")}</span></a> : null}
          {items.reissue ? <button type="button" role="menuitem" className={`btn ${s.mi}`} onClick={() => pick("reissue")} data-host-menu-item="reissue"><Icon name="refresh" size={16} /><span>{t("hmReissue")}</span></button> : null}
          {items.openPage ? <a role="menuitem" className={`btn ${s.mi}`} href={`/e/${id(event.publicSlug!)}`} target="_blank" rel="noopener" onClick={() => setOpen(false)} data-host-menu-item="open"><Icon name="link" size={16} /><span>{t("hmOpenPage")}</span></a> : null}
          {items.archive ? <button type="button" role="menuitem" className={`btn ${s.mi}`} onClick={() => pick("archive")} data-host-menu-item="archive"><Icon name="archive" size={16} /><span>{t("hmArchive")}</span></button> : null}
          {items.cancel ? (
            <>
              <div className={s.miSep} role="separator" />
              <button type="button" role="menuitem" className={`btn ${s.mi} ${s.miDanger}`} onClick={() => pick("cancel")} data-host-menu-item="cancel" data-tone="coral"><Icon name="x" size={16} /><span>{t("hmCancel")}</span></button>
            </>
          ) : null}
        </div>
      ) : null}
    </span>
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
  /** 概要以外の页签内容（容器在 HostConsoleTabs）；不传 = 占位。 */
  content?: ReactNode;
  onOpenCohosts?: (event: MouseEvent<HTMLAnchorElement>) => void;
  /** 申込設定の公開状態（页头副标题；读到 /setup 之前 null）。 */
  formPublished?: boolean | null;
  /** レポートの 全体 / 自分の視点（页头右侧的 seg，b6 #16–#19）。 */
  reportView?: "all" | "mine";
  onReportView?: (view: "all" | "mine") => void;
  /** 页头「⋯」菜单的写操作（再発行 / 中止 / アーカイブ）。 */
  onMenu?: (action: HostMenuAction) => void;
  /** 渲染测试用：菜单初始展开。 */
  menuOpen?: boolean;
};

/** 純粋な描画：页头 + 页签 + 当前页签内容。 */
export function HostConsoleView({ data, tab, language, now = new Date(), busy = false, onPublish, onArchive, content, onOpenCohosts, formPublished = null, reportView = "all", onReportView, onMenu, menuOpen = false }: HostConsoleViewProps) {
  const t = useMemo(() => hostTranslator(language), [language]);
  const event = data.event;
  // 页签一律下划线（.htabs；决定表 §41-1 统一了 web.html #20）。参加者角标 = 审核待人数，在参加者页签本身不显示（b6 #7–#9）。
  const back = <a className={`btn ${s.btn} ${s.backBtn}`} href="/app/events/center" aria-label={t("back")}><Icon name="left" size={20} /></a>;
  const right = (
    <div className={s.headRight}>
      <div className={s.avs}>{event.cohosts.slice(0, 3).map((person, index) => <div key={person.actorId} className={`${s.av} ${s[AVATAR_TONES[index % AVATAR_TONES.length]!]}`} title={person.name}>{person.initial}</div>)}</div>
      <a className={`btn ${s.btn}`} href={`${consoleHref(event.eventId, tab)}&drawer=cohosts`} onClick={onOpenCohosts} data-host-cohosts-open=""><Icon name="users" size={16} />{t("cohostsBtn")}</a>
      {tab === "report" ? (
        <div className={s.seg} role="tablist" aria-label={t("rpViews")} data-host-report-views="">
          {(["all", "mine"] as const).map((view) => (
            <a key={view} role="tab" aria-selected={reportView === view} className={`btn ${s.segBtn} ${reportView === view ? s.segOn : ""}`}
              href={`${consoleHref(event.eventId, "report")}${view === "mine" ? "&view=mine" : ""}`}
              onClick={onReportView ? (click) => { click.preventDefault(); onReportView(view); } : undefined}>{t(view === "all" ? "rpAll" : "rpMine")}</a>
          ))}
        </div>
      ) : null}
      <HostMoreMenu event={event} t={t} defaultOpen={menuOpen} onAction={onMenu} />
    </div>
  );
  return (
    <>
      <ShellPage title={event.title} subtitle={consoleSubtitle(event, language, t, now, tab, formPublished)} left={back} right={right} rightRail={false} />
      <div className={s.htabs} role="tablist" data-host-tabs="underline">
        {HOST_CONSOLE_TABS.map((key) => {
          const href = key === "checkin" ? checkInHref(event.eventId) : consoleHref(event.eventId, key);
          const badge = key === "people" && tab !== "people" && data.pendingReview > 0;
          return <a key={key} role="tab" aria-selected={tab === key} className={`${s.htab} ${tab === key ? s.htabOn : ""}`} href={href}>{t(TAB_LABEL[key])}{badge ? <span className={s.cntB}>{data.pendingReview}</span> : null}</a>;
        })}
      </div>
      <div className={s.wgrid} data-host-console={tab}>
        <StatusBanner event={event} t={t} busy={busy} onPublish={() => onPublish?.()} onArchive={(archived) => onArchive?.(archived)} />
        {tab === "overview" ? <HostOverviewView data={data} t={t} /> : content ?? <HostTabPlaceholder tab={tab} t={t} />}
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
  const drawer = params.get("drawer") === "cohosts";
  const setDrawer = (open: boolean) => {
    const search = new URLSearchParams(params.toString());
    if (open) search.set("drawer", "cohosts"); else search.delete("drawer");
    if (!search.get("tab")) search.set("tab", tab);
    router.replace(`?${search.toString()}`, { scroll: false });
  };
  const [data, setData] = useState<HostOverviewResponse | null>(null);
  const [failure, setFailure] = useState<HostApiFailure | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<HostNoticePreview | null>(null);
  // 下書きバナー「公開する」→ 公開確認（b12 #400）。
  const [publishConfirm, setPublishConfirm] = useState(false);
  const [formPublished, setFormPublished] = useState<boolean | null>(null);
  // 页头「⋯」：参加コード再発行 / 中止（b12 #402 确认框）/ アーカイブ。
  const [manage, setManage] = useState<HostMenuAction | null>(null);
  const reportView = params.get("view") === "mine" ? "mine" : "all";
  const setReportView = (view: "all" | "mine") => {
    const search = new URLSearchParams(params.toString());
    search.set("tab", "report");
    if (view === "mine") search.set("view", "mine"); else search.delete("view");
    router.replace(`?${search.toString()}`, { scroll: false });
  };

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

  const runManage = async (task: () => Promise<HostApiResult<{ event: HostEventView; notified: number }>>, done: (next: HostEventView, notified: number) => string) => {
    setBusy(true);
    const res = await task();
    setBusy(false);
    setManage(null);
    if (!res.ok) { const reason = failureOf(res); toast.error(reason === "conflict" ? t("conflictError") : reason === "sample" ? t("evSample") : t("saveError")); return; }
    toast.success(done(res.data.event, res.data.notified));
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
        onPublish={() => setPublishConfirm(true)}
        onArchive={(archived) => void write(() => hostApi.archive(eventId, data.event.version, archived), archived ? t("archivedToast") : t("unarchivedToast"))}
        formPublished={formPublished} reportView={reportView} onReportView={setReportView}
        content={tab === "overview" ? undefined : <HostTabContent tab={tab} eventId={eventId} language={language} incomplete={params.get("incomplete") === "1"} importing={params.get("import") === "1"} reportView={reportView} onChanged={() => void load()} onSetupHeader={setFormPublished} />}
        onOpenCohosts={(event) => { event.preventDefault(); setDrawer(true); }} onMenu={setManage} />
      {manage === "cancel" ? <CancelEventConfirm event={data.event} t={t} busy={busy} onKeep={() => setManage(null)} onCancelEvent={(note) => void runManage(() => hostEventApi.cancel(eventId, data.event.version, note), (_next, n) => t("cfCancelled", { n }))} /> : null}
      <ConfirmDialog open={manage === "reissue"} title={t("cfReissueTitle")} message={t("cfReissueSub", { code: data.event.participationCode ?? "" })} confirmLabel={t("cfReissue")} cancelLabel={t("cancel")} icon="ticket"
        onCancel={() => setManage(null)} onConfirm={() => void runManage(() => hostEventApi.reissueCode(eventId, data.event.version), (next) => t("cfReissued", { code: next.participationCode ?? "" }))} />
      <ConfirmDialog open={manage === "archive"} title={t("cfArchiveTitle")} message={t("cfArchiveSub")} confirmLabel={t("archive")} cancelLabel={t("cancel")}
        onCancel={() => setManage(null)} onConfirm={() => void runManage(() => hostEventApi.archive(eventId, data.event.version, true), () => t("archivedToast"))} />
      {drawer ? <HostCohostsDrawer eventId={eventId} language={language} onClose={() => setDrawer(false)} onChanged={() => void load()} /> : null}
      {publishConfirm ? <PublishEventConfirm event={data.event} t={t} language={language} busy={busy} onCancel={() => setPublishConfirm(false)} onPublish={() => { setPublishConfirm(false); void write(() => hostApi.publish(eventId, data.event.version), t("publishedToast")); }} /> : null}
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
