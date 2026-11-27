// R27 参加登録（App；b2 #20 質問 3/5 · #21 参加用プロフィール確認 · #22 申込完了）。
// 数据：/api/events/[id]/join/*（问题 = 现有 AI 访谈 ≤5 问；资料按规则实时更新，只在问完时生成自己紹介草稿）。与 Web RegisterFlow 同一套接口与文案。
// 门禁开发开关 open-path 下可带 `?replay=答1|答2a,答2b|答3a,答3b&to=select|review|done` 自动答到指定状态（画板从不画点击过程）。
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, Platform, StyleSheet, TextInput, View } from "react-native";

import type { EventJoinAnswer, EventJoinCurrent, EventJoinProfile, EventJoinProfileItemKey, EventJoinQuestion, EventJoinResult, EventJoinStep, EventJoinWechatAnswer } from "../../../api/contract/event-join";
import type { EventOverviewResponse } from "../../../api/contract/event-overview";
import { designIcons } from "../../../api/design/icons";
import { Icon, UiPressable, UiText, useToast } from "../../../components/ui";
import Svg, { Defs, Path, Rect, Stop } from "../../../components/ui/svg";
import { createThemedStyles } from "../../../design/theme";
import { radius } from "../../../design/tokens";
import { addDesignMock } from "../../add/add-design-mock";
import { LinearGradient } from "../../plan/plan-svg";
import { useJourneyApi } from "./journey-api";
import { contactReviewLine, HostContactCard, HostContactSheet, shouldOpenHostContact } from "./HostContact";
import { announceEventChanged, eventRange, monthDaySlash, tokyo } from "./journey-model";
import { JourneyPage } from "./JourneyPage";
import { Bone, Bones } from "./loading-ui";
import { ScoreRing } from "./ScoreRing";
import { useJourneyT } from "./useJourneyT";

const ITEM_LABEL: Record<EventJoinProfileItemKey, string> = { company: "itemCompany", offer: "itemOffer", purpose: "itemPurpose", target: "itemTarget", topics: "itemTopics" };

/** Why a registration cannot be sent or changed (409 context.reason). */
const REFUSAL: Readonly<Record<string, "joinCancelled" | "joinClosed" | "joinLocked" | "joinRejected">> = { JOIN_CANCELLED: "joinCancelled", JOIN_CLOSED: "joinClosed", JOIN_LOCKED: "joinLocked", JOIN_REJECTED: "joinRejected" };

const ITEM_OF_FIELD: Readonly<Record<string, EventJoinProfileItemKey>> = { desiredOutcome: "purpose", experienceHighlight: "topics", targetAttendees: "target", valueOffered: "offer" };
/** How long the review waits for the self-introduction draft: one model call (60 s) plus the network (as Web). */
export const INTRO_DRAFT_TIMEOUT_MS = 70_000;

/** A question of an existing registration, and the review item its answer fills (null = its own row). */
type AskedQuestion = { item: EventJoinProfileItemKey | null; question: EventJoinQuestion };

/** kit .bar：surface-3 底 + plum-300→plum-700 渐变 + 14px 圆钮（plum-700 3px 边）。 */
function ProgressBar({ share }: { share: number }) {
  const { styles, colors } = useStyles();
  const [width, setWidth] = useState(0);
  const fill = Math.max(0, Math.min(1, share)) * width;
  return (
    <View style={styles.bar} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      {fill > 0 ? (
        <View style={[styles.barFill, { width: fill }]}>
          <Svg width={fill} height={6} style={StyleSheet.absoluteFill}>
            <Defs><LinearGradient id="joinBar" x1={0} y1={0} x2={fill} y2={0} gradientUnits="userSpaceOnUse"><Stop offset={0} stopColor={colors.plum300} /><Stop offset={1} stopColor={colors.plum700} /></LinearGradient></Defs>
            <Rect x={0} y={0} width={fill} height={6} rx={3} fill="url(#joinBar)" />
          </Svg>
          <View style={styles.knob} />
        </View>
      ) : null}
    </View>
  );
}

export function RegisterPage() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <RegisterFlow key={String(id ?? "")} />;
}

function RegisterFlow() {
  const { styles, colors } = useStyles();
  const { t, language } = useJourneyT();
  const router = useRouter();
  const toast = useToast();
  const api = useJourneyApi();
  const params = useLocalSearchParams<{ id?: string; replay?: string; to?: string }>();
  const eventId = String(params.id ?? "");
  const detail = `/events/${encodeURIComponent(eventId)}`;
  const noKeyboard = addDesignMock("no-keyboard");
  const [event, setEvent] = useState<EventOverviewResponse | null>(null);
  const [answers, setAnswers] = useState<EventJoinAnswer[]>([]);
  const [step, setStep] = useState<EventJoinStep | null>(null);
  const [profile, setProfile] = useState<EventJoinProfile | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [free, setFree] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<EventJoinResult | null>(null);
  // 新报名还是改资料：进页先读 join/current 确定（null = 还没读到，不提问、不能提交），之后不再变（同 Web）。
  const [mode, setMode] = useState<"new" | "edit" | null>(null);
  const editing = mode === "edit";
  const [blocked, setBlocked] = useState<"joinCancelled" | "joinClosed" | "joinLocked" | "joinRejected" | null>(null);
  // 改资料：上次每一答的题（按字段）；queue = 这之后还要答的（主办方新加的必答题等）；optional = 自己点「编辑」打开的，可以不答就回去。
  const [asked, setAsked] = useState<Record<string, AskedQuestion>>({});
  const [queue, setQueue] = useState<readonly EventJoinQuestion[]>([]);
  const [optional, setOptional] = useState(false);
  /** Fields answered again on this page: a re-read (the language changed) keeps them. */
  const touched = useRef(new Set<string>());
  // 申込完了直後：主催者の連絡先（ID がある時だけ）を自動で開く。閉じても完了ページのカードに残る。
  const [contactOpen, setContactOpen] = useState(false);
  // 2026-11-27（同 Web）：报名成功时服务端已写入日历（result.calendar）；完成页只告知，可「移除」/「添加」。
  const [calendar, setCalendar] = useState<{ state: "added" | "removed" | "none"; title: string; final: boolean } | null>(null);
  const settle = useCallback((done: EventJoinResult) => {
    const written = done.calendar;
    setCalendar(written ? { final: written.final, state: "added", title: written.title } : { final: done.status === "registered", state: "none", title: done.tentative?.title ?? "" });
  }, []);
  const [intro, setIntro] = useState<string | null>(null);
  // 2026-11-27（同 Web）：主办方开了「已加群自动通过」时确认页的必答题；问不问由服务端定（新报名，或审核中的人改资料时）。
  const [wechat, setWechat] = useState<EventJoinWechatAnswer | null>(null);
  const [editingIntro, setEditingIntro] = useState(false);
  const [why, setWhy] = useState(false);
  // 自我介绍草稿：running = 正在写（不能报名、不能改介绍）；failed = 失败或超时（可以自己写，也可以直接报名）。改资料不写草稿。
  const [drafting, setDrafting] = useState<"idle" | "running" | "failed">("idle");
  const draftRun = useRef(0);
  const freeRef = useRef<TextInput | null>(null);
  // The API speaks the screen language: changing it asks the current question again in the new one and keeps the answers given.
  const given = useRef({ answers, asked, intro, mode, submitted: false });
  given.current = { answers, asked, intro, mode, submitted: Boolean(result) };
  const [loadFailed, setLoadFailed] = useState(false);
  // What the profile already says is selected from the start (2026-11-25, as Web); it can be unselected like any option.
  const showStep = useCallback((next: EventJoinStep) => { setStep(next); setSelected([...(next.question?.prefill ?? [])]); }, []);
  const [attempt, setAttempt] = useState(0);
  // Only the latest draft counts, and only within the time allowed: what arrives later is dropped, so the page never changes
  // under the person after it has offered them to write or apply.
  const announced = useRef<typeof drafting>("idle");
  const tRef = useRef(t); tRef.current = t;
  useEffect(() => {
    // VoiceOver hears the change: started, done, or that it could not be written.
    if (announced.current === drafting) return;
    announced.current = drafting;
    const said = drafting === "running" ? "introDrafting" : drafting === "failed" ? "introDraftFailed" : "introDrafted";
    AccessibilityInfo.announceForAccessibility(tRef.current(said));
  }, [drafting]);
  // 答完后 AI 写自我介绍：写好之前确认页说「正在写」，不能报名、不能改介绍。已经有介绍（写过或本人改过）就不再写（同 Web）。
  // 最多等 INTRO_DRAFT_TIMEOUT_MS；没写成 / 超时 → 资料里的介绍或空，并说明可以自己写或直接报名。超时后才回来的 AI 稿，介绍还空着就放进去。
  const draftIntro = useCallback(async (answered: readonly EventJoinAnswer[]) => {
    if (given.current.intro !== null) return;
    const run = ++draftRun.current;
    setDrafting("running");
    const take = (drafted: Awaited<ReturnType<typeof api.joinProfile>>) => {
      if (drafted.ok) setProfile(drafted.data);
      const self = drafted.ok ? drafted.data.selfIntro : null;
      setIntro(self?.text ?? "");
      setDrafting(self?.source === "ai_draft" ? "idle" : "failed");
    };
    const request = api.joinProfile(eventId, answered, true);
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Tests shorten the wait through window.orbitIntroDraftTimeoutMs.
    const limit = (globalThis as { orbitIntroDraftTimeoutMs?: number }).orbitIntroDraftTimeoutMs ?? INTRO_DRAFT_TIMEOUT_MS;
    const first = await Promise.race([request, new Promise<"timeout">((resolve) => { timer = setTimeout(() => resolve("timeout"), limit); })]);
    clearTimeout(timer);
    if (run !== draftRun.current) return;
    if (first !== "timeout") { take(first); return; }
    setIntro("");
    setDrafting("failed");
    const late = await request;
    if (run === draftRun.current && given.current.intro === "" && late.ok && late.data.selfIntro?.source === "ai_draft") take(late);
  }, [api, eventId]);
  const showEdit = useCallback((list: readonly EventJoinQuestion[], answered: readonly EventJoinAnswer[], byChoice: boolean) => {
    const [first, ...rest] = list;
    setQueue(rest);
    setOptional(byChoice && Boolean(first));
    showStep({ done: !first, index: 1, question: first ?? null, remainingMinutes: 0, total: 1 });
    setFree(first && !first.options.length ? answered.find((item) => item.field === first.field)?.answer ?? "" : "");
  }, [showStep]);
  const openEdit = useCallback(async (mine: EventJoinCurrent, live: () => boolean) => {
    const kept = given.current.answers.filter((item) => touched.current.has(item.field));
    const stored = mine.answers.map(({ answer, field, prompt, questionToken }) => kept.find((item) => item.field === field) ?? { answer, field, prompt, questionToken });
    const answered = [...stored, ...kept.filter((item) => !stored.some((other) => other.field === item.field))];
    const keptQuestions = Object.entries(given.current.asked).filter(([field]) => touched.current.has(field));
    const read = await api.joinProfile(eventId, answered, false, true);
    // Answered on meanwhile: that answer stays, and its own read follows.
    if (!live() || kept.length !== given.current.answers.filter((item) => touched.current.has(item.field)).length) return;
    setAnswers(answered);
    setAsked(Object.fromEntries([...mine.answers.map((item) => [item.field, { item: item.item, question: item.question }] as const), ...mine.ask.map(({ item, ...question }) => [question.field, { item, question }] as const), ...keptQuestions]));
    setIntro((current) => current ?? mine.selfIntro ?? "");
    if (read.ok) setProfile(read.data);
    showEdit(mine.ask.filter((item) => !touched.current.has(item.field)).map(({ item: _item, ...question }) => question), answered, false);
  }, [api, eventId, showEdit]);

  useEffect(() => {
    let live = true;
    const before = given.current;
    if (before.submitted) return;
    void api.overview(eventId).then((res) => { if (live && res.ok) setEvent(res.data); });
    const replay = addDesignMock("open-path") && params.replay ? params.replay.split("|").map((group) => group.split(",").filter(Boolean)) : null;
    void (async () => {
      setLoadFailed(false);
      let mode = before.mode;
      if (mode !== "new") {
        const mine = await api.joinCurrent(eventId);
        if (!live) return;
        if (!mine.ok) { if (!mode) setLoadFailed(true); return; }
        if (mine.data.blocked) { setBlocked(REFUSAL[mine.data.blocked] ?? "joinClosed"); return; }
        const held = mine.data.status === "registered" || mine.data.status === "pending_review" || mine.data.status === "waitlisted";
        // Settled once: what it is now is told on sending.
        if (mode && !held) return;
        mode = held ? "edit" : "new";
        setMode(mode);
        if (held) { await openEdit(mine.data, () => live); return; }
      }
      const first = await api.joinNext(eventId, before.answers);
      if (!live) return;
      if (!first.ok) { setLoadFailed(true); return; }
      let current = first.data;
      let answered: EventJoinAnswer[] = [...before.answers];
      let picked: string[] | null = null;
      // 开发回放：依次回答，最后一组按 `to` 决定只选中（select）还是也提交。
      if (replay) {
        const submitAll = params.to === "review" || params.to === "done";
        for (const [index, group] of replay.entries()) {
          const question = current.question;
          if (!question) break;
          if (index === replay.length - 1 && !submitAll) { picked = group; break; }
          answered = [...answered, { answer: group.join(" · "), field: question.field, prompt: question.prompt, questionToken: question.questionToken }];
          const next = await api.joinNext(eventId, answered);
          if (!next.ok) break;
          current = next.data;
        }
      }
      const shown = await api.joinProfile(eventId, answered, false);
      // Answered on meanwhile: this answer is about an earlier question.
      if (!live || given.current.answers !== before.answers) return;
      setAnswers(answered);
      showStep(current);
      if (picked) setSelected(picked);
      if (shown.ok) setProfile(shown.data);
      if (current.done) await draftIntro(answered);
      if (!live) return;
      if (replay && params.to === "done" && current.done) {
        const res = await api.joinSubmit(eventId, answered, given.current.intro?.trim().slice(0, 400) || undefined);
        if (live && res.ok) { setResult(res.data); settle(res.data); setContactOpen(shouldOpenHostContact(res.data.hostContact)); }
      }
    })();
    return () => { live = false; };
  }, [api, eventId, params.replay, params.to, attempt, showStep, openEdit, draftIntro, settle]);

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
    const answer = { answer: value, field: question.field, prompt: question.prompt, questionToken: question.questionToken };
    if (editing) {
      // 改资料：只换这一答，其余原样；不再往下问，也不重写介绍。
      const changed = answers.some((item) => item.field === answer.field) ? answers.map((item) => (item.field === answer.field ? answer : item)) : [...answers, answer];
      const picked = question.options.length ? [...selected, free.trim()].filter(Boolean) : [];
      touched.current.add(answer.field);
      setAnswers(changed);
      setAsked((list) => ({ ...list, [answer.field]: { item: list[answer.field]?.item ?? ITEM_OF_FIELD[answer.field] ?? null, question: { ...question, options: [...new Set([...picked, ...question.options])].slice(0, 12), ...(picked.length ? { prefill: picked } : {}) } } }));
      showEdit(queue, changed, optional);
      setBusy(true);
      const read = await api.joinProfile(eventId, changed, false, true);
      if (read.ok) setProfile(read.data);
      setBusy(false);
      return;
    }
    const next = [...answers, answer];
    setBusy(true);
    const [nextStep, nextProfile] = await Promise.all([api.joinNext(eventId, next), api.joinProfile(eventId, next, false)]);
    // 成功才记下这一答（失败时题目不变、选项保留，重答不会带着同一个 questionToken 重复入列）。
    if (!nextStep.ok) { toast.error(t("submitFailed")); setBusy(false); return; }
    setAnswers(next); setFree("");
    showStep(nextStep.data);
    if (nextProfile.ok) setProfile(nextProfile.data);
    setBusy(false);
    if (nextStep.data.done) await draftIntro(next);
  };
  // 确认页「追加 / 補う / 編集」：只问那一项（可选入口；2026-11-27 起 5 题问完不再追问，同 Web 8e0a5ff3a）。
  const askMore = async (focus: EventJoinProfileItemKey) => {
    setBusy(true);
    const res = await api.joinNext(eventId, answers, true, focus);
    setBusy(false);
    if (res.ok) { showStep(res.data); if (editing) setOptional(Boolean(res.data.question)); } else toast.error(t("submitFailed"));
  };
  const editItem = (key: EventJoinProfileItemKey) => {
    const list = answers.flatMap((item) => (asked[item.field]?.item === key ? [asked[item.field]!.question] : []));
    if (list.length) showEdit(list, answers, true); else void askMore(key);
  };
  const apply = async () => {
    if (!mode || busy || drafting === "running" || (profile?.wechatCheck && !wechat)) return;
    setBusy(true);
    // The introduction on the review page goes with the registration, edited or not: the event's other attendees see it, and
    // one that is not sent is cleared on the server.
    const confirmed = (intro ?? profile?.selfIntro?.text ?? "").trim().slice(0, 400);
    const res = await api.joinSubmit(eventId, answers, confirmed || undefined, editing, profile?.wechatCheck ? wechat : null);
    setBusy(false);
    if (res.ok) { setResult(res.data); settle(res.data); setContactOpen(!editing && shouldOpenHostContact(res.data.hostContact)); announceEventChanged(eventId); return; }
    const refusal = res.code ? REFUSAL[res.code] : undefined;
    if (refusal && refusal !== "joinCancelled") { setBlocked(refusal); return; }
    toast.error(t(refusal ?? "submitFailed"));
    // Cancelled meanwhile (another device): start over as a new registration.
    if (refusal && editing) {
      touched.current.clear();
      setMode(null); setAnswers([]); setAsked({}); setQueue([]); setOptional(false); setStep(null); setProfile(null); setIntro(null); setEditingIntro(false); setSelected([]); setFree("");
      setAttempt((value) => value + 1);
    }
  };
  const addTentative = async () => {
    if (busy) return;
    setBusy(true);
    const res = await api.joinTentative(eventId);
    setBusy(false);
    if (res.ok) { setCalendar((current) => ({ final: current?.final ?? result?.status === "registered", state: "added", title: res.data.title || current?.title || "" })); announceEventChanged(eventId); } else toast.error(t("submitFailed"));
  };
  const removeCalendar = async () => {
    if (busy) return;
    setBusy(true);
    const res = await api.joinRemoveCalendar(eventId);
    setBusy(false);
    if (res.ok) { setCalendar((current) => (current ? { ...current, state: "removed" } : current)); announceEventChanged(eventId); } else toast.error(t("submitFailed"));
  };
  // × goes back to the detail it was opened from (a replace left a second detail in the stack); a deep link has none, so it opens the detail.
  const close = () => (router.canGoBack() ? router.back() : router.replace(detail as Href));

  if (result) {
    const submitted = tokyo(result.submittedAt);
    const reviewUntil = result.reviewUntil ?? profile?.reviewUntil ?? null;
    const pending = result.status === "pending_review";
    const contactLine = pending ? contactReviewLine(result.hostContact, event?.priceYen, t) : null;
    return (
      <JourneyPage key="done" title={t("doneTitle")} leftIcon="x" leftLabel={t("close")} fallback={detail} onLeft={close} testID="events-join-done">
        <View style={[styles.card, styles.doneHero]}>
          <View style={styles.popcheck}>
            <Svg width={38} height={38} viewBox="0 0 24 24" fill="none" stroke={colors.macTealInk} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              {designIcons.check.map((shape, index) => (shape.tag === "path" ? <Path key={index} d={shape.d} /> : null))}
            </Svg>
          </View>
          <UiText style={styles.doneTitle}>{t(editing ? "joinUpdated" : "received")}</UiText>
          <UiText style={[styles.lbl, { textAlign: "center" }]}>{`${event?.title ?? ""} · ${submitted ? t("dateTimeLong", { d: submitted.day, hm: `${submitted.hh}:${String(submitted.mm).padStart(2, "0")}`, m: submitted.month }) : ""}`}</UiText>
        </View>
        <View style={[styles.card, styles.gap]}>
          <View style={[styles.row, styles.between]}>
            <UiText style={styles.h3}>{t("statusNow")}</UiText>
            <View style={[styles.chip, { backgroundColor: pending ? colors.macLav : colors.macTeal }]}><UiText style={[styles.chipText, { color: pending ? colors.macLavInk : colors.macTealInk }]}>{pending ? t("statusReview") : t("statusConfirmed")}</UiText></View>
          </View>
          <View style={styles.steps4}>
            {(pending ? [
              { lines: [t("flowApply"), monthDaySlash(result.submittedAt)], state: "done" },
              { lines: [t("flowReview"), reviewUntil ? t("reviewBy", { date: monthDaySlash(reviewUntil) }) : null], state: "now" },
              { lines: [t("flowResult")], state: "" },
              { lines: [t("flowDay"), monthDaySlash(result.startsAt)], state: "" },
            ] : [
              // First come, first served: confirmed on applying, so no review and no result to wait for.
              { lines: [t("flowApply"), monthDaySlash(result.submittedAt)], state: "done" },
              { lines: [t("flowConfirmed")], state: "now" },
              { lines: [t("flowDay"), monthDaySlash(result.startsAt)], state: "" },
            ]).map((item) => (
              <View key={item.lines[0]} style={[styles.stepCell, item.state === "done" ? { borderTopColor: colors.plum500 } : item.state === "now" ? { borderTopColor: colors.plum700 } : null]}>
                <UiText style={[styles.stepText, item.state === "done" ? { color: colors.ink2 } : item.state === "now" ? { color: colors.ink, fontWeight: "800" } : null]}>{item.lines.filter(Boolean).join("\n")}</UiText>
              </View>
            ))}
          </View>
          {pending ? <UiText style={[styles.sub, { marginTop: 12 }]}>{contactLine ?? t("reviewWait")}</UiText> : null}
        </View>
        {result.hostContact !== undefined ? <HostContactCard contact={result.hostContact} t={t} style={styles.gap} /> : null}
        {/* 写日历：报名成功时已写入，这里只告知；「移除」= 删掉且以后不再自动加；移除后可「添加」回来。 */}
        {calendar && result.tentative && !editing ? (
          <View style={[styles.card, styles.gap, styles.confirm]} testID={`events-join-calendar-${calendar.state}`}>
            <View style={[styles.row, { gap: 8 }]}>
              <View style={[styles.emoSm, { backgroundColor: colors.macLav }]}><UiText style={styles.emoSmText}>📅</UiText></View>
              <UiText accessibilityLiveRegion="polite" style={styles.title13}>{t(calendar.state === "removed" ? "calRemoved" : calendar.state === "none" ? "calNotAdded" : calendar.final ? "calAdded" : "calAddedTentative")}</UiText>
            </View>
            <UiText style={[styles.sub, { marginBottom: 10, marginTop: 6 }]}>{t("calendarLineFinal", { range: eventRange(result.tentative.startsAt, result.tentative.endsAt, language), title: calendar.title || result.tentative.title })}</UiText>
            <View style={[styles.row, { gap: 8 }]}>
              {calendar.state === "added" ? (
                <>
                  <UiPressable accessibilityRole="button" accessibilityLabel={t("viewCalendar")} onPress={() => router.push("/schedule" as Href)} style={styles.btnSm} testID="events-join-calendar-view"><UiText style={styles.btnSmText}>{t("viewCalendar")}</UiText></UiPressable>
                  <UiPressable accessibilityRole="button" accessibilityLabel={t("removeIt")} disabled={busy} onPress={() => void removeCalendar()} style={styles.btnSm} testID="events-join-calendar-remove"><UiText style={styles.btnSmText}>{t("removeIt")}</UiText></UiPressable>
                </>
              ) : <UiPressable accessibilityRole="button" accessibilityLabel={t("addIt")} disabled={busy} onPress={() => void addTentative()} style={[styles.btnSm, styles.primary]} testID="events-join-calendar-add"><UiText style={[styles.btnSmText, { color: colors.bg }]}>{t("addIt")}</UiText></UiPressable>}
            </View>
          </View>
        ) : null}
        <UiPressable accessibilityRole="button" accessibilityLabel={t("editProfile")} onPress={() => router.push("/profile" as Href)} style={styles.ghostBlock}><UiText style={styles.ghostText}>{t("editProfile")}</UiText></UiPressable>
        <HostContactSheet visible={contactOpen} contact={result.hostContact} t={t} reviewLine={contactLine} onClose={() => setContactOpen(false)} />
      </JourneyPage>
    );
  }

  if (blocked) {
    return (
      <JourneyPage key="blocked" title={t("regTitle")} subtitle={event?.title ?? ""} leftIcon="x" leftLabel={t("close")} fallback={detail} onLeft={close} testID="events-join-blocked">
        <View style={styles.card}>
          <UiText style={styles.h3}>{t(blocked)}</UiText>
          <UiPressable accessibilityRole="button" accessibilityLabel={t("toDetail")} onPress={() => router.dismissTo(detail as Href)} style={[styles.btnSm, { alignSelf: "flex-start", marginTop: 12 }]}><UiText style={styles.btnSmText}>{t("toDetail")}</UiText></UiPressable>
        </View>
      </JourneyPage>
    );
  }

  if (reviewing) {
    const offerMissing = (profile?.items ?? []).some((item) => item.key === "offer" && !item.done);
    const coverage = profile?.coverage ?? 0;
    const shownIntro = intro ?? profile?.selfIntro?.text ?? "";
    const missing = (profile?.items ?? []).filter((item) => !item.done);
    const firstMissing = missing.find((item) => item.key === "target" || item.key === "offer") ?? missing[0];
    const applyLabel = t(drafting === "running" ? "introDrafting" : editing ? "joinSave" : "applyNow");
    const wechatNeeded = Boolean(profile?.wechatCheck) && !wechat;
    return (
      <View style={styles.flex1}>
      <JourneyPage key="review" title={t("profileTitle")} subtitle={editing ? event?.title ?? "" : t("draftedByAi")} leftIcon="x" leftLabel={t("close")} fallback={detail} onLeft={close} testID="events-join-review">
        <View style={styles.card}>
          <View style={[styles.row, { gap: 16 }]}>
            <ScoreRing size={96} stroke={9} value={coverage} color={colors.plum700} label={`${coverage}%`} fontSize={22}>
              <View style={{ alignItems: "center" }}>
                <UiText style={styles.covNum}>{coverage}<UiText style={styles.covPct}>%</UiText></UiText>
                <UiText style={styles.covLbl}>{t("coverage")}</UiText>
              </View>
            </ScoreRing>
            <View style={styles.items}>
              {(profile?.items ?? []).map((item) => (
                <View key={item.key} style={[styles.row, { gap: 6 }]}>
                  <UiText style={[styles.mark, { color: item.done ? colors.ok : colors.coral }]}>{item.done ? "✓" : "△"}</UiText>
                  <View style={styles.fill}>
                    <UiText style={[styles.itemText, item.done ? null : { color: colors.ink3 }]}>{t(ITEM_LABEL[item.key])}</UiText>
                    {item.fromProfile ? <UiText style={styles.lbl} testID={`events-join-from-profile-${item.key}`}>{t("itemFromProfile")}</UiText> : null}
                  </View>
                  {item.fromProfile ? <UiPressable accessibilityRole="button" accessibilityLabel={`${t("edit")} ${t(ITEM_LABEL[item.key])}`} disabled={busy} onPress={() => void askMore(item.key)} style={styles.btnXs}><UiText style={styles.btnXsText}>{t("edit")}</UiText></UiPressable>
                    : editing && item.done && item.key !== "company" ? <UiPressable accessibilityRole="button" accessibilityLabel={`${t("edit")} ${t(ITEM_LABEL[item.key])}`} disabled={busy} onPress={() => editItem(item.key)} style={styles.btnXs}><UiText style={styles.btnXsText}>{t("edit")}</UiText></UiPressable> : null}
                  {item.done ? null : <UiPressable accessibilityRole="button" accessibilityLabel={t("add")} disabled={busy} onPress={() => void askMore(item.key)} style={styles.btnXs} testID={`events-join-add-${item.key}`}><UiText style={styles.btnXsText}>{t("add")}</UiText></UiPressable>}
                </View>
              ))}
              {/* 改资料：主办方的其他问题（不属于任何一项）各占一行。 */}
              {(editing ? answers : []).flatMap((item) => {
                const own = asked[item.field];
                return own && own.item === null ? [
                  <View key={item.field} style={[styles.row, { gap: 6 }]} testID={`events-join-edit-${item.field}`}>
                    <UiText style={[styles.mark, { color: colors.ok }]}>✓</UiText>
                    <View style={styles.fill}><UiText style={styles.itemText}>{own.question.prompt}</UiText></View>
                    <UiPressable accessibilityRole="button" accessibilityLabel={`${t("edit")} ${own.question.prompt}`} disabled={busy} onPress={() => showEdit([own.question], answers, true)} style={styles.btnXs}><UiText style={styles.btnXsText}>{t("edit")}</UiText></UiPressable>
                  </View>,
                ] : [];
              })}
            </View>
          </View>
          {offerMissing ? <UiText style={[styles.lbl, { marginTop: 10 }]}>{t("offerHint")}</UiText> : null}
        </View>
        <View style={[styles.card, styles.gap]}>
          {/* Topics come from the answers; the old 编辑 / ＋添加 were plain text that did nothing, so they are gone. */}
          <View style={styles.cardH}><UiText style={styles.h3}>{t("topicsLbl")}</UiText></View>
          <View style={styles.chips}>
            {(profile?.topics ?? []).map((topic) => <View key={topic} style={[styles.chip, { backgroundColor: colors.macLav }]}><UiText style={[styles.chipText, { color: colors.macLavInk }]}>{topic}</UiText></View>)}
          </View>
        </View>
        <View style={[styles.card, styles.gap]}>
          <View style={styles.cardH}>
            <View style={[styles.row, { gap: 8 }]}><UiText style={styles.h3}>{t("introLbl")}</UiText><UiText style={styles.lbl}>{t("introShown")}</UiText></View>
            <View style={[styles.row, { gap: 6 }]}>
              {profile?.selfIntroBasis ? <UiPressable accessibilityRole="button" accessibilityLabel={t("introWhy")} accessibilityState={{ expanded: why }} onPress={() => setWhy((value) => !value)} style={styles.why}><UiText style={styles.whyText}>?</UiText></UiPressable> : null}
              <UiPressable accessibilityRole="button" accessibilityLabel={t("edit")} disabled={drafting === "running"} accessibilityState={{ disabled: drafting === "running" }} onPress={() => setEditingIntro((value) => !value)} style={[styles.lbtn, drafting === "running" ? styles.blockWait : null]}><Icon name="pen" size={16} color={colors.ink2} /></UiPressable>
            </View>
          </View>
          {drafting === "running" ? (
            <View testID="events-join-intro-drafting" accessibilityState={{ busy: true }}>
              <Bones><Bone h={14} /><Bone w="88%" h={14} style={{ marginTop: 9 }} /><Bone w="62%" h={14} style={{ marginTop: 9 }} /></Bones>
            </View>
          ) : editingIntro ? (
            <TextInput value={shownIntro} onChangeText={setIntro} multiline maxLength={400} accessibilityLabel={t("introLbl")} style={styles.textarea} />
          ) : <UiText style={styles.introText}>{shownIntro}</UiText>}
          {drafting === "idle" ? null : <UiText accessibilityLiveRegion="polite" style={[styles.lbl, { marginTop: 8 }]} testID={drafting === "running" ? "events-join-intro-status" : "events-join-intro-failed"}>{t(drafting === "running" ? "introDrafting" : "introDraftFailed")}</UiText>}
          {why && profile?.selfIntroBasis ? <View style={styles.whyBody}><UiText style={styles.whyBodyText}>{profile.selfIntroBasis}</UiText></View> : null}
        </View>
        <View style={[styles.card, styles.gap, styles.flat]}>
          <UiText style={[styles.lbl, { marginBottom: 8 }]}>{t("visibilityTitle")}</UiText>
          <View style={[styles.row, { gap: 8 }]}><View style={[styles.chip, { backgroundColor: colors.macTeal }]}><UiText style={[styles.chipText, { color: colors.macTealInk }]}>{t("visAll")}</UiText></View><UiText style={[styles.sub, styles.fill]}>{t("visAllFields")}</UiText></View>
        </View>
        {profile?.wechatCheck ? (
          <>
            <View style={[styles.card, styles.gap]} testID={`events-join-wechat-${wechat ?? "unanswered"}`}>
              <UiText style={styles.h3}>{t("wechatQ")}</UiText>
              <View accessibilityRole="radiogroup" accessibilityLabel={t("wechatQ")} style={[styles.row, styles.wechatOpts]}>
                {(["joined", "not_yet"] as const).map((value) => {
                  const on = wechat === value;
                  return <UiPressable key={value} accessibilityRole="radio" accessibilityLabel={t(value === "joined" ? "wechatJoined" : "wechatNotYet")} accessibilityState={{ checked: on }} onPress={() => setWechat(value)} style={[styles.opt, styles.optInCard, on ? styles.optOn : null]} testID={`events-join-wechat-option-${value}`}><UiText style={[styles.optText, on ? { color: colors.ink } : null]}>{t(value === "joined" ? "wechatJoined" : "wechatNotYet")}</UiText></UiPressable>;
                })}
              </View>
              {wechat === "not_yet" ? <UiText style={[styles.sub, { marginTop: 10 }]} testID="events-join-wechat-note">{t("wechatNotYetLine")}</UiText> : null}
            </View>
            {wechat === "not_yet" && profile.hostContact !== undefined ? <HostContactCard contact={profile.hostContact} t={t} style={styles.gap} /> : null}
          </>
        ) : null}
        {/* 底部固定区的高度：卡片能滚到它上面。 */}
        <View style={{ height: 70 }} />
      </JourneyPage>
      {/* b2 regPersona（同 Web 手机版 .pFoot）：主按钮固定在底部（整宽 48、深色），上面一行就绪提示（中性色；缺项不拦报名，「补上」只问那一项），下面一行编辑期限。 */}
      <FadeFoot testID="events-join-foot">
        {wechatNeeded ? <UiText accessibilityLiveRegion="polite" style={[styles.readyText, { textAlign: "center" }]} testID="events-join-wechat-hint">{t("wechatPickFirst")}</UiText> : profile ? (coverage >= 100 ? (
          <View style={[styles.row, styles.ready]} accessibilityRole="text" accessibilityLiveRegion="polite" testID="events-join-ready-done">
            <Icon name="check" size={16} color={colors.ok} /><UiText style={[styles.readyText, { color: colors.ok }]}>{t("readyAll")}</UiText>
          </View>
        ) : (
          <View style={[styles.row, styles.ready]} accessibilityLiveRegion="polite" testID="events-join-ready-missing">
            <UiText style={styles.readyText}>{t("readyMissing", { n: missing.length })}</UiText>
            {firstMissing ? <UiPressable accessibilityRole="button" accessibilityLabel={t("fillIn")} disabled={busy} onPress={() => void askMore(firstMissing.key)} testID={`events-join-fill-${firstMissing.key}`}><UiText style={styles.textLink}>{t("fillIn")}</UiText></UiPressable> : null}
          </View>
        )) : null}
        <UiPressable accessibilityRole="button" accessibilityLabel={applyLabel} accessibilityState={{ disabled: busy || drafting === "running" || wechatNeeded }} disabled={busy || drafting === "running" || wechatNeeded} onPress={() => void apply()} style={[styles.block48, styles.footBtn, drafting === "running" || wechatNeeded ? styles.blockWait : null]} testID="events-join-apply"><UiText style={styles.primaryText}>{applyLabel}</UiText></UiPressable>
        {profile?.editableUntil ? <UiText style={[styles.lbl, { textAlign: "center" }]}>{t("editableUntil", { date: monthDaySlash(profile.editableUntil) })}</UiText> : null}
      </FadeFoot>
      </View>
    );
  }

  const nextLabel = selected.length > 1 ? t("nextChosen", { n: selected.length }) : t("next");
  return (
    <JourneyPage key="chat" title={t(editing ? "profileTitle" : "regTitle")} subtitle={event?.title ?? ""} leftIcon={optional ? "left" : "x"} leftLabel={t(optional ? "back" : "close")} fallback={detail} onLeft={optional ? () => showEdit([], answers, false) : close} footerRadius={26} followEnd testID="events-join-chat"
      footer={question ? (
        <>
          <TextInput ref={freeRef} value={free} onChangeText={setFree} placeholder={t("freeAnswer")} placeholderTextColor={colors.ink3} accessibilityLabel={t("freeAnswer")} showSoftInputOnFocus={!noKeyboard} onSubmitEditing={() => void submitAnswer()} style={styles.composerIn} />
          <UiPressable accessibilityRole="button" accessibilityLabel={t("voiceAnswer")} onPress={() => freeRef.current?.focus()} style={styles.lbtn}><Icon name="mic" size={16} color={colors.ink2} /></UiPressable>
          <UiPressable accessibilityRole="button" accessibilityLabel={nextLabel} disabled={busy || (!selected.length && !free.trim())} onPress={() => void submitAnswer()} style={[styles.btnSm, styles.primary]} testID="events-join-next"><UiText style={[styles.btnSmText, { color: colors.bg }]}>{nextLabel}</UiText></UiPressable>
        </>
      ) : undefined}>
      {loadFailed && !step && event && Date.parse(event.registrationClosesAt ?? event.endsAt ?? event.startsAt) < Date.now() ? (
        // 报名已截止 / 活动已结束：说清楚，不给「再试一次」。
        <View style={styles.card} testID="events-join-closed"><UiText style={styles.h3}>{t("joinClosed")}</UiText></View>
      ) : loadFailed && !step ? (
        <View style={styles.card} testID="events-join-error">
          <UiText style={styles.h3}>{t("regLoadFailed")}</UiText>
          <UiPressable accessibilityRole="button" accessibilityLabel={t("retryLoad")} onPress={() => setAttempt((value) => value + 1)} style={[styles.btnSm, { alignSelf: "flex-start", marginTop: 12 }]}><UiText style={styles.btnSmText}>{t("retryLoad")}</UiText></UiPressable>
        </View>
      ) : null}
      {step && !editing ? (
        <View>
          <View style={[styles.row, styles.between]}>
            <UiText style={styles.lbl}><UiText style={[styles.lbl, { color: colors.ink, fontWeight: "700" }]}>{t("regQ", { i: step.index })}</UiText>{t("regOfN", { n: total })}</UiText>
            <UiText style={styles.lbl}>{t("regRemain", { m: step.remainingMinutes })}</UiText>
          </View>
          <ProgressBar share={Math.max(0, step.index) / total} />
        </View>
      ) : null}
      {step && !editing ? <View style={styles.prefill}><UiText style={styles.prefillText}>{t("regPrefilledLine")}</UiText></View> : null}
      <View style={styles.chatcol}>
        {(editing ? [] : answers).map((item, index) => (
          <View key={`${item.field}-${index}`} style={styles.chatcol}>
            <View style={[styles.bubble, styles.ai]}><UiText style={styles.bubbleText}>{item.prompt}</UiText></View>
            <View style={[styles.bubble, styles.me]}><UiText style={[styles.bubbleText, { color: colors.bg }]}>{item.answer}</UiText></View>
          </View>
        ))}
        {question ? (
          <>
            <View style={[styles.bubble, styles.ai]}>
              <UiText style={[styles.bubbleText, { fontWeight: "700" }]}>{question.prompt}</UiText>
              {question.help ? <UiText style={[styles.lbl, { marginTop: 3 }]}>{question.help}</UiText> : null}
            </View>
            <View style={styles.opts}>
              {question.options.map((option) => {
                const on = selected.includes(option);
                return <UiPressable key={option} accessibilityRole="button" accessibilityLabel={option} accessibilityState={{ selected: on }} onPress={() => toggle(option)} style={[styles.opt, on ? styles.optOn : null]}><UiText style={[styles.optText, on ? { color: colors.ink } : null]}>{option}</UiText></UiPressable>;
              })}
              {question.allowCustom ? <UiPressable accessibilityRole="button" accessibilityLabel={t("otherOption")} onPress={() => freeRef.current?.focus()} style={styles.opt}><UiText style={styles.optText}>{t("otherOption")}</UiText></UiPressable> : null}
            </View>
          </>
        ) : null}
      </View>
    </JourneyPage>
  );
}

// kit（b2 #20–#22）：.bar 6 · .mac 12 r16 · .bubble 11/14 r18（尾角 6）13 · .opt 8/13 12.5 · .composer r26 · .popcheck 76 · .steps4 · .confirm-card 虚线。
const useStyles = createThemedStyles((colors) => StyleSheet.create({
  row: { alignItems: "center", flexDirection: "row", gap: 10 },
  between: { justifyContent: "space-between" },
  fill: { flex: 1 },
  gap: { marginTop: 14 },
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: 18 },
  flat: { backgroundColor: colors.surface2 },
  lbl: { color: colors.ink3, fontSize: 13, fontWeight: "500", lineHeight: 20 },
  sub: { color: colors.ink2, fontSize: 15, lineHeight: 23 },
  h3: { color: colors.ink, fontSize: 17, fontWeight: "800", lineHeight: 25 },
  more: { color: colors.ink3, fontSize: 14, fontWeight: "600", lineHeight: 21 },
  cardH: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
  title13: { color: colors.ink, fontSize: 15, fontWeight: "700", lineHeight: 22 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { alignItems: "center", alignSelf: "flex-start", backgroundColor: colors.surface2, borderRadius: radius.pill, flexDirection: "row", paddingHorizontal: 9, paddingVertical: 3 },
  chipText: { color: colors.ink2, fontSize: 13, fontWeight: "700", lineHeight: 20 },
  // kit .bar margin 8 0 4：下边距与 .mac 的 14 折叠，不另加。
  bar: { backgroundColor: colors.surface3, borderRadius: 6, height: 6, marginTop: 8 },
  barFill: { borderRadius: 6, bottom: 0, left: 0, position: "absolute", top: 0 },
  knob: { backgroundColor: colors.surface, borderColor: colors.plum700, borderRadius: 7, borderWidth: 3, height: 14, marginTop: -7, position: "absolute", right: -7, top: 3, width: 14 },
  prefill: { backgroundColor: colors.macTeal, borderRadius: 16, marginVertical: 14, padding: 12 },
  prefillText: { color: colors.ink, fontSize: 14, lineHeight: 21 },
  chatcol: { gap: 10 },
  bubble: { borderRadius: 18, maxWidth: "86%", paddingHorizontal: 14, paddingVertical: 11 },
  ai: { alignSelf: "flex-start", backgroundColor: colors.surface, borderBottomLeftRadius: 6 },
  me: { alignSelf: "flex-end", backgroundColor: colors.ink, borderBottomRightRadius: 6 },
  bubbleText: { color: colors.ink, fontSize: 15, lineHeight: 24 },
  opts: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  opt: { backgroundColor: colors.surface, borderColor: "transparent", borderRadius: radius.pill, borderWidth: 1.5, paddingHorizontal: 13, paddingVertical: 8 },
  optOn: { backgroundColor: colors.accentSoft, borderColor: colors.plum500 },
  optText: { color: colors.ink2, fontSize: 15, fontWeight: "700", lineHeight: 23 },
  composerIn: { color: colors.ink, flex: 1, fontSize: 15, height: 34, minWidth: 0, padding: 0, paddingLeft: 6 },
  lbtn: { alignItems: "center", backgroundColor: colors.surface2, borderRadius: radius.pill, height: 34, justifyContent: "center", width: 34 },
  btnSm: { alignItems: "center", backgroundColor: colors.surface2, borderRadius: radius.pill, height: 32, justifyContent: "center", paddingHorizontal: 12 },
  btnSmText: { color: colors.ink, fontSize: 14, fontWeight: "700", lineHeight: 21 },
  primary: { backgroundColor: colors.ink },
  btnXs: { alignItems: "center", backgroundColor: colors.surface2, borderRadius: radius.pill, height: 24, justifyContent: "center", paddingHorizontal: 9 },
  btnXsText: { color: colors.ink, fontSize: 13, fontWeight: "700", lineHeight: 20 },
  covNum: { color: colors.ink, fontFamily: Platform.OS === "ios" ? "ui-rounded" : undefined, fontSize: 24, fontWeight: "800", lineHeight: 26 },
  covPct: { fontSize: 13 },
  covLbl: { color: colors.ink3, fontSize: 12, fontWeight: "500", lineHeight: 13 },
  items: { flex: 1, gap: 5 },
  mark: { fontSize: 15, fontWeight: "800", lineHeight: 23, width: 12 },
  itemText: { color: colors.ink, fontSize: 15, lineHeight: 23 },
  why: { alignItems: "center", backgroundColor: colors.surface2, borderRadius: radius.pill, height: 18, justifyContent: "center", width: 18 },
  whyText: { color: colors.ink3, fontSize: 12, fontWeight: "800", lineHeight: 15 },
  whyBody: { backgroundColor: colors.surface2, borderRadius: 14, marginTop: 10, paddingHorizontal: 12, paddingVertical: 10 },
  whyBodyText: { color: colors.ink2, fontSize: 14, lineHeight: 23 },
  introText: { color: colors.ink, fontSize: 16, lineHeight: 28 },
  textarea: { backgroundColor: colors.surface2, borderRadius: 14, color: colors.ink, fontSize: 16, lineHeight: 28, minHeight: 96, paddingHorizontal: 12, paddingVertical: 10, textAlignVertical: "top" },
  blockWait: { opacity: 0.45 },
  block48: { alignItems: "center", backgroundColor: colors.ink, borderRadius: radius.pill, height: 48, justifyContent: "center", marginTop: 14 },
  primaryText: { color: colors.bg, fontSize: 15, fontWeight: "700", lineHeight: 22 },
  flex1: { flex: 1 },
  wechatOpts: { flexWrap: "wrap", gap: 8, marginTop: 12 },
  // 白卡片里的选项：浅灰底才看得出是按钮（选中后照常 accentSoft + 描边）。
  optInCard: { backgroundColor: colors.surface2, paddingHorizontal: 18, paddingVertical: 10 },
  footBtn: { marginTop: 0 },
  // .pReady：居中、gap 6、ink-2 粗体（2026-11-27 起不用珊瑚色）；满分时 ok 色带对勾。
  ready: { gap: 6, justifyContent: "center" },
  readyText: { color: colors.ink2, fontSize: 14, fontWeight: "700", lineHeight: 21 },
  textLink: { color: colors.ink, fontSize: 14, fontWeight: "700", lineHeight: 21, textDecorationLine: "underline" },
  doneHero: { alignItems: "center", paddingHorizontal: 18, paddingVertical: 26 },
  popcheck: { alignItems: "center", backgroundColor: colors.macTeal, borderRadius: radius.pill, height: 76, justifyContent: "center", width: 76 },
  doneTitle: { color: colors.ink, fontSize: 20, fontWeight: "800", lineHeight: 30, marginTop: 14, textAlign: "center" },
  steps4: { flexDirection: "row", gap: 4, marginTop: 12 },
  stepCell: { borderTopColor: colors.surface3, borderTopWidth: 4, flex: 1, paddingTop: 8 },
  stepText: { color: colors.ink3, fontSize: 13, fontWeight: "600", lineHeight: 20 },
  confirm: { backgroundColor: "transparent", borderColor: colors.plum300, borderRadius: 20, borderStyle: "dashed", borderWidth: 1.5 },
  emoSm: { alignItems: "center", borderRadius: 10, height: 32, justifyContent: "center", width: 32 },
  emoSmText: { fontSize: 19, lineHeight: 25 },
  ghostBlock: { alignItems: "center", borderRadius: radius.pill, height: 40, justifyContent: "center" },
  ghostText: { color: colors.ink2, fontSize: 15, fontWeight: "700", lineHeight: 22 },
}));

/** .pFoot：固定在底部，padding 22 18 14+安全区、gap 8，底色从透明渐变到 bg（28%）。 */
function FadeFoot({ children, testID }: { children: ReactNode; testID?: string }) {
  const { colors } = useStyles();
  const [size, setSize] = useState({ h: 0, w: 0 });
  return (
    <View style={footStyles.foot} pointerEvents="box-none" testID={testID} onLayout={(event) => setSize({ h: event.nativeEvent.layout.height, w: event.nativeEvent.layout.width })}>
      {size.w > 0 ? (
        <Svg width={size.w} height={size.h} style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs><LinearGradient id="joinFoot" x1={0} y1={0} x2={0} y2={size.h} gradientUnits="userSpaceOnUse"><Stop offset={0} stopColor={colors.bg} stopOpacity={0} /><Stop offset={0.28} stopColor={colors.bg} stopOpacity={1} /></LinearGradient></Defs>
          <Rect x={0} y={0} width={size.w} height={size.h} fill="url(#joinFoot)" />
        </Svg>
      ) : null}
      {children}
    </View>
  );
}

const footStyles = StyleSheet.create({
  foot: { bottom: 0, gap: 8, left: 0, paddingBottom: 30, paddingHorizontal: 18, paddingTop: 22, position: "absolute", right: 0 },
});
