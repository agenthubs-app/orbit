"use client";

// 2026-11-20 参加者の詳細（event-web-revisit-cover-width-proposal：详情页参加者卡 / 会場の記録 任何人名 / 会後「今日会った人」共用）。
// 数据：GET /api/events/[id]/attendees/[attendeeId]（报名者之间、对方公开了参加用プロフィール才有，否则 404）。
// 分区顺序：头部 → このイベントでの接点（同桌轮次 + おすすめ理由「?」）→ 自己紹介 + 公开问答 → 交换 → メモ（自分だけ，次要，最后）。
// 交换：canRequestExchange → 「交換を申請」+ 期限一行；exchanged → 「交換済み · 人脈で開く」；incoming → 承認 / 無視（同会場）。
// ≥1280 放在右栏（DetailRail 的位置），< 1280 放进抽屉（同一个组件，抽屉用 bare，标题行和 ✕ 由这里画）。
import { useEffect, useState, type ReactNode } from "react";

import type { EventAttendeeProfile } from "../../../../../shared/contract/event-attendee-profile";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { FRESH } from "../../orbit-last-answer";
import { Bone, Drawer, Icon, RetryCard, useToast } from "../ui";
import { translator as assessTranslator } from "./AssessmentDetail";
import type { JourneyT } from "./DiscoverTab";
import { journeyApi } from "./journey-api";
import { useJourneyAnswer } from "./use-journey-answer";
import styles from "./events.module.css";
import d from "./discover.module.css";
import x from "./detail.module.css";
import r from "./record.module.css";

/** 列表里已知的这个人（先画头部，详情读回来前不空白）。 */
export type AttendeeSeed = { attendeeId: string; name: string; initial: string; org?: string | null; role?: string | null };

type SpeechLike = { lang: string; onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; start: () => void };

/** 「4/21」：东京日期（exchangeUntil 是 UTC ISO）。 */
export function tokyoMonthDay(iso: string | null | undefined): string {
  const time = iso ? Date.parse(iso) : Number.NaN;
  if (!Number.isFinite(time)) return "";
  const t = new Date(time + 9 * 3_600_000);
  return `${t.getUTCMonth() + 1}/${t.getUTCDate()}`;
}

/** 底部交换区该画什么（纯函数，便于测试）。 */
export function exchangeView(profile: Pick<EventAttendeeProfile, "exchange" | "canRequestExchange" | "contactId" | "requestId" | "requestRevision">): "exchanged" | "incoming" | "requested" | "request" | "none" {
  if (profile.exchange === "exchanged") return "exchanged";
  if (profile.exchange === "incoming" && profile.requestId && profile.requestRevision != null) return "incoming";
  if (profile.exchange === "requested") return "requested";
  return profile.canRequestExchange ? "request" : "none";
}

/** 只给「参加者の詳細」用的打开 / 关闭状态（右栏或抽屉都用它）。 */
export function usePersonDetail() {
  const [person, setPerson] = useState<AttendeeSeed | null>(null);
  return { close: () => setPerson(null), open: (seed: AttendeeSeed) => setPerson(seed), person, selectedId: person?.attendeeId ?? null };
}

export function AttendeeProfilePanel({ eventId, seed, language, t, onClose, tone }: { eventId: string; seed: AttendeeSeed; language: OrbitLanguage; t: JourneyT; onClose: () => void; tone?: string }) {
  const toast = useToast();
  const at = assessTranslator(language);
  // 2026-11-21：上次的结果先画、新鲜期内不重读、同一人的请求共享（useJourneyAnswer）；没读到前画骨架。
  // 「未公開」只在 404（不是报名者 / 没有公开回答）时显示；其他失败给重试，不再一律说未公开。
  const answer = useJourneyAnswer(`events:attendee:${eventId}:${seed.attendeeId}`, () => journeyApi.attendee(eventId, seed.attendeeId), FRESH.list);
  const profile = answer.data;
  const setProfile = answer.update;
  const hidden = !profile && answer.failure === "not_found";
  const failed = !profile && answer.failure !== null && answer.failure !== "not_found";
  const loading = !profile && answer.failure === null;
  const [memo, setMemo] = useState(profile?.memo ?? "");
  const [why, setWhy] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setMemo(profile?.memo ?? ""); }, [profile?.memo]);

  const saveMemo = async () => {
    if (!profile || memo.trim() === (profile.memo ?? "")) return;
    const res = await journeyApi.memo(eventId, profile.attendeeId, memo);
    if (!res.ok) { toast.error(at("genericError")); return; }
    setProfile({ ...profile, memo: memo.trim() || null });
    toast.success(t("memoSaved"));
  };
  const dictate = () => {
    const w = window as unknown as { SpeechRecognition?: new () => SpeechLike; webkitSpeechRecognition?: new () => SpeechLike };
    const Speech = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Speech) { void saveMemo(); return; }
    const recognition = new Speech();
    recognition.lang = language === "zh" ? "zh-CN" : language === "en" ? "en-US" : "ja-JP";
    recognition.onresult = (ev) => setMemo((value) => `${value}${ev.results[0]?.[0]?.transcript ?? ""}`);
    recognition.start();
  };
  const request = async () => {
    if (!profile || busy) return;
    setBusy(true);
    const res = await journeyApi.requestExchange(eventId, profile.participantId);
    setBusy(false);
    if (!res.ok) { toast.error(at("genericError")); return; }
    setProfile({ ...profile, exchange: "requested", canRequestExchange: false });
    toast.success(t("swapRequested"));
  };
  const respond = async (accept: boolean) => {
    if (!profile?.requestId || profile.requestRevision == null || busy) return;
    setBusy(true);
    const res = await journeyApi.respondExchange(eventId, profile.requestId, profile.requestRevision, accept);
    setBusy(false);
    if (!res.ok) { toast.error(at("genericError")); return; }
    if (accept) {
      // 承認后服务端建了联系人：重读一次拿 contactId（「人脈で開く」）。
      const fresh = await journeyApi.attendee(eventId, profile.attendeeId);
      setProfile(fresh.ok ? fresh.data : { ...profile, exchange: "exchanged" });
      toast.success(t("swapped"));
    } else setProfile({ ...profile, exchange: "none", requestId: null, requestRevision: null });
  };

  const head = profile ?? seed;
  const sub = [head.org, head.role].filter(Boolean).join(" · ");
  const together = profile?.together;
  const hasTogether = Boolean(together && (together.sharedRounds.length || together.recommended));
  const view = profile ? exchangeView(profile) : "none";
  let foot: ReactNode = null;
  if (profile && view === "exchanged") {
    foot = (
      <div className={`${styles.card} ${r.pcard} ${r.row}`} data-person-exchanged="">
        <span className={`${styles.chip} ${styles.c_teal}`}>{t("exExchanged")}</span>
        {profile.contactId ? <a className={r.openContact} href={`/app/contacts/${encodeURIComponent(profile.contactId)}`}>{t("openInContacts")}<span aria-hidden> ›</span></a> : null}
      </div>
    );
  } else if (profile && view === "incoming") {
    foot = (
      <div className={`${styles.card} ${r.pcard}`} data-person-incoming="">
        <b className={r.cardTitle}>{t("incomingTitle")}</b>
        <div className={`${styles.row} ${r.acts}`}>
          <button type="button" className={`btn ${styles.btn} ${styles.sm} ${styles.primary} ${r.grow}`} disabled={busy} onClick={() => void respond(true)}>{t("acceptSwap")}</button>
          <button type="button" className={`btn ${styles.btn} ${styles.sm} ${r.grow}`} disabled={busy} onClick={() => void respond(false)}>{t("ignoreSwap")}</button>
        </div>
      </div>
    );
  } else if (profile && view === "requested") {
    foot = <div className={`${styles.card} ${r.pcard} ${r.row}`} data-person-requested=""><span className={styles.chip}>{t("exRequested")}</span></div>;
  } else if (profile && view === "request") {
    foot = (
      <div className={r.xchg} data-person-request="">
        <button type="button" className={`btn ${styles.btn} ${styles.primary} ${r.full}`} disabled={busy} onClick={() => void request()}><Icon name="link" size={16} />{t("requestExchange")}</button>
        {profile.exchangeUntil ? <div className={`${styles.lbl} ${r.center}`}>{t("exchangeUntil", { date: tokyoMonthDay(profile.exchangeUntil) })}</div> : null}
      </div>
    );
  } else if (profile?.exchangeClosedReason) {
    foot = <div className={`${styles.lbl} ${r.center}`} data-person-closed={profile.exchangeClosedReason}>{t(profile.exchangeClosedReason === "not_started" ? "exchangeNotStarted" : "exchangeEnded")}</div>;
  }

  return (
    <div className={`${styles.rail} ${d.rail} ${r.panel}`} data-person-detail={seed.attendeeId}>
      <div className={r.head}>
        <h4 className={`${styles.railH} ${d.railH}`}><Icon name="user" size={16} />{t("detailTitle")}</h4>
        <button type="button" className={`btn ${r.close}`} aria-label={t("closeDetail")} onClick={onClose} data-person-close=""><Icon name="x" size={16} /></button>
      </div>
      <div className={r.ph}>
        <div className={`${x.av} ${tone ?? x.c1} ${r.avLg}`}>{head.initial}</div>
        <div className={r.grow}><b className={r.name}>{head.name}</b>{sub ? <div className={styles.lbl}>{sub}</div> : null}</div>
      </div>
      {hidden ? <div className={`${styles.card} ${r.pcard} ${styles.lbl}`} data-person-hidden="">{t("profileHidden")}</div> : null}
      {failed ? <RetryCard title={at("genericError")} onRetry={() => void answer.reload()} /> : null}
      {loading ? (
        <div className={r.skel} aria-busy data-person-loading="">
          <div className={`${styles.card} ${r.pcard}`}><Bone width={72} height={11} /><Bone width="78%" height={22} /></div>
          <div className={`${styles.card} ${r.pcard}`}><Bone width={64} height={11} /><Bone width="100%" height={13} /><Bone width="86%" height={13} /><Bone width="60%" height={13} /></div>
          <div className={`${styles.card} ${r.pcard}`}><Bone width={56} height={11} /><Bone width="100%" height={36} /></div>
        </div>
      ) : null}
      {profile && hasTogether ? (
        <div className={`${styles.card} ${r.pcard}`} data-person-together="">
          <div className={`${styles.lbl} ${r.cardLbl}`}>{t("togetherTitle")}</div>
          <div className={r.tog}>
            {together!.sharedRounds.map((round) => (
              <div key={`${round.round}-${round.table}`} className={r.togRow}><span className={`${styles.chip} ${styles.c_lav} ${r.chipIcon}`}><Icon name="pin" size={16} />{t("roundTable", { r: round.round, t: round.table })}</span><span className={styles.lbl}>{t("sameTable")}</span></div>
            ))}
            {together!.recommended ? (
              <>
                <div className={r.togRow}>
                  <span className={`${styles.chip} ${styles.c_teal}`}>{t("recChip")}</span>
                  {together!.why ? <span className={r.togWhy}>{together!.why}</span> : <span className={r.grow} />}
                  {together!.whyDetail ? <button type="button" className={`btn ${d.why}`} aria-expanded={why} aria-label={t("whyLabel")} onClick={() => setWhy((value) => !value)}>?</button> : null}
                </div>
                {why && together!.whyDetail ? <div className={d.whyBody}>{together!.whyDetail}</div> : null}
              </>
            ) : null}
          </div>
        </div>
      ) : null}
      {profile && (profile.intro || profile.answers.length) ? (
        <div className={`${styles.card} ${r.pcard}`} data-person-intro="">
          <div className={`${styles.lbl} ${r.cardLbl}`}>{t("introTitle")}</div>
          {profile.intro ? <div className={`${styles.sub} ${r.intro}`}>{profile.intro}</div> : null}
          {profile.answers.length ? (
            <div className={r.qas}>{profile.answers.map((item, index) => <div key={`${index}-${item.q}`} className={r.qa}><span className={styles.lbl}>{item.q}</span><span>{item.a}</span></div>)}</div>
          ) : null}
        </div>
      ) : null}
      {foot}
      {/* 2026-11-21 用户定：交换（加好友）在前，メモ是次要入口，放最后。 */}
      {profile ? (
        <div className={`${styles.card} ${r.pcard}`} data-person-memo="">
          <div className={`${styles.lbl} ${r.memoLbl}`}>{t("memoTitle")}</div>
          <div className={`${styles.row} ${r.memoRow}`}>
            <input className={`${r.input} ${r.memoInput}`} value={memo} maxLength={200} placeholder={t("memoPlaceholder")} aria-label={t("memoTitle")} onChange={(ev) => setMemo(ev.target.value)} onBlur={() => void saveMemo()} onKeyDown={(ev) => { if (ev.key === "Enter") void saveMemo(); }} />
            <button type="button" className={`btn ${d.lbtn}`} aria-label={t("voiceAnswer")} onClick={dictate}><Icon name="mic" size={16} /></button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * 右栏 / 抽屉二选一：`wide`（≥1280，有右栏）时返回给 ShellPage rightRail 的内容；否则返回抽屉（open 时）。
 * `fallbackRail`：没有选中人时右栏原本的内容。
 */
export function personRailOrDrawer({ eventId, person, close, language, t, wide, fallbackRail, tone }: { eventId: string; person: AttendeeSeed | null; close: () => void; language: OrbitLanguage; t: JourneyT; wide: boolean; fallbackRail: ReactNode | false; tone?: string }): { rail: ReactNode | false; drawer: ReactNode } {
  const panel = person ? <AttendeeProfilePanel key={person.attendeeId} eventId={eventId} seed={person} language={language} t={t} onClose={close} tone={tone} /> : null;
  if (wide) return { drawer: null, rail: panel ?? fallbackRail };
  return { drawer: person ? <Drawer open onClose={close} title={t("detailTitle")} size="sm" bare fullOnPhone>{panel}</Drawer> : null, rail: fallbackRail };
}
