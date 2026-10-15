"use client";

// R27 参加登録（Web 1440：b2 #23 ① 質問 + 実時間の参加用プロフィール；1024 / 390：b12 #354 / #356）。
// ② 確認 / ③ 申込完了 在 Web 没有画板：内容与顺序照 App b2 #21 / #22，放进同一张左卡（门禁登记「设计稿无」）。
// 数据：/api/events/[id]/join/*（问题 = 现有 AI 访谈 ≤5 问；资料规则实时更新，只有确认时才生成自己紹介草稿）。
import { useEffect, useMemo, useRef, useState } from "react";

import type { EventJoinAnswer, EventJoinProfile, EventJoinProfileItemKey, EventJoinResult, EventJoinStep } from "../../../../../shared/contract/event-join";
import type { EventOverviewResponse } from "../../../../../shared/contract/event-overview";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { ShellPage } from "../shell/slots";
import { Icon, Orbit2026Scope, RingChart, ToastProvider, useToast } from "../ui";
import { ScoreRing, translator as assessTranslator } from "./AssessmentDetail";
import { journeyTranslator, type JourneyT } from "./DiscoverTab";
import { eventRange, monthDaySlash } from "./EventDetail";
import { eventsCall, newIdempotencyKey } from "./events-api";
import { journeyApi } from "./journey-api";
import { eventJoinProfileSchema, eventJoinResultSchema, eventJoinStepSchema, eventJoinTentativeResultSchema } from "../../../../../shared/api-schema/event-join";
import type { ZodType } from "zod";
import styles from "./events.module.css";
import d from "./discover.module.css";
import x from "./detail.module.css";
import r from "./register.module.css";

const id = (value: string) => encodeURIComponent(value);
const joinApi = {
  next: (eventId: string, answers: readonly EventJoinAnswer[]) => eventsCall(`/api/events/${id(eventId)}/join/next`, { body: JSON.stringify({ answers }), method: "POST" }, eventJoinStepSchema as ZodType<EventJoinStep>),
  profile: (eventId: string, answers: readonly EventJoinAnswer[], draft: boolean) => eventsCall(`/api/events/${id(eventId)}/join/profile`, { body: JSON.stringify({ answers, draft }), method: "POST" }, eventJoinProfileSchema as ZodType<EventJoinProfile>),
  submit: (eventId: string, answers: readonly EventJoinAnswer[]) => eventsCall(`/api/events/${id(eventId)}/join/submit`, { body: JSON.stringify({ answers, idempotencyKey: newIdempotencyKey() }), method: "POST" }, eventJoinResultSchema as ZodType<EventJoinResult>),
  tentative: (eventId: string) => eventsCall(`/api/events/${id(eventId)}/join/tentative`, { body: JSON.stringify({ idempotencyKey: newIdempotencyKey() }), method: "POST" }, eventJoinTentativeResultSchema),
};
export { joinApi };

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

export function ProfileCard({ profile, t, live }: { profile: EventJoinProfile | null; t: JourneyT; live: boolean }) {
  return (
    <div className={`${styles.card} ${styles.span5} ${r.persona}`} data-join-profile="">
      <div className={styles.cardH}><h3>{t("profileTitle")}</h3>{live ? <span className={`${styles.chip} ${styles.c_lav}`}>{t("updatingLive")}</span> : null}</div>
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
              <span className={item.done ? r.ok : r.todo}>{item.done ? "✓" : "○"}</span>
              <span className={item.done ? "" : styles.muted}>{t(ITEM_LABEL[item.key])}</span>
            </div>
          ))}
        </div>
      </div>
      <div className={`${styles.lbl} ${r.sectionLbl}`}>{t("topicsLbl")}</div>
      <div className={`${styles.chips} ${r.chips}`}>{(profile?.topics ?? []).map((topic) => <span key={topic} className={`${styles.chip} ${styles.c_lav}`}>{topic}</span>)}</div>
      <div className={`${styles.lbl} ${r.sectionLbl}`}>{t("introDraftLbl")}</div>
      {profile?.selfIntro ? <div className={`${styles.sub} ${r.intro}`}>{profile.selfIntro.text}</div> : (
        <>
          <div className={r.shimmer} /><div className={r.shimmer} style={{ width: "85%" }} /><div className={r.shimmer} style={{ width: "60%" }} />
        </>
      )}
      <div className={`${styles.lbl} ${r.foot}`}>{t("reviewBeforeSubmit")}</div>
    </div>
  );
}

function RegisterInner({ eventId, language }: { eventId: string; language: OrbitLanguage }) {
  const t = useMemo(() => journeyTranslator(language), [language]);
  const at = useMemo(() => assessTranslator(language), [language]);
  const toast = useToast();
  const [event, setEvent] = useState<EventOverviewResponse | null>(null);
  const [answers, setAnswers] = useState<EventJoinAnswer[]>([]);
  const [step, setStep] = useState<EventJoinStep | null>(null);
  const [profile, setProfile] = useState<EventJoinProfile | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [free, setFree] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<EventJoinResult | null>(null);
  const [calendar, setCalendar] = useState<"asked" | "added" | "declined">("asked");
  const freeRef = useRef<HTMLInputElement | null>(null);
  const Speech = useMemo(() => speechRecognition(), []);

  useEffect(() => {
    void journeyApi.overview(eventId).then((res) => { if (res.ok) setEvent(res.data); });
    void joinApi.next(eventId, []).then((res) => { if (res.ok) setStep(res.data); });
    void joinApi.profile(eventId, [], false).then((res) => { if (res.ok) setProfile(res.data); });
  }, [eventId]);

  const question = step?.question ?? null;
  const reviewing = Boolean(step?.done) && !result;
  const toggle = (option: string) => {
    if (!question) return;
    if (!question.multi) { setSelected([option]); return; }
    setSelected((list) => (list.includes(option) ? list.filter((item) => item !== option) : question.max && list.length >= question.max ? list : [...list, option]));
  };
  const submitAnswer = async () => {
    if (!question) return;
    const value = [...selected, free.trim()].filter(Boolean).join(" · ");
    if (!value) return;
    const next = [...answers, { answer: value, field: question.field, prompt: question.prompt, questionToken: question.questionToken }];
    setBusy(true);
    setAnswers(next); setSelected([]); setFree("");
    const [nextStep, nextProfile] = await Promise.all([joinApi.next(eventId, next), joinApi.profile(eventId, next, false)]);
    if (nextStep.ok) setStep(nextStep.data); else toast.error(at("genericError"));
    if (nextProfile.ok) setProfile(nextProfile.data);
    if (nextStep.ok && nextStep.data.done) {
      const drafted = await joinApi.profile(eventId, next, true);
      if (drafted.ok) setProfile(drafted.data);
    }
    setBusy(false);
  };
  const apply = async () => {
    setBusy(true);
    const res = await joinApi.submit(eventId, answers);
    setBusy(false);
    if (res.ok) setResult(res.data); else toast.error(t("submitFailed"));
  };
  const addTentative = async () => {
    const res = await joinApi.tentative(eventId);
    if (res.ok) { setCalendar("added"); toast.success(t("tentativeAdded")); } else toast.error(at("genericError"));
  };
  const dictate = () => {
    if (!Speech) return;
    const recognition = new Speech();
    recognition.lang = language === "zh" ? "zh-CN" : language === "en" ? "en-US" : "ja-JP";
    recognition.interimResults = false;
    recognition.onresult = (ev) => { const text = ev.results[0]?.[0]?.transcript ?? ""; setFree((value) => `${value}${text}`); };
    recognition.start();
  };

  const total = step?.total ?? 5;
  const progressText = step && !step.done ? t("regProgress", { i: step.index, m: step.remainingMinutes, n: total }) : null;
  const reviewUntil = profile?.reviewUntil ?? result?.reviewUntil ?? null;

  const rail = (
    <div className={`${styles.rail} ${d.rail}`} data-join-rail="">
      <h4 className={`${styles.railH} ${d.railH}`}><Icon name="calendar" size={16} />{t("applyTo")}</h4>
      {event ? (
        <div className={`${styles.card} ${r.railCard}`}>
          <div className={styles.row} style={{ gap: 12 }}>
            {event.assessment ? <ScoreRing score={event.assessment.score} size={48} stroke={5} label={String(event.assessment.score)}><span className={styles.score} style={{ fontSize: "var(--fs-body)" }}>{event.assessment.score}</span></ScoreRing> : null}
            <div><b className={r.railName}>{event.title}</b><div className={styles.lbl}>{[eventRange(event.startsAt, null, language), venueArea(event.venue)].filter(Boolean).join(" · ")}</div></div>
          </div>
        </div>
      ) : null}
      <div className={`${styles.card} ${r.railCard}`}>
        <div className={`${styles.lbl} ${r.flowLbl}`}>{t("nextFlow")}</div>
        {([["flowApply", "flowApplySub"], ["flowReview", "flowReviewSub"], ["flowResult", "flowResultSub"], ["flowDay", "flowDaySub"]] as const).map(([title, sub], index) => (
          <div key={title} className={`${x.tline} ${index === (result ? 1 : 0) ? r.now : ""}`}><time>{index + 1}</time><span className={x.dot} /><div><b>{t(title)}</b><span className={styles.lbl}>{title === "flowReview" ? t(sub, { date: reviewUntil ? monthDaySlash(reviewUntil) : "—" }) : t(sub)}</span></div></div>
        ))}
      </div>
      <div className={`${styles.mac} ${r.lav} ${r.note}`}>{t("prefilledNote")}</div>
    </div>
  );

  return (
    <>
      <ShellPage
        title={result ? t("doneTitle") : t("regTitle")}
        subtitle={event?.title ?? ""}
        left={<a className={`btn ${x.rbtn}`} href={`/app/events/${id(eventId)}`} aria-label={t("close")}><Icon name="x" size={16} /></a>}
        right={progressText ? <span className={styles.lbl}>{progressText}</span> : undefined}
        rightRail={rail}
      />
      <div className={styles.wgrid} data-join={eventId}>
        <div className={`${styles.card} ${x.span7} ${r.chat}`} data-join-chat="">
          {!result ? <div className={r.progress}><div className={x.bar}><i style={{ width: `${Math.round(((reviewing ? total : Math.max(0, (step?.index ?? 1))) / total) * 100)}%` }} /></div></div> : null}
          {result ? (
            <div className={r.done} data-join-done="">
              <b className={r.doneTitle}>{t("received")}</b>
              <div className={styles.lbl}>{`${event?.title ?? ""} · ${monthDaySlash(result.submittedAt)}`}</div>
              <div className={styles.row} style={{ gap: 8, marginTop: 14 }}><span className={styles.lbl}>{t("statusNow")}</span><span className={`${styles.chip} ${result.status === "registered" ? styles.c_teal : styles.c_apricot}`}>{result.status === "registered" ? t("statusConfirmed") : t("statusReview")}</span></div>
              {result.status === "pending_review" ? <div className={`${styles.sub} ${r.doneSub}`}>{t("reviewWait")}</div> : null}
              {result.tentative && calendar === "asked" ? (
                <div className={`${styles.card} ${r.confirm}`} data-join-calendar="">
                  <b className={r.confirmTitle}>{t("calendarAsk")}</b>
                  <div className={styles.lbl}>{t("calendarLine", { range: eventRange(result.tentative.startsAt, result.tentative.endsAt, language), title: result.tentative.title })}</div>
                  <div className={styles.row} style={{ gap: 8, marginTop: 10 }}>
                    <button type="button" className={`btn ${styles.btn} ${styles.sm} ${styles.primary}`} onClick={() => void addTentative()}>{t("addIt")}</button>
                    <button type="button" className={`btn ${styles.btn} ${styles.sm}`} onClick={() => setCalendar("declined")}>{t("noNeed")}</button>
                  </div>
                </div>
              ) : null}
              <a className={`btn ${styles.btn} ${styles.sm} ${r.editBtn}`} href={`/app/events/${id(eventId)}`}>{t("editProfile")}</a>
            </div>
          ) : (
            <>
              <div className={r.chatcol}>
                {answers.map((item, index) => (
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
                {reviewing ? (
                  <div className={r.review} data-join-review="">
                    <div className={styles.lbl}>{t("visibilityTitle")}</div>
                    <div className={r.visRow}><b>{t("visAll")}</b><span className={styles.lbl}>{t("visAllFields")}</span></div>
                    <div className={r.visRow}><b>{t("visOrg")}</b><span className={styles.lbl}>{t("visOrgFields")}</span></div>
                    <button type="button" className={`btn ${styles.btn} ${styles.primary} ${x.block}`} disabled={busy} onClick={() => void apply()}>{t("applyNow")}</button>
                    {profile?.editableUntil ? <div className={`${styles.lbl} ${r.center}`}>{t("editableUntil", { date: monthDaySlash(profile.editableUntil) })}</div> : null}
                  </div>
                ) : null}
              </div>
              {question ? (
                <div className={`${styles.row} ${r.answerRow}`}>
                  <input ref={freeRef} className={r.input} value={free} onChange={(ev) => setFree(ev.target.value)} placeholder={t("freeAnswer")} aria-label={t("freeAnswer")} onKeyDown={(ev) => { if (ev.key === "Enter") void submitAnswer(); }} />
                  {Speech ? <button type="button" className={`btn ${d.lbtn} ${r.mic}`} aria-label={t("voiceAnswer")} onClick={dictate}><Icon name="mic" size={16} /></button> : null}
                  <button type="button" className={`btn ${styles.btn} ${styles.primary} ${r.nextBtn}`} disabled={busy || (!selected.length && !free.trim())} onClick={() => void submitAnswer()}>{t("next")}</button>
                </div>
              ) : null}
            </>
          )}
        </div>
        <ProfileCard profile={profile} t={t} live={!reviewing && !result} />
      </div>
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
