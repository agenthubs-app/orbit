// R27 参加登録（App；b2 #20 質問 3/5 · #21 参加用プロフィール確認 · #22 申込完了）。
// 数据：/api/events/[id]/join/*（问题 = 现有 AI 访谈 ≤5 问；资料按规则实时更新，只在问完时生成自己紹介草稿）。与 Web RegisterFlow 同一套接口与文案。
// 门禁开发开关 open-path 下可带 `?replay=答1|答2a,答2b|答3a,答3b&to=select|review|done` 自动答到指定状态（画板从不画点击过程）。
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, TextInput, View } from "react-native";

import type { EventJoinAnswer, EventJoinProfile, EventJoinProfileItemKey, EventJoinResult, EventJoinStep } from "../../../api/contract/event-join";
import type { EventOverviewResponse } from "../../../api/contract/event-overview";
import { designIcons } from "../../../api/design/icons";
import { Icon, UiPressable, UiText, useToast } from "../../../components/ui";
import Svg, { Defs, Path, Rect, Stop } from "../../../components/ui/svg";
import { createThemedStyles } from "../../../design/theme";
import { radius } from "../../../design/tokens";
import { addDesignMock } from "../../add/add-design-mock";
import { LinearGradient } from "../../plan/plan-svg";
import { useJourneyApi } from "./journey-api";
import { announceEventChanged, eventRange, monthDaySlash, tokyo } from "./journey-model";
import { JourneyPage } from "./JourneyPage";
import { ScoreRing } from "./ScoreRing";
import { useJourneyT } from "./useJourneyT";

const ITEM_LABEL: Record<EventJoinProfileItemKey, string> = { company: "itemCompany", offer: "itemOffer", purpose: "itemPurpose", target: "itemTarget", topics: "itemTopics" };

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
  const [calendar, setCalendar] = useState<"asked" | "added" | "declined">("asked");
  const [intro, setIntro] = useState<string | null>(null);
  const [editingIntro, setEditingIntro] = useState(false);
  const [why, setWhy] = useState(false);
  const freeRef = useRef<TextInput | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    void api.overview(eventId).then((res) => { if (live && res.ok) setEvent(res.data); });
    const replay = addDesignMock("open-path") && params.replay ? params.replay.split("|").map((group) => group.split(",").filter(Boolean)) : null;
    void (async () => {
      setLoadFailed(false);
      const first = await api.joinNext(eventId, []);
      if (!live) return;
      if (!first.ok) { setLoadFailed(true); return; }
      let current = first.data;
      let given: EventJoinAnswer[] = [];
      // 开发回放：依次回答，最后一组按 `to` 决定只选中（select）还是也提交。
      if (replay) {
        const submitAll = params.to === "review" || params.to === "done";
        for (const [index, group] of replay.entries()) {
          const question = current.question;
          if (!question) break;
          if (index === replay.length - 1 && !submitAll) { setSelected(group); break; }
          given = [...given, { answer: group.join(" · "), field: question.field, prompt: question.prompt, questionToken: question.questionToken }];
          const next = await api.joinNext(eventId, given);
          if (!next.ok) break;
          current = next.data;
        }
      }
      const shown = await api.joinProfile(eventId, given, Boolean(current.done));
      if (!live) return;
      setAnswers(given);
      setStep(current);
      if (shown.ok) { setProfile(shown.data); setIntro(shown.data.selfIntro?.text ?? null); }
      if (replay && params.to === "done" && current.done) {
        const res = await api.joinSubmit(eventId, given);
        if (live && res.ok) setResult(res.data);
      }
    })();
    return () => { live = false; };
  }, [api, eventId, params.replay, params.to, attempt]);

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
    const next = [...answers, { answer: value, field: question.field, prompt: question.prompt, questionToken: question.questionToken }];
    setBusy(true);
    const [nextStep, nextProfile] = await Promise.all([api.joinNext(eventId, next), api.joinProfile(eventId, next, false)]);
    // 成功才记下这一答（失败时题目不变、选项保留，重答不会带着同一个 questionToken 重复入列）。
    if (!nextStep.ok) { toast.error(t("submitFailed")); setBusy(false); return; }
    setAnswers(next); setSelected([]); setFree("");
    setStep(nextStep.data);
    if (nextProfile.ok) setProfile(nextProfile.data);
    if (nextStep.ok && nextStep.data.done) {
      const drafted = await api.joinProfile(eventId, next, true);
      if (drafted.ok) { setProfile(drafted.data); setIntro((current) => current ?? drafted.data.selfIntro?.text ?? null); }
    }
    setBusy(false);
  };
  // 「追加」：访谈认为够了也再问一题（live 由 AI 决定，可能仍然结束 → 留在确认页）。
  const askMore = async () => {
    setBusy(true);
    const res = await api.joinNext(eventId, answers, true);
    setBusy(false);
    if (res.ok) setStep(res.data); else toast.error(t("submitFailed"));
  };
  const apply = async () => {
    setBusy(true);
    const edited = intro && intro !== profile?.selfIntro?.text ? intro : undefined;
    const res = await api.joinSubmit(eventId, answers, edited);
    setBusy(false);
    if (res.ok) { setResult(res.data); announceEventChanged(eventId); } else toast.error(t("submitFailed"));
  };
  const addTentative = async () => {
    if (busy) return;
    setBusy(true);
    const res = await api.joinTentative(eventId);
    setBusy(false);
    if (res.ok) { setCalendar("added"); announceEventChanged(eventId); toast.success(t("tentativeAdded")); } else toast.error(t("submitFailed"));
  };
  // × goes back to the detail it was opened from (a replace left a second detail in the stack); a deep link has none, so it opens the detail.
  const close = () => (router.canGoBack() ? router.back() : router.replace(detail as Href));

  if (result) {
    const submitted = tokyo(result.submittedAt);
    const reviewUntil = result.reviewUntil ?? profile?.reviewUntil ?? null;
    const pending = result.status === "pending_review";
    return (
      <JourneyPage title={t("doneTitle")} leftIcon="x" leftLabel={t("close")} fallback={detail} onLeft={close} testID="events-join-done">
        <View style={[styles.card, styles.doneHero]}>
          <View style={styles.popcheck}>
            <Svg width={38} height={38} viewBox="0 0 24 24" fill="none" stroke={colors.macTealInk} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              {designIcons.check.map((shape, index) => (shape.tag === "path" ? <Path key={index} d={shape.d} /> : null))}
            </Svg>
          </View>
          <UiText style={styles.doneTitle}>{t("received")}</UiText>
          <UiText style={[styles.lbl, { textAlign: "center" }]}>{`${event?.title ?? ""} · ${submitted ? t("dateTimeLong", { d: submitted.day, hm: `${submitted.hh}:${String(submitted.mm).padStart(2, "0")}`, m: submitted.month }) : ""}`}</UiText>
        </View>
        <View style={[styles.card, styles.gap]}>
          <View style={[styles.row, styles.between]}>
            <UiText style={styles.h3}>{t("statusNow")}</UiText>
            <View style={[styles.chip, { backgroundColor: pending ? colors.macLav : colors.macTeal }]}><UiText style={[styles.chipText, { color: pending ? colors.macLavInk : colors.macTealInk }]}>{pending ? t("statusReview") : t("statusConfirmed")}</UiText></View>
          </View>
          <View style={styles.steps4}>
            {[
              { lines: [t("flowApply"), monthDaySlash(result.submittedAt)], state: "done" },
              { lines: [t("flowReview"), pending && reviewUntil ? t("reviewBy", { date: monthDaySlash(reviewUntil) }) : null], state: pending ? "now" : "done" },
              { lines: [t("flowResult")], state: pending ? "" : "now" },
              { lines: [t("flowDay"), monthDaySlash(result.startsAt)], state: "" },
            ].map((item) => (
              <View key={item.lines[0]} style={[styles.stepCell, item.state === "done" ? { borderTopColor: colors.plum500 } : item.state === "now" ? { borderTopColor: colors.plum700 } : null]}>
                <UiText style={[styles.stepText, item.state === "done" ? { color: colors.ink2 } : item.state === "now" ? { color: colors.ink, fontWeight: "800" } : null]}>{item.lines.filter(Boolean).join("\n")}</UiText>
              </View>
            ))}
          </View>
          {pending ? <UiText style={[styles.sub, { marginTop: 12 }]}>{t("reviewWait")}</UiText> : null}
        </View>
        {result.tentative && calendar === "asked" ? (
          <View style={[styles.card, styles.gap, styles.confirm]} testID="events-join-calendar">
            <View style={[styles.row, { gap: 8 }]}>
              <View style={[styles.emoSm, { backgroundColor: colors.macLav }]}><UiText style={styles.emoSmText}>📅</UiText></View>
              <UiText style={styles.title13}>{t("calAsk")}</UiText>
            </View>
            <UiText style={[styles.sub, { marginBottom: 10, marginTop: 6 }]}>{t("calendarLine", { range: eventRange(result.tentative.startsAt, result.tentative.endsAt, language), title: result.tentative.title })}</UiText>
            <View style={[styles.row, { gap: 8 }]}>
              <UiPressable accessibilityRole="button" accessibilityLabel={t("addIt")} onPress={() => void addTentative()} style={[styles.btnSm, styles.primary]}><UiText style={[styles.btnSmText, { color: colors.bg }]}>{t("addIt")}</UiText></UiPressable>
              <UiPressable accessibilityRole="button" accessibilityLabel={t("noNeed")} onPress={() => setCalendar("declined")} style={styles.btnSm}><UiText style={styles.btnSmText}>{t("noNeed")}</UiText></UiPressable>
            </View>
          </View>
        ) : null}
        <UiPressable accessibilityRole="button" accessibilityLabel={t("editProfile")} onPress={() => router.push("/profile" as Href)} style={styles.ghostBlock}><UiText style={styles.ghostText}>{t("editProfile")}</UiText></UiPressable>
      </JourneyPage>
    );
  }

  if (reviewing) {
    const offerMissing = (profile?.items ?? []).some((item) => item.key === "offer" && !item.done);
    const coverage = profile?.coverage ?? 0;
    const shownIntro = intro ?? profile?.selfIntro?.text ?? "";
    return (
      <JourneyPage title={t("profileTitle")} subtitle={t("draftedByAi")} leftLabel={t("backToQuestions")} fallback={detail} onLeft={() => void askMore()} testID="events-join-review">
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
                  <UiText style={[styles.itemText, item.done ? null : { color: colors.ink3 }]}>{t(ITEM_LABEL[item.key])}</UiText>
                  {item.done ? null : <UiPressable accessibilityRole="button" accessibilityLabel={t("add")} disabled={busy} onPress={() => void askMore()} style={styles.btnXs}><UiText style={styles.btnXsText}>{t("add")}</UiText></UiPressable>}
                </View>
              ))}
            </View>
          </View>
          {offerMissing ? <UiText style={[styles.lbl, { marginTop: 10 }]}>{t("offerHint")}</UiText> : null}
        </View>
        <View style={[styles.card, styles.gap]}>
          <View style={styles.cardH}><UiText style={styles.h3}>{t("topicsLbl")}</UiText><UiText style={styles.more}>{t("edit")}</UiText></View>
          <View style={styles.chips}>
            {(profile?.topics ?? []).map((topic) => <View key={topic} style={[styles.chip, { backgroundColor: colors.macLav }]}><UiText style={[styles.chipText, { color: colors.macLavInk }]}>{topic}</UiText></View>)}
            <View style={styles.chip}><UiText style={styles.chipText}>{t("addTopic")}</UiText></View>
          </View>
        </View>
        <View style={[styles.card, styles.gap]}>
          <View style={styles.cardH}>
            <View style={[styles.row, { gap: 8 }]}><UiText style={styles.h3}>{t("introLbl")}</UiText><UiText style={styles.lbl}>{t("introShown")}</UiText></View>
            <View style={[styles.row, { gap: 6 }]}>
              {profile?.selfIntroBasis ? <UiPressable accessibilityRole="button" accessibilityLabel={t("introWhy")} accessibilityState={{ expanded: why }} onPress={() => setWhy((value) => !value)} style={styles.why}><UiText style={styles.whyText}>?</UiText></UiPressable> : null}
              <UiPressable accessibilityRole="button" accessibilityLabel={t("edit")} onPress={() => setEditingIntro((value) => !value)} style={styles.lbtn}><Icon name="pen" size={16} color={colors.ink2} /></UiPressable>
            </View>
          </View>
          {editingIntro ? (
            <TextInput value={shownIntro} onChangeText={setIntro} multiline maxLength={400} accessibilityLabel={t("introLbl")} style={styles.textarea} />
          ) : <UiText style={styles.introText}>{shownIntro}</UiText>}
          {why && profile?.selfIntroBasis ? <View style={styles.whyBody}><UiText style={styles.whyBodyText}>{profile.selfIntroBasis}</UiText></View> : null}
        </View>
        <View style={[styles.card, styles.gap, styles.flat]}>
          <UiText style={[styles.lbl, { marginBottom: 8 }]}>{t("visibilityTitle")}</UiText>
          <View style={[styles.row, { gap: 8 }]}><View style={[styles.chip, { backgroundColor: colors.macTeal }]}><UiText style={[styles.chipText, { color: colors.macTealInk }]}>{t("visAll")}</UiText></View><UiText style={styles.sub}>{t("visAllFields")}</UiText></View>
          <View style={[styles.row, { gap: 8, marginTop: 6 }]}><View style={styles.chip}><UiText style={styles.chipText}>{t("visOrg")}</UiText></View><UiText style={styles.sub}>{t("visOrgFields")}</UiText></View>
        </View>
        <UiPressable accessibilityRole="button" accessibilityLabel={t("applyNow")} disabled={busy} onPress={() => void apply()} style={styles.block48} testID="events-join-apply"><UiText style={styles.primaryText}>{t("applyNow")}</UiText></UiPressable>
        {profile?.editableUntil ? <UiText style={[styles.lbl, { marginTop: 8, textAlign: "center" }]}>{t("editableUntil", { date: monthDaySlash(profile.editableUntil) })}</UiText> : null}
      </JourneyPage>
    );
  }

  const nextLabel = selected.length > 1 ? t("nextChosen", { n: selected.length }) : t("next");
  return (
    <JourneyPage title={t("regTitle")} subtitle={event?.title ?? ""} leftIcon="x" leftLabel={t("close")} fallback={detail} onLeft={close} footerRadius={26} testID="events-join-chat"
      footer={question ? (
        <>
          <TextInput ref={freeRef} value={free} onChangeText={setFree} placeholder={t("freeAnswer")} placeholderTextColor={colors.ink3} accessibilityLabel={t("freeAnswer")} showSoftInputOnFocus={!noKeyboard} onSubmitEditing={() => void submitAnswer()} style={styles.composerIn} />
          <UiPressable accessibilityRole="button" accessibilityLabel={t("voiceAnswer")} onPress={() => freeRef.current?.focus()} style={styles.lbtn}><Icon name="mic" size={16} color={colors.ink2} /></UiPressable>
          <UiPressable accessibilityRole="button" accessibilityLabel={nextLabel} disabled={busy || (!selected.length && !free.trim())} onPress={() => void submitAnswer()} style={[styles.btnSm, styles.primary]} testID="events-join-next"><UiText style={[styles.btnSmText, { color: colors.bg }]}>{nextLabel}</UiText></UiPressable>
        </>
      ) : undefined}>
      {loadFailed && !step ? (
        <View style={styles.card} testID="events-join-error">
          <UiText style={styles.h3}>{t("regLoadFailed")}</UiText>
          <UiPressable accessibilityRole="button" accessibilityLabel={t("retryLoad")} onPress={() => setAttempt((value) => value + 1)} style={[styles.btnSm, { alignSelf: "flex-start", marginTop: 12 }]}><UiText style={styles.btnSmText}>{t("retryLoad")}</UiText></UiPressable>
        </View>
      ) : null}
      {step ? (
        <View>
          <View style={[styles.row, styles.between]}>
            <UiText style={styles.lbl}><UiText style={[styles.lbl, { color: colors.ink, fontWeight: "700" }]}>{t("regQ", { i: step.index })}</UiText>{t("regOfN", { n: total })}</UiText>
            <UiText style={styles.lbl}>{t("regRemain", { m: step.remainingMinutes })}</UiText>
          </View>
          <ProgressBar share={Math.max(0, step.index) / total} />
        </View>
      ) : null}
      <View style={styles.prefill}><UiText style={styles.prefillText}>{t("regPrefilledLine")}</UiText></View>
      <View style={styles.chatcol}>
        {answers.map((item, index) => (
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
  composerIn: { color: colors.ink, flex: 1, fontSize: 15, minWidth: 0, padding: 0, paddingLeft: 6 },
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
  itemText: { color: colors.ink, flex: 1, fontSize: 15, lineHeight: 23 },
  why: { alignItems: "center", backgroundColor: colors.surface2, borderRadius: radius.pill, height: 18, justifyContent: "center", width: 18 },
  whyText: { color: colors.ink3, fontSize: 12, fontWeight: "800", lineHeight: 15 },
  whyBody: { backgroundColor: colors.surface2, borderRadius: 14, marginTop: 10, paddingHorizontal: 12, paddingVertical: 10 },
  whyBodyText: { color: colors.ink2, fontSize: 14, lineHeight: 23 },
  introText: { color: colors.ink, fontSize: 16, lineHeight: 28 },
  textarea: { backgroundColor: colors.surface2, borderRadius: 14, color: colors.ink, fontSize: 16, lineHeight: 28, minHeight: 96, paddingHorizontal: 12, paddingVertical: 10, textAlignVertical: "top" },
  block48: { alignItems: "center", backgroundColor: colors.ink, borderRadius: radius.pill, height: 48, justifyContent: "center", marginTop: 14 },
  primaryText: { color: colors.bg, fontSize: 15, fontWeight: "700", lineHeight: 22 },
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
