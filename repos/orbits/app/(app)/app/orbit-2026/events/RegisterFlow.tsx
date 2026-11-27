"use client";

// R27 参加登録（Web 1440：b2 #23 ① 質問 + 実時間の参加用プロフィール；1024 / 390：b12 #354 / #356）。
// ② 確認 / ③ 申込完了：b12 #370 / #372（§30 补画，版式照 #23：左卡换内容、右侧参加用プロフィール常驻）。
// 数据：/api/events/[id]/join/*（问题 = 现有 AI 访谈 ≤5 问；资料规则实时更新，只有确认时才生成自己紹介草稿）。
import { introDraftOutcome, waitForIntroDraft } from "./intro-draft-wait";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { EventJoinAnswer, EventJoinCurrent, EventJoinProfile, EventJoinProfileItemKey, EventJoinQuestion, EventJoinResult, EventJoinStep } from "../../../../../shared/contract/event-join";
import type { EventOverviewResponse } from "../../../../../shared/contract/event-overview";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { ShellPage } from "../shell/slots";
import { Icon, Orbit2026Scope, RingChart, ToastProvider, useToast } from "../ui";
import { translator as assessTranslator } from "./AssessmentDetail";
import { journeyTranslator, type JourneyT } from "./DiscoverTab";
import { eventRange, monthDaySlash, parts, usePhone, useWide } from "./EventDetail";
import { eventsCall, newIdempotencyKey } from "./events-api";
import { journeyApi } from "./journey-api";
import { contactReviewLine, HostContactCard, HostContactModal } from "./HostContact";
import { hostContactHasId } from "../../../../../shared/compute/host-contact";
import { eventJoinCalendarRemoveResultSchema, eventJoinCancelResultSchema, eventJoinCurrentSchema, eventJoinProfileSchema, eventJoinResultSchema, eventJoinStepSchema, eventJoinTentativeResultSchema } from "../../../../../shared/api-schema/event-join";
import type { ZodType } from "zod";
import styles from "./events.module.css";
import d from "./discover.module.css";
import x from "./detail.module.css";
import r from "./register.module.css";

const id = (value: string) => encodeURIComponent(value);
// Every call carries the UI language in `x-orbit-lang` (as plan-api.ts), so questions, options and the drafted
// self-introduction follow the page language; the server also falls back to the orbit-lang cookie.
export function joinApiFor(language: OrbitLanguage) {
  const headers = { "x-orbit-lang": language };
  return {
    current: (eventId: string) => eventsCall(`/api/events/${id(eventId)}/join/current`, { headers }, eventJoinCurrentSchema as ZodType<EventJoinCurrent>),
    next: (eventId: string, answers: readonly EventJoinAnswer[], more = false, focus?: EventJoinProfileItemKey) => eventsCall(`/api/events/${id(eventId)}/join/next`, { body: JSON.stringify({ answers, more, ...(focus ? { focus } : {}) }), headers, method: "POST" }, eventJoinStepSchema as ZodType<EventJoinStep>),
    profile: (eventId: string, answers: readonly EventJoinAnswer[], draft: boolean, edit = false) => eventsCall(`/api/events/${id(eventId)}/join/profile`, { body: JSON.stringify({ answers, draft, ...(edit ? { edit } : {}) }), headers, method: "POST" }, eventJoinProfileSchema as ZodType<EventJoinProfile>),
    submit: (eventId: string, answers: readonly EventJoinAnswer[], selfIntro?: string, edit = false) => eventsCall(`/api/events/${id(eventId)}/join/submit`, { body: JSON.stringify({ answers, idempotencyKey: newIdempotencyKey(), ...(edit ? { edit } : {}), ...(selfIntro ? { selfIntro } : {}) }), headers, method: "POST" }, eventJoinResultSchema as ZodType<EventJoinResult>),
    cancel: (eventId: string) => eventsCall(`/api/events/${id(eventId)}/join/cancel`, { body: JSON.stringify({ idempotencyKey: newIdempotencyKey() }), headers, method: "POST" }, eventJoinCancelResultSchema),
    tentative: (eventId: string) => eventsCall(`/api/events/${id(eventId)}/join/tentative`, { body: JSON.stringify({ idempotencyKey: newIdempotencyKey() }), headers, method: "POST" }, eventJoinTentativeResultSchema),
    removeCalendar: (eventId: string) => eventsCall(`/api/events/${id(eventId)}/join/tentative`, { headers, method: "DELETE" }, eventJoinCalendarRemoveResultSchema),
  };
}

const ITEM_LABEL: Record<EventJoinProfileItemKey, "itemCompany" | "itemPurpose" | "itemTopics" | "itemTarget" | "itemOffer"> = { company: "itemCompany", offer: "itemOffer", purpose: "itemPurpose", target: "itemTarget", topics: "itemTopics" };

/** 「渋谷ストリーム 4F ホール」→「渋谷」：画板与列表只写地名，取第一段开头的汉字。 */
function venueArea(venue: string | null | undefined): string {
  const head = (venue ?? "").trim().split(/\s+/)[0] ?? "";
  return head.match(/^\p{Script=Han}+(?=\p{Script=Katakana})/u)?.[0] ?? head;
}

type SpeechCtor = new () => { lang: string; interimResults: boolean; onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; start: () => void };
function speechRecognition(): SpeechCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** 「9月20日 14:32」 */
function dateTimeLong(iso: string, t: JourneyT): string {
  const p = parts(iso);
  return p ? t("dateTimeLong", { d: p.day, hm: p.hm, m: p.month }) : "";
}

const REFUSAL_KEY: Readonly<Record<string, "joinClosed" | "joinLocked" | "joinRejected" | "joinCancelled">> = { JOIN_CANCELLED: "joinCancelled", JOIN_CLOSED: "joinClosed", JOIN_LOCKED: "joinLocked", JOIN_REJECTED: "joinRejected" };
const refusalKey = (code: string | undefined) => (code ? REFUSAL_KEY[code] : undefined);

const ITEM_OF_FIELD: Readonly<Record<string, EventJoinProfileItemKey>> = { desiredOutcome: "purpose", experienceHighlight: "topics", targetAttendees: "target", valueOffered: "offer" };

type ProfileMode = "live" | "review" | "applied" | "readonly";

export function ProfileCard({ profile, t, mode, introPending = false }: { profile: EventJoinProfile | null; t: JourneyT; mode: ProfileMode; introPending?: boolean }) {
  const drafting = mode === "live";
  // 确认页上自我介绍还在写：只有介绍这一块显示加载，其余照常。
  const introWait = drafting || introPending;
  return (
    <div className={`${styles.card} ${styles.span5} ${r.persona}`} data-join-profile={mode}>
      <div className={styles.cardH}>
        <h3>{t("profileTitle")}</h3>
        {mode === "readonly" ? <span className={styles.chip}>{t("profileSubmitted")}</span>
          : mode === "applied"
          ? <span className={`${styles.chip} ${styles.c_teal}`}>{t("appliedEditable", { date: monthDaySlash(profile?.editableUntil) })}</span>
          : <span className={`${styles.chip} ${styles.c_lav}`}>{t("updatingLive")}</span>}
      </div>
      <div className={styles.row} style={{ gap: 16 }}>
        <div className={r.ring}>
          <RingChart size={92} stroke={9} segments={[{ color: "var(--plum-700)", value: Math.max(0, Math.min(1, (profile?.coverage ?? 0) / 100)) }]} label={`${profile?.coverage ?? 0}%`} />
          <div className={r.ringC}>
            <div className={`${styles.score} ${r.cov}`}>{profile?.coverage ?? 0}<small>%</small></div>
            <div className={`${styles.lbl} ${r.covLbl}`}>{t("coverage")}</div>
          </div>
        </div>
        <div className={r.items}>
          {(profile?.items ?? []).map((item) => (
            <div key={item.key} className={`${styles.row} ${r.item}`}>
              <span className={item.done ? r.ok : drafting ? r.todo : r.missing}>{item.done ? "✓" : drafting ? "○" : "△"}</span>
              <span className={item.done ? "" : styles.muted}>{t(ITEM_LABEL[item.key])}</span>
            </div>
          ))}
        </div>
      </div>
      <div className={`${styles.lbl} ${r.sectionLbl}`}>{t("topicsLbl")}</div>
      <div className={`${styles.chips} ${r.chips}`}>{(profile?.topics ?? []).map((topic) => <span key={topic} className={`${styles.chip} ${styles.c_lav}`}>{topic}</span>)}</div>
      {mode === "readonly" && !profile?.selfIntro ? null : <div className={`${styles.lbl} ${r.sectionLbl}`}>{t(introWait ? "introDraftLbl" : "introLbl")}</div>}
      {profile?.selfIntro && !introPending ? <div className={drafting ? `${styles.sub} ${r.intro}` : r.introSide}>{profile.selfIntro.text}</div> : introWait ? (
        <>
          <div className={r.shimmer} /><div className={r.shimmer} style={{ width: "85%" }} /><div className={r.shimmer} style={{ width: "60%" }} />
        </>
      ) : null}
      {drafting ? <div className={`${styles.lbl} ${r.foot}`}>{t("reviewBeforeSubmit")}</div> : null}
    </div>
  );
}

function RegisterInner({ eventId, language }: { eventId: string; language: OrbitLanguage }) {
  const t = useMemo(() => journeyTranslator(language), [language]);
  const at = useMemo(() => assessTranslator(language), [language]);
  const joinApi = useMemo(() => joinApiFor(language), [language]);
  const toast = useToast();
  const [event, setEvent] = useState<EventOverviewResponse | null>(null);
  const [answers, setAnswers] = useState<EventJoinAnswer[]>([]);
  const [step, setStep] = useState<EventJoinStep | null>(null);
  const [profile, setProfile] = useState<EventJoinProfile | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [free, setFree] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<EventJoinResult | null>(null);
  // 2026-11-27 报名成功后服务端已自动加入日历（result.calendar）；完成页只告知，可移除 / 再加。
  const [calendar, setCalendar] = useState<{ state: "added" | "removed" | "none"; title: string; final: boolean } | null>(null);
  const [intro, setIntro] = useState<string | null>(null);
  const introRef = useRef<string | null>(null);
  introRef.current = intro;
  const [draft, setDraft] = useState<"idle" | "running" | "ready" | "failed">("idle");
  const draftSeq = useRef(0);
  const [editingIntro, setEditingIntro] = useState(false);
  const [why, setWhy] = useState(false);
  // 主催者の連絡先：申込が通った直後、ID があれば自動で開く（閉じたあとは完了ページのカードに残る）。
  const [contactOpen, setContactOpen] = useState(false);
  const freeRef = useRef<HTMLInputElement | null>(null);
  const Speech = useMemo(() => speechRecognition(), []);
  // 1024：右栏收起（b12 #354 没有右栏）。
  const wide = useWide();
  const phone = usePhone();

  // What the profile already says is selected from the start (2026-11-25); it can be unselected like any option.
  const showStep = (next: EventJoinStep) => { setStep(next); setSelected([...(next.question?.prefill ?? [])]); };

  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // 先确定这一次是新报名还是改资料（null = 还没读到，什么都不能提交），之后不再变：报名成功后概要里的状态变了也不会把完成页写错。
  const [mode, setMode] = useState<"new" | "edit" | null>(null);
  const [blocked, setBlocked] = useState<"joinRejected" | "joinClosed" | "joinLocked" | null>(null);
  // 改资料：上次每一答的题（按字段），点哪一项就只改哪一项；queue = 还要答的（主办方新加的必答题等，或这次点的那一项）。
  const [asked, setAsked] = useState<Record<string, { item: EventJoinProfileItemKey | null; question: EventJoinQuestion }>>({});
  const [queue, setQueue] = useState<readonly EventJoinQuestion[]>([]);
  const editing = mode === "edit";
  // 用户自己点开的那一题可以返回确认页（不答 = 保留原回答）；补问的必答题没有返回。
  const [optional, setOptional] = useState(false);
  // 有没保存的修改：离开整页时浏览器确认（同 HostSetup）。
  const [dirty, setDirty] = useState(false);
  const showEditQuestions = (list: readonly EventJoinQuestion[], given: readonly EventJoinAnswer[]) => {
    const [first, ...rest] = list;
    setQueue(rest);
    if (!first) { setOptional(false); setStep({ done: true, index: 1, question: null, remainingMinutes: 0, total: 1 }); setSelected([]); setFree(""); return; }
    showStep({ done: false, index: 1, question: first, remainingMinutes: 0, total: 1 });
    setFree(first.options.length ? "" : given.find((item) => item.field === first.field)?.answer ?? "");
  };
  useEffect(() => {
    let live = true;
    setLoadFailed(false);
    setMode(null);
    void journeyApi.overview(eventId).then((res) => { if (live && res.ok) setEvent(res.data); });
    void joinApi.current(eventId).then(async (current) => {
      if (!live) return;
      if (!current.ok) { setLoadFailed(true); return; }
      if (current.data.blocked) {
        setBlocked(REFUSAL_KEY[current.data.blocked] as "joinRejected" | "joinClosed" | "joinLocked");
        // 报过名的人：右栏只读显示已提交的资料；没有报名就不画空卡。
        const given = current.data.answers.map(({ answer, field, prompt, questionToken }) => ({ answer, field, prompt, questionToken }));
        if (!given.length) return;
        setIntro(current.data.selfIntro ?? "");
        const read = await joinApi.profile(eventId, given, false, true);
        if (live && read.ok) setProfile(read.data);
        return;
      }
      const edit = ["registered", "pending_review", "waitlisted"].includes(current.data.status);
      setMode(edit ? "edit" : "new");
      if (!edit) {
        void joinApi.profile(eventId, [], false).then((res) => { if (live && res.ok) setProfile(res.data); });
        const first = await joinApi.next(eventId, []);
        if (!live) return;
        if (first.ok) showStep(first.data); else setLoadFailed(true);
        return;
      }
      const given = current.data.answers.map(({ answer, field, prompt, questionToken }) => ({ answer, field, prompt, questionToken }));
      setAnswers(given);
      setAsked(Object.fromEntries([...current.data.answers.map((item) => [item.field, { item: item.item, question: item.question }] as const), ...current.data.ask.map(({ item, ...question }) => [question.field, { item, question }] as const)]));
      setIntro(current.data.selfIntro ?? "");
      showEditQuestions(current.data.ask, given);
      const read = await joinApi.profile(eventId, given, false, true);
      if (live && read.ok) setProfile(read.data);
    });
    return () => { live = false; };
  }, [eventId, attempt, joinApi]);

  const question = step?.question ?? null;
  const reviewing = Boolean(step?.done) && !result;
  const total = step?.total ?? 5;
  const toggle = (option: string) => {
    if (!question) return;
    if (!question.multi) { setSelected([option]); return; }
    setSelected((list) => (list.includes(option) ? list.filter((item) => item !== option) : question.max && list.length >= question.max ? list : [...list, option]));
  };
  const submitAnswer = async () => {
    if (!question || busy) return;
    const value = [...selected, free.trim()].filter(Boolean).join(" · ");
    if (!value) return;
    const given = { answer: value, field: question.field, prompt: question.prompt, questionToken: question.questionToken };
    if (editing) {
      // 改资料：只换这一答，其余原样；不再往下问，也不重写介绍。
      const changed = answers.some((item) => item.field === given.field) ? answers.map((item) => (item.field === given.field ? given : item)) : [...answers, given];
      const picked = question.options.length ? [...selected, free.trim()].filter(Boolean) : [];
      setAnswers(changed);
      setDirty(true);
      setAsked((list) => ({ ...list, [given.field]: { item: list[given.field]?.item ?? ITEM_OF_FIELD[given.field] ?? null, question: { ...question, options: [...new Set([...picked, ...question.options])].slice(0, 12), ...(picked.length ? { prefill: picked } : {}) } } }));
      showEditQuestions(queue, changed);
      setBusy(true);
      const read = await joinApi.profile(eventId, changed, false, true);
      if (read.ok) setProfile(read.data);
      setBusy(false);
      return;
    }
    const next = [...answers, given];
    setBusy(true);
    const [nextStep, nextProfile] = await Promise.all([joinApi.next(eventId, next), joinApi.profile(eventId, next, false)]);
    // 成功才记下这一答（失败时题目不变、选项保留，重答不会带着同一个 questionToken 重复入列）。
    if (!nextStep.ok) { toast.error(at("genericError")); setBusy(false); return; }
    setAnswers(next); setFree("");
    showStep(nextStep.data);
    if (nextProfile.ok) setProfile(nextProfile.data);
    setBusy(false);
    if (nextStep.data.done) void draftIntro(next);
  };
  // 答完后 AI 写自我介绍（几秒）：写好之前确认页说明「正在写」，不能提交、不能改介绍。已经有介绍（写过或本人改过）就不再写。
  // 最多等 INTRO_DRAFT_WAIT_MS；没写成 / 超时 → 用资料里的介绍或空，说明可以自己写或直接报名。超时后才回来的结果，介绍还空着时照样放进去。
  const draftIntro = async (given: readonly EventJoinAnswer[]) => {
    if (introRef.current !== null) return;
    const seq = ++draftSeq.current;
    setDraft("running");
    const request = joinApi.profile(eventId, given, true);
    const take = (drafted: Awaited<typeof request>) => {
      if (drafted.ok) setProfile(drafted.data);
      const outcome = introDraftOutcome(drafted.ok ? { ok: true, selfIntro: drafted.data.selfIntro } : { ok: false });
      setIntro(outcome.text);
      setDraft(outcome.state === "idle" ? "ready" : outcome.state);
    };
    const first = await waitForIntroDraft(request);
    if (seq !== draftSeq.current) return;
    if (first.timedOut === false) { take(first.value); return; }
    setIntro("");
    setDraft("failed");
    const late = await first.late;
    if (seq === draftSeq.current && introRef.current === "" && late.ok && late.data.selfIntro?.source === "ai_draft") take(late);
  };
  // 「追加」/「質問に戻る」：访谈认为够了也再问一题（live 由 AI 决定，可能仍然结束 → 留在确认页）。
  const askMore = async (focus?: EventJoinProfileItemKey) => {
    setBusy(true);
    const res = await joinApi.next(eventId, answers, true, focus);
    setBusy(false);
    if (res.ok && editing) setOptional(Boolean(res.data.question));
    if (res.ok) showStep(res.data); else toast.error(at("genericError"));
  };
  const editItem = (key: EventJoinProfileItemKey) => {
    const list = answers.flatMap((item) => (asked[item.field]?.item === key ? [asked[item.field]!.question] : []));
    if (list.length) { showEditQuestions(list, answers); setOptional(true); } else void askMore(key);
  };
  const apply = async () => {
    if (!mode || draft === "running") return;
    setBusy(true);
    // 2026-11-26：确认页上的自我介绍（AI 草稿原样或改过的）都随报名留存——它会显示给这场活动的其他参会者。
    const confirmed = (intro ?? profile?.selfIntro?.text ?? "").trim().slice(0, 400);
    const res = await joinApi.submit(eventId, answers, confirmed || undefined, editing);
    setBusy(false);
    if (res.ok) {
      setDirty(false);
      setResult(res.data);
      const written = res.data.calendar;
      setCalendar(written ? { final: written.final, state: "added", title: written.title } : { final: res.data.status === "registered", state: "none", title: res.data.tentative?.title ?? "" });
      setContactOpen(!editing && hostContactHasId(res.data.hostContact));
    } else toast.error(t(refusalKey("code" in res ? res.code : undefined) ?? "submitFailed"));
  };
  const addTentative = async () => {
    if (busy) return;
    setBusy(true);
    const res = await joinApi.tentative(eventId);
    setBusy(false);
    if (res.ok) setCalendar((current) => ({ final: current?.final ?? result?.status === "registered", state: "added", title: res.data.title || current?.title || "" })); else toast.error(at("genericError"));
  };
  const removeCalendar = async () => {
    if (busy) return;
    setBusy(true);
    const res = await joinApi.removeCalendar(eventId);
    setBusy(false);
    if (res.ok) setCalendar((current) => (current ? { ...current, state: "removed" } : current)); else toast.error(at("genericError"));
  };
  const dictate = () => {
    if (!Speech) return;
    const recognition = new Speech();
    recognition.lang = language === "zh" ? "zh-CN" : language === "en" ? "en-US" : "ja-JP";
    recognition.interimResults = false;
    recognition.onresult = (ev) => { const text = ev.results[0]?.[0]?.transcript ?? ""; setFree((value) => `${value}${text}`); };
    recognition.start();
  };

  const reviewUntil = profile?.reviewUntil ?? result?.reviewUntil ?? null;
  // 审核制才有「审核 / 结果通知」两段；先到先得报名即确定（结果出来前按资料里的 review 判断，提交后按结果）。
  const screened = result ? result.status === "pending_review" : profile?.review ?? true;
  const headRight = blocked || editing || !mode ? null : result ? t("doneTitle") : reviewing ? t("reviewStep", { i: Math.min(total, answers.length + 1), n: total }) : step ? t("regProgress", { i: step.index, m: step.remainingMinutes, n: total }) : null;
  const shownIntro = intro ?? profile?.selfIntro?.text ?? "";
  const detailHref = `/app/events/${id(eventId)}`;
  useEffect(() => {
    if (!dirty) return;
    const warn = (leave: BeforeUnloadEvent) => { leave.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const toReview = useRef<() => void>(() => {});
  toReview.current = () => { if (optional) showEditQuestions([], answers); else window.location.assign(detailHref); };
  // 顶栏的返回：点开的那一题 → 回确认页；有没保存的修改 → 整页离开（浏览器确认）；其余 → 活动详情。
  const stepBack = useCallback(() => toReview.current(), []);
  const phoneBack = optional || dirty ? stepBack : detailHref;
  const closeButton = (size: 16 | 20) => optional
    ? <button type="button" className={`btn ${x.rbtn}`} data-join-back="" aria-label={t("backToReview")} onClick={stepBack}><Icon name="left" size={size} /></button>
    : <a className={`btn ${x.rbtn}`} href={detailHref} aria-label={t("close")}><Icon name="x" size={size} /></a>;

  const rail = (
    <div className={`${styles.rail} ${d.rail}`} data-join-rail="">
      <h4 className={`${styles.railH} ${d.railH}`}><Icon name="calendar" size={16} />{t("applyTo")}</h4>
      {event ? (
        <div className={`${styles.card} ${r.railCard}`}>
          <div className={styles.row} style={{ gap: 12 }}>
            <span className={`${styles.emo} ${styles.t_lav}`}>{event.emoji}</span>
            <div><b className={r.railName}>{event.title}</b><div className={styles.lbl}>{[eventRange(event.startsAt, null, language), venueArea(event.venue)].filter(Boolean).join(" · ")}</div></div>
          </div>
        </div>
      ) : null}
      <div className={`${styles.card} ${r.railCard}`}>
        <div className={`${styles.lbl} ${r.flowLbl}`}>{t("nextFlow")}</div>
        {(screened ? ([["flowApply", "flowApplySub"], ["flowReview", "flowReviewSub"], ["flowResult", "flowResultSub"], ["flowDay", "flowDaySub"]] as const) : ([["flowApply", "flowApplySub"], ["flowConfirmed", "flowConfirmedSub"], ["flowDay", "flowDaySub"]] as const)).map(([title, sub], index) => (
          <div key={title} className={`${x.tline} ${index === (result ? 1 : 0) ? r.now : ""}`}><time>{index + 1}</time><span className={x.dot} /><div><b>{t(title)}</b><span className={styles.lbl}>{title === "flowReview" ? t(sub, { date: reviewUntil ? monthDaySlash(reviewUntil) : "—" }) : t(sub)}</span></div></div>
        ))}
      </div>
      <div className={`${styles.mac} ${r.lav} ${r.note}`}>{t("regPrefilledLine")}</div>
    </div>
  );

  // 第一题都取不到：给提示与重试（不留空白页）。
  const loadError = blocked ? (
    <div className={`${styles.card} ${x.span7}`} data-join-blocked={blocked}>
      <b>{t(blocked)}</b>
      <div className={r.gap}><a className={`btn ${styles.btn}`} href={detailHref}>{t("toDetail")}</a></div>
    </div>
  ) : loadFailed && !step ? (
    <div className={`${styles.card} ${x.span7}`} data-join-error="">
      <b>{t("regLoadFailed")}</b>
      <div className={r.gap}><button type="button" className={`btn ${styles.btn}`} onClick={() => setAttempt((value) => value + 1)}>{t("retryLoad")}</button></div>
    </div>
  ) : null;
  const chat = (
    <div className={`${styles.card} ${x.span7} ${r.chat}`} data-join-chat="">
      <div className={r.progress} hidden={editing}><div className={x.bar}><i style={{ width: `${Math.round((Math.max(0, step?.index ?? 1) / total) * 100)}%` }} /></div></div>
      <div className={r.chatcol}>
        {(editing ? [] : answers).map((item, index) => (
          <div key={`${item.field}-${index}`} className={r.pair}><div className={`${r.bubble} ${r.ai}`}>{item.prompt}</div><div className={`${r.bubble} ${r.me}`}>{item.answer}</div></div>
        ))}
        {question ? (
          <>
            <div className={`${r.bubble} ${r.ai}`}><b>{question.prompt}</b>{question.help ? <div className={`${styles.lbl} ${r.help}`}>{question.help}</div> : null}</div>
            <div className={r.opts}>
              {question.options.map((option) => <button key={option} type="button" aria-pressed={selected.includes(option)} className={`btn ${r.opt} ${selected.includes(option) ? r.on : ""}`} onClick={() => toggle(option)}>{option}</button>)}
              {question.allowCustom ? <button type="button" className={`btn ${r.opt}`} onClick={() => freeRef.current?.focus()}>{t("otherOption")}</button> : null}
            </div>
          </>
        ) : null}
      </div>
      {question ? (
        <div className={`${styles.row} ${r.answerRow}`}>
          <input ref={freeRef} className={r.input} value={free} onChange={(ev) => setFree(ev.target.value)} placeholder={t("freeAnswer")} aria-label={t("freeAnswer")} onKeyDown={(ev) => { if (ev.key === "Enter") void submitAnswer(); }} />
          {Speech ? <button type="button" className={`btn ${d.lbtn} ${r.mic}`} aria-label={t("voiceAnswer")} onClick={dictate}><Icon name="mic" size={16} /></button> : null}
          <button type="button" className={`btn ${styles.btn} ${styles.primary} ${r.nextBtn}`} disabled={busy || (!selected.length && !free.trim())} onClick={() => void submitAnswer()}>{t("next")}</button>
        </div>
      ) : null}
    </div>
  );

  // 390（b12 #356）：App 式——进度条 + 预填说明 + 对话 + 底部 composer（自由回答 · 🎙 · 次へ（n つ選択））。
  const phoneChat = (
    <div className={r.pChat} data-join-chat="" data-join-phone="">
      {step && !editing ? (
        <div className={r.pProg}>
          <div className={`${styles.row} ${styles.between}`}><span className={styles.lbl}><b className={r.pQ}>{t("regQ", { i: step.index })}</b>{t("regOfN", { n: total })}</span><span className={styles.lbl}>{t("regRemain", { m: step.remainingMinutes })}</span></div>
          <div className={`${x.bar} ${r.pBar}`}><i style={{ width: `${Math.round((Math.max(0, step.index) / total) * 100)}%` }} /></div>
        </div>
      ) : null}
      {editing ? null : <div className={`${styles.mac} ${r.pPrefill}`}>{t("regPrefilledLine")}</div>}
      <div className={r.chatcol}>
        {(editing ? [] : answers).map((item, index) => (
          <div key={`${item.field}-${index}`} className={r.pair}><div className={`${r.bubble} ${r.ai}`}>{item.prompt}</div><div className={`${r.bubble} ${r.me}`}>{item.answer}</div></div>
        ))}
        {question ? (
          <>
            <div className={`${r.bubble} ${r.ai}`}><b>{question.prompt}</b>{question.help ? <div className={`${styles.lbl} ${r.help}`}>{question.help}</div> : null}</div>
            <div className={r.opts}>
              {question.options.map((option) => <button key={option} type="button" aria-pressed={selected.includes(option)} className={`btn ${r.opt} ${r.pOpt} ${selected.includes(option) ? r.on : ""}`} onClick={() => toggle(option)}>{option}</button>)}
              {question.allowCustom ? <button type="button" className={`btn ${r.opt} ${r.pOpt}`} onClick={() => freeRef.current?.focus()}>{t("otherOption")}</button> : null}
            </div>
          </>
        ) : null}
      </div>
      {question ? (
        <div className={r.composer}>
          <input ref={freeRef} className={r.pIn} value={free} onChange={(ev) => setFree(ev.target.value)} placeholder={t("freeAnswer")} aria-label={t("freeAnswer")} onKeyDown={(ev) => { if (ev.key === "Enter") void submitAnswer(); }} />
          <button type="button" className={`btn ${d.lbtn}`} aria-label={t("voiceAnswer")} onClick={dictate}><Icon name="mic" size={16} /></button>
          <button type="button" className={`btn ${styles.btn} ${styles.sm} ${styles.primary}`} disabled={busy || (!selected.length && !free.trim())} onClick={() => void submitAnswer()}>{selected.length > 1 ? t("nextChosen", { n: selected.length }) : t("next")}</button>
        </div>
      ) : null}
    </div>
  );

  const missing = (profile?.items ?? []).filter((item) => !item.done);
  const coverage = profile?.coverage ?? 0;
  const editableLine = profile?.editableUntil ? t("editableUntil", { date: monthDaySlash(profile.editableUntil) }) : null;
  const reviewCards = (
    <>
      <div className={`${styles.card} ${r.inner}`}>
        <div className={styles.cardH}><h3>{t("coverageTitle", { n: profile?.coverage ?? 0 })}</h3><span className={styles.lbl}>{t("coverageAddable")}</span></div>
        {(profile?.items ?? []).map((item) => (
          <div key={item.key} className={`${styles.row} ${r.covRow}`}>
            <span className={item.done ? r.ok : r.missing}>{item.done ? "✓" : "△"}</span>
            <span className={item.done ? r.grow : `${r.grow} ${styles.muted}`}>{t(ITEM_LABEL[item.key])}</span>
            {item.fromProfile ? <span className={styles.lbl} data-join-from-profile={item.key}>{t("itemFromProfile")}</span> : null}
            {item.fromProfile ? <button type="button" className={`btn ${styles.btn} ${styles.sm}`} disabled={busy} onClick={() => void askMore(item.key)}>{t("edit")}</button>
              : editing && item.done && item.key !== "company" ? <button type="button" className={`btn ${styles.btn} ${styles.sm}`} disabled={busy} data-join-edit={item.key} onClick={() => editItem(item.key)}>{t("edit")}</button> : null}
            {item.done ? null : <button type="button" className={`btn ${styles.btn} ${styles.sm}`} disabled={busy} onClick={() => void askMore(editing ? item.key : undefined)}>{t("add")}</button>}
          </div>
        ))}
        {editing ? answers.filter((item) => asked[item.field] && asked[item.field]!.item === null).map((item) => (
          <div key={item.field} className={`${styles.row} ${r.covRow}`}>
            <span className={r.ok}>✓</span>
            <span className={r.grow}>{item.prompt}</span>
            <button type="button" className={`btn ${styles.btn} ${styles.sm}`} disabled={busy} data-join-edit={item.field} onClick={() => { showEditQuestions([asked[item.field]!.question], answers); setOptional(true); }}>{t("edit")}</button>
          </div>
        )) : null}
        {missing.some((item) => item.key === "offer") ? <div className={`${styles.lbl} ${r.hint}`}>{t("offerHint")}</div> : null}
        {/* 390：「質問に戻る」降为卡内的文字链（主按钮在底部固定区）。 */}
        {phone && !editing ? <button type="button" className={`btn ${r.textLink} ${r.backLink}`} disabled={busy} onClick={() => void askMore()} data-join-back-questions="">{t("backToQuestions")}</button> : null}
      </div>
      {/* 390：参加用プロフィール卡不再出现，它独有的话题并到这里（b2 regPersona「話題」卡）。 */}
      {phone && profile?.topics.length ? (
        <div className={`${styles.card} ${r.inner} ${r.gap}`} data-join-topics="">
          <div className={styles.cardH}><h3>{t("topicsLbl")}</h3></div>
          <div className={`${styles.chips} ${r.chips}`}>{profile.topics.map((topic) => <span key={topic} className={`${styles.chip} ${styles.c_lav}`}>{topic}</span>)}</div>
        </div>
      ) : null}
      <div className={`${styles.card} ${r.inner} ${r.gap}`} aria-busy={draft === "running"}>
        <div className={styles.cardH}>
          <h3>{t("introLbl")} <span className={`${styles.lbl} ${r.introTag}`}>{t("introShown")}</span></h3>
          <div className={styles.row} style={{ gap: 6 }}>
            {profile?.selfIntroBasis ? <button type="button" className={`btn ${r.why}`} aria-expanded={why} aria-label={t("introWhy")} onClick={() => setWhy((v) => !v)}>?</button> : null}
            <button type="button" className={`btn ${d.lbtn}`} aria-label={t("edit")} disabled={draft === "running"} onClick={() => setEditingIntro((v) => !v)}><Icon name="pen" size={16} /></button>
          </div>
        </div>
        {draft === "running" ? (
          <div className={r.drafting}>
            <div className={r.shimmer} /><div className={r.shimmer} style={{ width: "85%" }} /><div className={r.shimmer} style={{ width: "60%" }} />
          </div>
        ) : editingIntro ? (
          <div className={r.editIntro}>
            <textarea className={r.textarea} value={shownIntro} maxLength={400} onChange={(ev) => { setIntro(ev.target.value); if (editing) setDirty(true); }} aria-label={t("introLbl")} />
            <button type="button" className={`btn ${styles.btn} ${styles.sm} ${styles.primary}`} onClick={() => setEditingIntro(false)}>{t("saveIntro")}</button>
          </div>
        ) : <div className={r.introText}>{shownIntro}</div>}
        {why && profile?.selfIntroBasis ? <div className={r.whyBody}>{profile.selfIntroBasis}</div> : null}
        <div className={`${styles.lbl} ${r.draftNote}`} role="status" aria-live="polite" data-join-intro-draft={draft}>{draft === "running" ? t("introDrafting") : draft === "failed" ? t("introDraftFailed") : draft === "ready" ? <span className={r.srOnly}>{t("introDrafted")}</span> : ""}</div>
      </div>
      <div className={`${styles.card} ${r.inner} ${r.gap} ${r.scope}`}>
        <div className={`${styles.lbl} ${r.scopeLbl}`}>{t("visibilityTitle")}</div>
        <div className={`${styles.row} ${r.scopeRow}`}><span className={`${styles.chip} ${styles.c_teal}`}>{t("visAll")}</span><span className={styles.sub}>{t("visAllFields")}</span></div>
      </div>
    </>
  );
  const review = (
    <div className={`${styles.card} ${x.span7} ${r.chat}`} data-join-review="">
      {reviewCards}
      <div className={`${styles.row} ${r.go}`}>
        <span className={`${styles.lbl} ${r.grow}`}>{editableLine}</span>
        {editing ? null : <button type="button" className={`btn ${styles.btn}`} disabled={busy} onClick={() => void askMore()}>{t("backToQuestions")}</button>}
        <button type="button" className={`btn ${styles.btn} ${styles.primary} ${r.nextBtn}`} disabled={busy || draft === "running"} aria-disabled={draft === "running"} onClick={() => void apply()}>{draft === "running" ? t("introDrafting") : t(editing ? "joinSave" : "applyNow")}</button>
      </div>
    </div>
  );
  // 390（b2 regPersona）：卡片直接排在页面上，主按钮在屏幕底部固定区（整宽 48、深色），上面一行就绪提示，下面一行「编辑期限」。
  // 就绪提示：100% = 带对勾的一句；没到 = 还差几项 +「补上」（问缺的那一项）。自我介绍还在写时按钮保持「正在生成…」禁用。
  const firstMissing = missing[0];
  const phoneReview = (
    <div className={r.pPage} data-join-review="" data-join-phone="">
      {reviewCards}
      <div className={r.pFoot} data-join-foot="">
        {profile ? (coverage >= 100 ? (
          <div className={`${r.pReady} ${r.pReadyOk}`} role="status" data-join-ready="done"><Icon name="check" size={16} />{t("readyAll")}</div>
        ) : (
          <div className={r.pReady} role="status" data-join-ready="missing">
            <span>{t("readyMissing", { n: missing.length })}</span>
            {firstMissing ? <button type="button" className={`btn ${r.textLink}`} disabled={busy} onClick={() => void askMore(editing ? firstMissing.key : undefined)}>{t("fillIn")}</button> : null}
          </div>
        )) : null}
        <button type="button" className={`btn ${styles.btn} ${styles.primary} ${r.pMain}`} disabled={busy || draft === "running"} aria-disabled={draft === "running"} onClick={() => void apply()}>{draft === "running" ? t("introDrafting") : t(editing ? "joinSave" : "applyNow")}</button>
        {editableLine ? <div className={`${styles.lbl} ${r.pFootNote}`}>{editableLine}</div> : null}
      </div>
    </div>
  );

  const contactLine = result?.status === "pending_review" ? contactReviewLine(result.hostContact, event?.priceYen, t) : null;
  const doneCards = result ? (
    <>
      <div className={`${styles.card} ${r.inner} ${r.check}`}>
        <div className={r.popcheck}><Icon name="check" size={24} /></div>
        <div className={r.doneTitle}>{t(editing ? "joinUpdated" : "received")}</div>
        <div className={styles.lbl}>{`${event?.title ?? ""} · ${dateTimeLong(result.submittedAt, t)}`}</div>
      </div>
      <div className={`${styles.card} ${r.inner} ${r.gap}`}>
        <div className={`${styles.row} ${styles.between}`}><b className={r.statusTitle}>{t("statusNow")}</b><span className={`${styles.chip} ${result.status === "registered" ? styles.c_teal : styles.c_lav}`}>{result.status === "registered" ? t("statusConfirmed") : t("statusReview")}</span></div>
        {result.status === "pending_review" ? (
          <div className={r.steps4}>
            <div className={r.stepDone}>{t("flowApply")}<br />{monthDaySlash(result.submittedAt)}</div>
            <div className={r.stepNow}>{t("flowReview")}<br />{reviewUntil ? t("reviewBy", { date: monthDaySlash(reviewUntil) }) : null}</div>
            <div>{t("flowResult")}</div>
            <div>{t("flowDay")}<br />{monthDaySlash(result.startsAt)}</div>
          </div>
        ) : (
          // 先着順で確定：審査・結果通知の段はない（申込 → 参加確定 → 当日）。
          <div className={r.steps4} style={{ gridTemplateColumns: "repeat(3, 1fr)" }} data-join-steps="confirmed">
            <div className={r.stepDone}>{t("flowApply")}<br />{monthDaySlash(result.submittedAt)}</div>
            <div className={r.stepNow}>{t("flowConfirmed")}</div>
            <div>{t("flowDay")}<br />{monthDaySlash(result.startsAt)}</div>
          </div>
        )}
        {result.status === "pending_review" ? <div className={`${styles.sub} ${r.doneSub}`}>{contactLine ?? t("reviewWait")}</div> : null}
      </div>
      {result.hostContact !== undefined ? <HostContactCard contact={result.hostContact} t={t} className={r.gap} /> : null}
      {calendar && result.tentative && !editing ? (
        // 写日历：报名成功时已写入（2026-11-27 用户定），这里只告知；「外す」= 删除并且以后不再自动加；外した後は「追加する」で戻せる。
        <div className={`${styles.card} ${r.confirm}`} data-join-calendar={calendar.state}>
          <div className={styles.row} style={{ gap: 8 }}><span className={`${styles.emo} ${styles.t_lav} ${r.emoSm}`}>📅</span><b className={r.confirmTitle} role="status">{t(calendar.state === "removed" ? "calRemoved" : calendar.state === "none" ? "calNotAdded" : calendar.final ? "calAdded" : "calAddedTentative")}</b></div>
          <div className={`${styles.sub} ${r.confirmSub}`}>{t("calendarLineFinal", { range: eventRange(result.tentative.startsAt, result.tentative.endsAt, language), title: calendar.title || result.tentative.title })}</div>
          <div className={styles.row} style={{ gap: 8 }}>
            {calendar.state === "added" ? (
              <>
                <a className={`btn ${styles.btn} ${styles.sm}`} href="/app/home" data-join-calendar-view="">{t("viewCalendar")}</a>
                <button type="button" className={`btn ${styles.btn} ${styles.sm}`} disabled={busy} onClick={() => void removeCalendar()} data-join-calendar-remove="">{t("removeIt")}</button>
              </>
            ) : <button type="button" className={`btn ${styles.btn} ${styles.sm} ${styles.primary}`} disabled={busy} onClick={() => void addTentative()}>{t("addIt")}</button>}
          </div>
        </div>
      ) : null}
    </>
  ) : null;
  const done = result ? (
    <div className={`${styles.card} ${x.span7} ${r.chat}`} data-join-done="">
      {doneCards}
      <div className={`${styles.row} ${r.doneGo}`}>
        <a className={`btn ${styles.btn}`} href="/app/profile">{t("editProfile")}</a>
        <a className={`btn ${styles.btn} ${styles.primary}`} href={detailHref}>{t("toDetail")}</a>
      </div>
    </div>
  ) : null;
  // 390：主操作「去活动详情」固定在底部整宽；「编辑资料」降为文字链。
  const phoneDone = result ? (
    <div className={r.pPage} data-join-done="" data-join-phone="">
      {doneCards}
      <div className={r.pFoot} data-join-foot="">
        <a className={`btn ${styles.btn} ${styles.primary} ${r.pMain}`} href={detailHref}>{t("toDetail")}</a>
        <a className={`${r.textLink} ${r.pFootLink}`} href="/app/profile">{t("editProfile")}</a>
      </div>
    </div>
  ) : null;

  return (
    <>
      {/* 390：答题 / 确认 / 完成都全屏（不显示底部导航胶囊），主操作在页面自己的底部固定区。 */}
      {phone ? (
        <>
          <ShellPage title={t("regTitle")} subtitle={event?.title ?? ""} left={closeButton(20)} rightRail={false} phoneBare phoneBack={phoneBack} phoneSubtitle={headRight ?? undefined} />
          {loadError ?? (result ? phoneDone : reviewing ? phoneReview : phoneChat)}
        </>
      ) : <>
      <ShellPage
        title={t("regTitle")}
        subtitle={event?.title ?? ""}
        left={closeButton(16)}
        right={headRight ? <span className={styles.lbl}>{headRight}</span> : undefined}
        phoneBack={phoneBack}
        // 2026-11-23：手机顶栏标题下的小字是答题进度（代替活动名），仍在 52 这一行之内。
        phoneSubtitle={headRight ?? undefined}
        rightRail={wide ? rail : false}
      />
      <div className={styles.wgrid} data-join={eventId}>
        {done ?? loadError ?? (reviewing ? review : chat)}
        {blocked && !profile ? null : <ProfileCard introPending={draft === "running"} profile={profile ? { ...profile, selfIntro: intro && (profile.selfIntro || editing) ? { source: profile.selfIntro?.source ?? "profile", text: intro } : profile.selfIntro } : null} t={t} mode={result ? "applied" : blocked ? "readonly" : reviewing ? "review" : "live"} />}
      </div>
      </>}
      {result ? <HostContactModal open={contactOpen} contact={result.hostContact} t={t} reviewLine={contactLine} onClose={() => setContactOpen(false)} /> : null}
    </>
  );
}

export function RegisterFlow({ eventId, language }: { eventId: string; language: OrbitLanguage }) {
  return (
    <Orbit2026Scope language={language} className={styles.page}>
      <ToastProvider>
        <RegisterInner eventId={eventId} language={language} />
      </ToastProvider>
    </Orbit2026Scope>
  );
}
