// R27 会後のふりかえり（App；b2 #37 新用户空状态 · #38 少量 · #39 大量，深 #46）：会った人 hero（头像叠 · mini3）· ✨ 今日のまとめ（依据 ?）·
// 次の一手（逐人 ✓ / ✕ + お礼の下書き / フォロー日 / 🎯 计划类型）· プラン スコア预览（与 Web 同一纯函数 nextAward，同人同类型只计一次）。
// 数据：GET /api/events/[id]/after，确定：POST /after/confirm（只确定勾选的行）。お礼只是下书き，这里不发送任何东西。
import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Linking, Platform, Share, StyleSheet, View } from "react-native";

import { nextAward } from "../../../api/compute/plan-score";
import type { EventAfterNextStep, EventAfterResponse, EventAfterScoreSlot } from "../../../api/contract/event-after";
import { BottomSheet, Icon, IconButton, UiPressable, UiText, useToast } from "../../../components/ui";
import Svg, { Defs, RadialGradient, Rect, Stop } from "../../../components/ui/svg";
import { createThemedStyles } from "../../../design/theme";
import { radius } from "../../../design/tokens";
import { useOrbitLocale } from "../../../i18n/OrbitLocaleContext";
import { useJourneyApi } from "./journey-api";
import { tokyo, weekday } from "./journey-model";
import { JourneyPage } from "./JourneyPage";
import { useJourneyT } from "./useJourneyT";
import { Avatar, AvatarStack, useVenueStyles, Why, WhyBody, type Tone } from "./venue-ui";

/** 同 Web after-core previewAfterScore：勾选的行按顺序走 nextAward，返回每行加分与合计。 */
export function previewAfterScore(steps: readonly Pick<EventAfterNextStep, "planType" | "alreadyCounted">[], slots: readonly EventAfterScoreSlot[]): { perStep: number[]; total: number } {
  const state = new Map(slots.map((slot) => [slot.key, { ...slot }]));
  const perStep = steps.map((step) => {
    const key = step.planType?.key;
    const slot = key ? state.get(key) : undefined;
    if (!slot || step.alreadyCounted) return 0;
    const awards = slot.earnedCount > 0 ? [{ basis: "talked" as const, part: "base" as const, points: slot.earnedPoints }, ...Array.from({ length: slot.earnedCount - 1 }, () => ({ basis: "talked" as const, part: "base" as const, points: 0 }))] : [];
    const award = nextAward({ allocation: slot.allocation, anonymous: false, awards, skipped: slot.skipped, targetCount: slot.targetCount });
    if (award.part === "base") { slot.earnedCount += 1; slot.earnedPoints += award.points; }
    return award.points;
  });
  return { perStep, total: perStep.reduce((sum, points) => sum + points, 0) };
}

const HL_TONES: readonly Tone[] = ["lav", "teal", "pink"];
/** 头像色（b2 #38 / #39，同 Web ROW_TONES）：次の一手按行 lav · teal · blue · pink · teal · apricot；
 *  会った人的叠头像先取同一个人在次の一手里的颜色，没有就按位置 lav · blue · teal · pink · teal（同 Web hero）。 */
const ROW_TONES: readonly Tone[] = ["lav", "teal", "blue", "pink", "teal", "apricot"];
const HERO_TONES: readonly Tone[] = ["lav", "blue", "teal", "pink", "teal"];

export function AfterPage() {
  const { styles, colors } = useStyles();
  const vs = useVenueStyles().styles;
  const { t, language } = useJourneyT();
  const locale = useOrbitLocale();
  const router = useRouter();
  const toast = useToast();
  const api = useJourneyApi();
  const params = useLocalSearchParams<{ id?: string }>();
  const eventId = String(params.id ?? "");
  const base = `/events/${encodeURIComponent(eventId)}`;
  const [data, setData] = useState<EventAfterResponse | null>(null);
  const [missing, setMissing] = useState(false);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [unlinked, setUnlinked] = useState<Set<string>>(new Set());
  const [why, setWhy] = useState<Record<string, boolean>>({});
  const [draftFor, setDraftFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    void api.after(eventId).then((res) => { if (!live) return; if (res.ok) setData(res.data); else setMissing(true); });
    return () => { live = false; };
  }, [api, eventId]);

  const steps = data?.nextSteps ?? [];
  const checked = steps.filter((step) => !excluded.has(step.attendeeId));
  const preview = useMemo(() => {
    if (!data?.score) return null;
    if (!data.scoreSlots?.length) return { after: data.score.after, before: data.score.before };
    const counted = checked.map((step) => (unlinked.has(step.attendeeId) ? { alreadyCounted: step.alreadyCounted ?? false, planType: null } : step));
    return { after: data.score.before + previewAfterScore(counted, data.scoreSlots).total, before: data.score.before };
  }, [data, checked, unlinked]);
  const genericError = () => toast.error(locale.t("eventsV2.genericError"));
  const toggle = (set: (fn: (current: Set<string>) => Set<string>) => void, attendeeId: string, on: boolean) => set((current) => { const next = new Set(current); if (on) next.add(attendeeId); else next.delete(attendeeId); return next; });
  const dayLabel = (date: string) => { const p = tokyo(`${date}T12:00:00+09:00`); return p ? t("dateWeek", { d: p.day, m: p.month, wd: weekday(language, p.weekday) }) : date; };
  const confirm = async () => {
    if (!checked.length) return;
    setBusy(true);
    const res = await api.confirmAfter(eventId, checked.map((step) => ({ attendeeId: step.attendeeId, followupDate: step.followupDate, planTypeKey: unlinked.has(step.attendeeId) ? null : step.planType?.key ?? null })));
    setBusy(false);
    if (!res.ok || res.data.confirmed === 0) { genericError(); return; }
    setData((current) => (current ? { ...current, confirmedAt: res.data.confirmedAt, score: current.score && res.data.scoreAfter != null ? { ...current.score, after: res.data.scoreAfter } : current.score ?? null } : current));
    toast.success(t("confirmedToast"));
  };
  const shareRecap = () => {
    if (!data) return;
    const lines = [`${t("afterTitle")} · ${data.title}`, ...(data.highlights ?? []).map((item) => `${item.emoji} ${item.title} — ${item.detail}`), ...(data.summary && !data.highlights?.length ? [data.summary] : [])];
    Share.share({ message: lines.join("\n") }).catch(() => undefined);
  };

  const top = { fallback: base, leftLabel: t("back") };
  if (!data) return <JourneyPage title={t("afterTitle")} {...top}>{missing ? <View style={vs.card}><UiText style={vs.sub}>{t("notFound")}</UiText></View> : null}</JourneyPage>;
  const d = tokyo(`${data.date}T12:00:00+09:00`);
  const subtitle = `${data.title} · ${d ? `${d.month}/${d.day}` : data.date}`;
  const empty = data.met.count === 0 && steps.length === 0;
  const right = <IconButton icon="share" accessibilityLabel={t("share")} onPress={shareRecap} />;
  const draftStep = steps.find((step) => step.attendeeId === draftFor) ?? null;

  if (empty) {
    return (
      <JourneyPage title={t("afterTitle")} subtitle={subtitle} right={right} {...top} testID="events-after-empty">
        <View style={styles.guide}>
          <Svg width={220} height={220} style={styles.guideGlow}>
            <Defs><RadialGradient id="afterGlow" cx="50%" cy="50%" r="50%"><Stop offset={0} stopColor={colors.macLav} /><Stop offset={0.7} stopColor={colors.macLav} stopOpacity={0} /></RadialGradient></Defs>
            <Rect x={0} y={0} width={220} height={220} fill="url(#afterGlow)" opacity={0.9} />
          </Svg>
          <UiText style={vs.lbl}>{t("emptyAfterLbl")}</UiText>
          <UiText style={styles.guideTitle}>{t("aEmptyTitle")}</UiText>
          <UiText style={[vs.sub, { marginBottom: 14 }]}>{t("emptyAfterSub")}</UiText>
          <UiPressable accessibilityRole="button" accessibilityLabel={t("pickFromAttendees")} onPress={() => router.push(`${base}/live?tab=people` as Href)} style={styles.block46}><Icon name="users" size={16} color={colors.bg} /><UiText style={styles.primaryText}>{t("pickFromAttendees")}</UiText></UiPressable>
        </View>
        <View style={[styles.grid2, vs.gap]}>
          <UiPressable accessibilityRole="button" accessibilityLabel={t("aScanTitle")} onPress={() => router.push("/contacts/new/scan" as Href)} style={[vs.card, styles.tile]}>
            <View style={[vs.emo, { backgroundColor: colors.macApricot }]}><UiText style={vs.emoText}>📇</UiText></View>
            <UiText style={vs.title13}>{t("aScanTitle")}</UiText><UiText style={vs.lbl}>{t("aScanSub")}</UiText>
          </UiPressable>
          <View style={[vs.card, styles.tile]}>
            <View style={[vs.emo, { backgroundColor: colors.macTeal }]}><UiText style={vs.emoText}>🎙️</UiText></View>
            <UiText style={vs.title13}>{t("aVoiceTitle")}</UiText><UiText style={vs.lbl}>{t("voiceMemoSub")}</UiText>
          </View>
        </View>
        <View style={[vs.card, vs.gap]}>
          <View style={vs.cardH}><View style={[vs.row, { gap: 0 }]}><UiText style={vs.h3}>{t("previewTitle")}</UiText><View style={styles.sampleTag}><UiText style={styles.sampleText}>{t("sampleTag")}</UiText></View></View></View>
          <View style={styles.faded}>
            <UiText style={vs.lbl}>{t("metToday")}</UiText>
            <UiText style={[vs.big, styles.big38]}>9<UiText style={styles.bigUnit}>{` ${t("metUnit")}`}</UiText></UiText>
            <View style={[styles.ghostRow, { marginTop: 12 }]}><View style={styles.ghostDot} /><UiText style={styles.ghostText}>{t("aGhostThanks")}</UiText></View>
            <View style={[styles.ghostRow, { marginTop: 8 }]}><View style={styles.ghostDot} /><UiText style={styles.ghostText}>{t("ghostAfter2")}</UiText></View>
          </View>
        </View>
      </JourneyPage>
    );
  }

  return (
    <JourneyPage title={t("afterTitle")} subtitle={subtitle} right={right} {...top} testID="events-after">
      <View style={vs.card}>
        <View style={styles.heroRow}>
          <View><UiText style={vs.lbl}>{t("metToday")}</UiText><UiText style={[vs.big, styles.big52]}>{data.met.count}<UiText style={styles.bigUnit}>{` ${t("metUnit")}`}</UiText></UiText></View>
          <AvatarStack people={data.met.initials.slice(0, 5).map((initial) => ({ initial }))} toneOf={(() => { let position = 0; return (person: { initial: string }) => { const row = steps.findIndex((step) => step.initial === person.initial); const tone = row >= 0 ? ROW_TONES[row % ROW_TONES.length]! : HERO_TONES[position % HERO_TONES.length]!; position += 1; return tone; }; })()} />
        </View>
        <View style={styles.mini3}>
          {([[t("statExchanged"), data.met.exchanged, null], [t("itemTarget"), data.met.wantedMet, data.met.wantedTotal], [t("meetingsSet"), data.met.meetings, null]] as const).map(([label, value, of]) => (
            <View key={label} style={styles.mini}><UiText style={[vs.lbl, styles.miniLbl]}>{label}</UiText><UiText style={styles.miniNum}>{value}{of !== null ? <UiText style={vs.lbl}>{`/${of}`}</UiText> : null}</UiText></View>
          ))}
        </View>
      </View>
      {data.highlights?.length || data.summary ? (
        <View style={[vs.card, vs.gap]} testID="events-after-summary">
          <View style={vs.cardH}><UiText style={vs.h3}>{t("summaryTitle")}</UiText>{data.aiDraft ? <UiText style={vs.lbl}>{t("aiDraftEditable")}</UiText> : null}</View>
          {data.highlights?.length ? data.highlights.map((item, index) => (
            <View key={item.title} style={[styles.sumi, index ? styles.line : null]}>
              <View style={[vs.row, { alignItems: "flex-start" }]}>
                <View style={[vs.emoSm, { backgroundColor: colors[HL_TONES[index % HL_TONES.length] === "lav" ? "macLav" : HL_TONES[index % HL_TONES.length] === "teal" ? "macTeal" : "macPink"] }]}><UiText style={vs.emoSmText}>{item.emoji}</UiText></View>
                <View style={vs.grow}><UiText style={[vs.title13, styles.hlTitle]}>{item.title}</UiText><UiText style={vs.lbl}>{item.detail}</UiText></View>
                {item.evidence ? <Why label={t("whyLabel")} open={Boolean(why[item.title])} onToggle={() => setWhy((all) => ({ ...all, [item.title]: !all[item.title] }))} /> : null}
              </View>
              {why[item.title] ? <WhyBody text={t("evidenceLbl", { text: item.evidence })} /> : null}
            </View>
          )) : <UiText style={[vs.sub, styles.sumi]}>{data.summary}</UiText>}
        </View>
      ) : null}
      {steps.length ? (
        <View style={[vs.card, vs.gap, styles.batch]} testID="events-after-steps">
          <View style={vs.cardH}><UiText style={vs.h3}>{t("nextStepsTitle", { n: steps.length })}</UiText><UiText style={vs.lbl}>{data.aiDraft ? t("nextStepsHintPhone") : t("nextStepsHintPhoneRule")}</UiText></View>
          {steps.map((step, index) => {
            const on = !excluded.has(step.attendeeId);
            const linked = !unlinked.has(step.attendeeId);
            return (
              <View key={step.attendeeId} style={[styles.nx, index ? styles.line : null, on ? null : { opacity: 0.45 }]}>
                <View style={vs.row}>
                  <Avatar initial={step.initial} tone={ROW_TONES[index % ROW_TONES.length]!} size="sm" />
                  <View style={vs.grow}><UiText style={styles.nxName}>{step.name}</UiText>{step.org ? <UiText style={vs.lbl} numberOfLines={1}>{step.org}</UiText> : null}</View>
                  <UiPressable accessibilityRole="button" accessibilityLabel="✓" accessibilityState={{ selected: on }} onPress={() => toggle(setExcluded, step.attendeeId, false)} style={[styles.yn, on ? styles.ynOn : null]}><UiText style={[styles.ynText, on ? { color: colors.bg } : null]}>✓</UiText></UiPressable>
                  <UiPressable accessibilityRole="button" accessibilityLabel="✕" accessibilityState={{ selected: !on }} onPress={() => toggle(setExcluded, step.attendeeId, true)} style={[styles.yn, on ? null : styles.ynOn]}><UiText style={[styles.ynText, on ? null : { color: colors.bg }]}>✕</UiText></UiPressable>
                </View>
                <View style={styles.acts}>
                  {step.thanksDraft ? <UiPressable accessibilityRole="button" accessibilityLabel={t("actThanks")} onPress={() => setDraftFor(step.attendeeId)} style={[styles.act, styles.actOn]}><UiText style={styles.actCheck}>✓</UiText><UiText style={[styles.actText, { color: colors.ink }]}>{t("actThanks")}</UiText></UiPressable> : null}
                  <View style={[styles.act, styles.actOn]}><UiText style={styles.actCheck}>✓</UiText><UiText style={[styles.actText, { color: colors.ink }]}>{t("actFollow", { date: dayLabel(step.followupDate) })}</UiText></View>
                  {step.planType ? (
                    <UiPressable accessibilityRole="button" accessibilityLabel={step.planType.label} accessibilityState={{ selected: linked }} onPress={() => toggle(setUnlinked, step.attendeeId, linked)} style={[styles.act, linked ? styles.actOn : null]}>
                      {linked ? <UiText style={styles.actCheck}>✓</UiText> : null}<UiText style={[styles.actText, linked ? { color: colors.ink } : null]}>{`🎯 ${step.planType.label}`}</UiText>
                    </UiPressable>
                  ) : null}
                </View>
              </View>
            );
          })}
          <View style={[vs.row, { gap: 8, marginTop: 12 }]}>
            <UiPressable accessibilityRole="button" accessibilityLabel={t("confirmN", { n: checked.length })} disabled={busy || !checked.length || Boolean(data.confirmedAt)} onPress={() => void confirm()} style={[styles.btn, styles.btnPrimary, vs.grow]} testID="events-after-confirm"><UiText style={styles.primaryText}>{t("confirmN", { n: checked.length })}</UiText></UiPressable>
            <UiPressable accessibilityRole="button" accessibilityLabel={t("later")} onPress={() => router.replace(base as Href)} style={styles.btn}><UiText style={styles.ghostBtnText}>{t("later")}</UiText></UiPressable>
          </View>
          <View style={[vs.row, { gap: 4, justifyContent: "center", marginTop: 8 }]}><Icon name="mail" size={16} color={colors.ink3} /><UiText style={vs.lbl}>{t("noSendNote")}</UiText></View>
        </View>
      ) : null}
      {data.score && preview ? (
        <View style={[vs.card, vs.gap]} testID="events-after-score">
          <View style={[vs.row, vs.between, { alignItems: "flex-start" }]}>
            <View>
              <UiText style={vs.lbl}>{t("scoreLbl", { goal: data.score.goal })}</UiText>
              <View style={[vs.row, { gap: 8, marginTop: 4 }]}>
                <UiText style={styles.before}>{preview.before}</UiText>
                <Icon name="right" size={16} color={colors.ink3} />
                <UiText style={[vs.big, styles.big36]}>{preview.after}</UiText>
              </View>
            </View>
            {preview.after > preview.before ? <View style={styles.delta}><UiText style={styles.deltaText}>{`+${preview.after - preview.before}`}</UiText></View> : null}
          </View>
          <View style={styles.bar2}>
            <View style={[styles.bar2Base, { width: `${Math.min(100, preview.before)}%` }]} />
            <View style={[styles.bar2Add, { left: `${Math.min(100, preview.before)}%`, width: `${Math.max(0, Math.min(100, preview.after) - Math.min(100, preview.before))}%` }]} />
          </View>
          <View style={[vs.row, vs.between]}>
            <UiText style={vs.lbl}>{data.confirmedAt ? t("confirmedState", { date: (() => { const p = tokyo(data.confirmedAt); return p ? `${p.month}/${p.day}` : ""; })() }) : t("scoreHint")}</UiText>
            {data.score.detail ? <Why label={t("whyLabel")} open={Boolean(why.__score)} onToggle={() => setWhy((all) => ({ ...all, __score: !all.__score }))} /> : null}
          </View>
          {why.__score && data.score.detail ? <WhyBody text={data.score.detail} /> : null}
        </View>
      ) : null}
      <BottomSheet visible={Boolean(draftStep?.thanksDraft)} onClose={() => setDraftFor(null)} accessibilityLabel={draftStep ? t("thanksTitle", { name: draftStep.name.split(/\s+/)[0] ?? draftStep.name }) : ""}>
        {draftStep?.thanksDraft ? (
          <View>
            <UiText style={styles.sheetTitle}>{t("thanksTitle", { name: draftStep.name.split(/\s+/)[0] ?? draftStep.name })}</UiText>
            <UiText style={[vs.lbl, { marginTop: 10 }]}>{t("subjectLbl")}</UiText>
            <UiText style={vs.title13}>{draftStep.thanksDraft.subject}</UiText>
            <UiText style={[vs.sub, { marginTop: 8 }]}>{draftStep.thanksDraft.body}</UiText>
            <View style={[vs.row, { gap: 8, marginTop: 14 }]}>
              <UiPressable accessibilityRole="button" accessibilityLabel={t("copyText")} onPress={() => { const draft = draftStep.thanksDraft!; Clipboard.setStringAsync(`${draft.subject}\n\n${draft.body}`).then(() => toast.success(t("draftCopied")), genericError); }} style={[styles.btn, vs.grow]}><UiText style={styles.ghostBtnText}>{t("copyText")}</UiText></UiPressable>
              <UiPressable accessibilityRole="link" accessibilityLabel={t("openMail")} onPress={() => { const draft = draftStep.thanksDraft!; void Linking.openURL(`mailto:?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`); }} style={[styles.btn, styles.btnPrimary, vs.grow]}><UiText style={styles.primaryText}>{t("openMail")}</UiText></UiPressable>
            </View>
            <UiText style={[vs.lbl, { marginTop: 8, textAlign: "center" }]}>{t("noSendNote")}</UiText>
          </View>
        ) : null}
      </BottomSheet>
    </JourneyPage>
  );
}

// kit（b2 #37–#39）：.guide 20 + 右上 220 lav 光晕 · .hero-row · .mini3 · .sumi 10 0 · .nx 12 0 · .yn 30 · .act 5/10 · .bar2 8 · .delta。
const useStyles = createThemedStyles((colors) => StyleSheet.create({
  guide: { backgroundColor: colors.surface, borderRadius: radius.xl, overflow: "hidden", padding: 20 },
  guideGlow: { position: "absolute", right: -80, top: -90 },
  guideTitle: { color: colors.ink, fontSize: 19, fontWeight: "800", lineHeight: 26.6, marginVertical: 4 },
  block46: { alignItems: "center", backgroundColor: colors.ink, borderRadius: radius.pill, flexDirection: "row", gap: 6, height: 46, justifyContent: "center" },
  primaryText: { color: colors.bg, fontSize: 13, fontWeight: "700", lineHeight: 19.5 },
  grid2: { flexDirection: "row", gap: 12 },
  tile: { flex: 1, gap: 8 },
  sampleTag: { backgroundColor: colors.macApricot, borderRadius: 6, marginLeft: 4, paddingHorizontal: 6, paddingVertical: 1 },
  sampleText: { color: colors.macApricotInk, fontSize: 9.5, fontWeight: "800", lineHeight: 14.25 },
  faded: { opacity: 0.5 },
  big38: { fontSize: 38, letterSpacing: -0.76, lineHeight: 39.9 },
  big52: { fontSize: 52, letterSpacing: -1.04, lineHeight: 54.6 },
  big36: { fontSize: 36, letterSpacing: -0.72, lineHeight: 37.8 },
  bigUnit: { color: colors.ink3, fontSize: 15, fontWeight: "700", letterSpacing: 0 },
  ghostRow: { alignItems: "center", borderColor: colors.surface3, borderRadius: 14, borderStyle: "dashed", borderWidth: 1.5, flexDirection: "row", gap: 10, height: 46, paddingHorizontal: 14 },
  ghostDot: { backgroundColor: colors.surface2, borderRadius: radius.pill, height: 26, width: 26 },
  ghostText: { color: colors.ink4, fontSize: 12, lineHeight: 18 },
  heroRow: { alignItems: "flex-end", flexDirection: "row", justifyContent: "space-between" },
  mini3: { flexDirection: "row", gap: 8, marginTop: 14 },
  mini: { backgroundColor: colors.surface2, borderRadius: 14, flex: 1, paddingHorizontal: 11, paddingVertical: 10 },
  // kit：小字 span 在 14px / 1.5 的行盒里 → 行高 21。
  miniLbl: { lineHeight: 21 },
  miniNum: { color: colors.ink, fontFamily: Platform.OS === "ios" ? "ui-rounded" : undefined, fontSize: 19, fontWeight: "800", lineHeight: 22.8 },
  sumi: { paddingVertical: 10 },
  // kit：13px 的 <b> 落在 14px / 1.5 的行盒里 → 每行 21。
  hlTitle: { lineHeight: 21 },
  line: { borderTopColor: colors.line, borderTopWidth: 1 },
  batch: { backgroundColor: "transparent", borderColor: colors.plum300, borderRadius: 20, borderStyle: "dashed", borderWidth: 1.5 },
  nx: { paddingVertical: 12 },
  nxName: { color: colors.ink, fontSize: 13.5, fontWeight: "700", lineHeight: 20.25 },
  yn: { alignItems: "center", backgroundColor: colors.surface2, borderRadius: radius.pill, height: 30, justifyContent: "center", width: 30 },
  ynOn: { backgroundColor: colors.ink },
  ynText: { color: colors.ink3, fontSize: 13, fontWeight: "800", lineHeight: 16 },
  acts: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginLeft: 40, marginTop: 8 },
  act: { alignItems: "center", borderColor: colors.plum300, borderRadius: radius.pill, borderStyle: "dashed", borderWidth: 1.5, flexDirection: "row", gap: 4, paddingHorizontal: 10, paddingVertical: 5 },
  actOn: { backgroundColor: colors.accentSoft, borderColor: "transparent", borderStyle: "solid" },
  actCheck: { color: colors.plum700, fontSize: 11.5, fontWeight: "900", lineHeight: 17.25 },
  actText: { color: colors.ink3, fontSize: 11.5, fontWeight: "700", lineHeight: 17.25 },
  btn: { alignItems: "center", borderRadius: radius.pill, height: 40, justifyContent: "center", paddingHorizontal: 16 },
  btnPrimary: { backgroundColor: colors.ink },
  ghostBtnText: { color: colors.ink2, fontSize: 13, fontWeight: "700", lineHeight: 19.5 },
  before: { color: colors.ink3, fontFamily: Platform.OS === "ios" ? "ui-rounded" : undefined, fontSize: 17, fontWeight: "800", lineHeight: 25.5, textDecorationLine: "line-through" },
  delta: { backgroundColor: colors.macTeal, borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 2 },
  deltaText: { color: colors.macTealInk, fontSize: 11.5, fontWeight: "700", lineHeight: 17.25 },
  bar2: { backgroundColor: colors.surface3, borderRadius: 6, height: 8, marginBottom: 8, marginTop: 12, overflow: "hidden" },
  bar2Base: { backgroundColor: colors.plum500, borderRadius: 6, bottom: 0, left: 0, position: "absolute", top: 0 },
  bar2Add: { backgroundColor: colors.rose500, borderRadius: 6, bottom: 0, position: "absolute", top: 0 },
  sheetTitle: { color: colors.ink, fontSize: 16, fontWeight: "800", lineHeight: 22 },
}));
