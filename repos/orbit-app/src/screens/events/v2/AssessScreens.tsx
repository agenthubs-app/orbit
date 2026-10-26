// R26 イベント評価 (App): the input and 判定中 (app.html #30), the result (#31, dark #37) and the failure states
// (b2 #0 login, #1 not an event page, #2 poster fill-in, #3 after filling). Scores come from the server by rule;
// a URL / poster read polls every 2 seconds for up to 90 seconds (DESIGN §5). The poster picker loads lazily.
import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Platform, Share, StyleSheet, TextInput, View } from "react-native";

import { EVENT_AREA_ONLINE, EVENT_PRICE_FREE } from "../../../api/compute/event-score-input";
import type { EventAssessmentContract, EventAssessmentCreateInput, EventAssessmentDisplayValue, EventAssessmentFacts } from "../../../api/contract/event-assessment";
import { AppScreen } from "../../../components/AppScreen";
import { ActionSheet, ConfirmDialog, Icon, IconButton, UiPressable, UiText, useToast } from "../../../components/ui";
import { createThemedStyles, useOrbitTheme } from "../../../design/theme";
import { radius, shadows } from "../../../design/tokens";
import { useOrbitLocale } from "../../../i18n/OrbitLocaleContext";
import { newIdempotencyKey, useEventsApi, type EventsApi } from "./events-api";
import { KitGradient } from "../../plan/plan-kit";
import { appEventTime, appEventWhen, clipboardEventUrl, ringColor, tokyoDay, verdictKey } from "./events-model";
import { ScoreRing } from "./ScoreRing";
import { PersonalScheduleDateTimePicker } from "../../schedule/PersonalScheduleDateTimePicker";

const POLL_MS = 2_000;
const POLL_LIMIT_MS = 90_000;

async function poll(api: EventsApi, id: string, live: () => boolean): Promise<EventAssessmentContract | null> {
  const started = Date.now();
  while (live() && Date.now() - started < POLL_LIMIT_MS) {
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    const result = await api.detail(id);
    if (result.ok && result.data.status !== "reading") return result.data;
  }
  return null;
}

/** `/events/assess?mode=url|poster|code|manual`: 貼り付けた URL → 判定中 → the result screen. */
export function AssessInputScreen() {
  const { styles, colors } = useStyles();
  const { t } = useOrbitLocale();
  const router = useRouter();
  const toast = useToast();
  const api = useEventsApi();
  const params = useLocalSearchParams<{ mode?: string }>();
  const [url, setUrl] = useState("");
  const [reading, setReading] = useState<{ step: 0 | 1 | 2 } | null>(null);
  const [code, setCode] = useState("");
  const live = useRef(true);
  useEffect(() => () => { live.current = false; }, []);

  const run = useCallback(async (input: EventAssessmentCreateInput) => {
    const created = await api.create(input);
    if (created.ok === false) { setReading(null); toast.error(created.reason === "rate_limited" ? t("eventsV2.rateLimited") : t("eventsV2.genericError")); return; }
    let value = created.data;
    if (value.status === "reading") {
      setReading({ step: 0 });
      const timer = setInterval(() => setReading((state) => (state ? { step: Math.min(2, state.step + 1) as 0 | 1 | 2 } : state)), 2_500);
      const done = await poll(api, value.id, () => live.current);
      clearInterval(timer);
      setReading(null);
      if (!done) { toast.info(t("eventsV2.slow")); router.back(); return; }
      value = done;
    }
    router.replace(`/events/assessments/${encodeURIComponent(value.id)}` as Href);
  }, [api, router, t, toast]);

  const pickPoster = useCallback(async () => {
    const media = await import("../../add/scan-media");
    let ids: string[] = [];
    try {
      const images = await media.pickCardImages(3);
      if (!images?.length) return;
      // Reading starts as soon as photos are chosen, so the upload is not a silent wait.
      setReading({ step: 0 });
      const uploads = await Promise.all(images.slice(0, 3).map(async (image) => api.uploadPoster(await media.preparedImageBytes(image), image.mimeType)));
      ids = uploads.flatMap((upload) => (upload.ok ? [upload.data.posterAssetId] : []));
    } catch (error) {
      console.warn("[events] poster pick/upload failed", error);
    }
    if (ids.length === 0) { setReading(null); toast.error(t("eventsV2.genericError")); return; }
    await run({ idempotencyKey: newIdempotencyKey(), posterAssetId: ids[0]!, ...(ids.length > 1 ? { posterAssetIds: ids } : {}), sourceKind: "poster" });
  }, [api, run, t, toast]);

  useEffect(() => { if (params.mode === "poster") void pickPoster(); }, [params.mode, pickPoster]);
  // 「粘贴网址」: a copied link fills the field (the user asked to paste, so the clipboard is read once here).
  useEffect(() => {
    if (params.mode !== "url") return;
    void Clipboard.getStringAsync().then((text) => { const found = clipboardEventUrl(text); if (found && live.current) setUrl((current) => current || found); }).catch(() => undefined);
  }, [params.mode]);

  if (params.mode === "code") {
    const valid = /^[A-Z0-9]{8}$/.test(code);
    return (
      <AppScreen title={t("eventsV2.codeDialogTitle")} subtitle={t("eventsV2.codeDialogSub")}>
        <View style={[styles.card, { gap: 12 }]}>
          <TextInput value={code} autoCapitalize="characters" maxLength={9} placeholder="XXXX-XXXX" placeholderTextColor={colors.ink3}
            onChangeText={(value) => setCode(value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8))} style={styles.codeInput} accessibilityLabel={t("eventsV2.codeDialogTitle")} testID="events-code-input" />
          {code.length > 0 && !valid ? <UiText style={styles.lbl}>{t("eventsV2.codeInvalid")}</UiText> : null}
          <UiPressable accessibilityRole="button" accessibilityLabel={t("eventsV2.codeNext")} disabled={!valid} onPress={() => router.push(`/register/${encodeURIComponent(code)}` as Href)} style={[styles.btnPrimary, !valid ? { opacity: 0.4 } : null]}>
            <UiText style={styles.btnPrimaryText}>{t("eventsV2.codeNext")}</UiText>
          </UiPressable>
        </View>
      </AppScreen>
    );
  }
  if (params.mode === "manual") {
    return <AppScreen title={t("eventsV2.assessTitleShort")}><FillThree item={null} onSubmit={(facts) => void run({ facts, idempotencyKey: newIdempotencyKey(), sourceKind: "manual" })} /></AppScreen>;
  }
  return (
    <AppScreen title={t("eventsV2.assessTitleShort")}>
      <View style={styles.card} testID="events-assess-input">
        <UiText style={styles.lbl}>{t("eventsV2.pastedUrl")}</UiText>
        <View style={styles.inputRow}>
          <TextInput value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder={t("eventsV2.pasteHere")} placeholderTextColor={colors.ink3} style={styles.urlInput} accessibilityLabel={t("eventsV2.urlLabel")} testID="events-url-input" autoFocus={params.mode === "url"}
            onSubmitEditing={() => { if (/^https?:\/\//.test(url.trim())) void run({ idempotencyKey: newIdempotencyKey(), sourceKind: "url", url: url.trim() }); }} />
        </View>
        <UiText style={[styles.lbl, { marginTop: 12 }]}>{t("eventsV2.orPoster")}</UiText>
        <UiPressable accessibilityRole="button" accessibilityLabel={t("eventsV2.shootOrPick")} onPress={() => void pickPoster()} style={styles.wayRow}>
          <UiText style={styles.emoText}>🖼️</UiText><UiText style={styles.wayText}>{t("eventsV2.shootOrPick")}</UiText>
        </UiPressable>
        {!reading ? (
          <UiPressable accessibilityRole="button" accessibilityLabel={t("eventsV2.judge")} disabled={!/^https?:\/\//.test(url.trim())} onPress={() => void run({ idempotencyKey: newIdempotencyKey(), sourceKind: "url", url: url.trim() })} style={[styles.btnPrimary, !/^https?:\/\//.test(url.trim()) ? { opacity: 0.4 } : null]}>
            <UiText style={styles.btnPrimaryText}>{t("eventsV2.judge")}</UiText>
          </UiPressable>
        ) : null}
      </View>
      {reading ? (
        <View style={[styles.card, { marginTop: 14 }]} testID="events-assessing">
          <UiText style={styles.title16}>{t("eventsV2.assessingTitle")}</UiText>
          <UiText style={styles.lbl}>{t("eventsV2.assessingSub")}</UiText>
          {(["step1", "step2", "step3"] as const).map((key, index) => (
            <View key={key} style={[styles.row, { marginTop: 10 }]}>
              <View style={[styles.stepDot, index < reading.step ? { backgroundColor: colors.macTeal } : null]}>{index < reading.step ? <Icon name="check" size={16} color={colors.macTealInk} /> : <UiText style={styles.stepNum}>{index + 1}</UiText>}</View>
              <UiText style={[styles.stepText, index === reading.step ? { color: colors.ink, fontWeight: "700" } : null]}>{t(`eventsV2.${key}`)}</UiText>
            </View>
          ))}
        </View>
      ) : null}
    </AppScreen>
  );
}

// .crit：名称和分数一行（不截断），下面是 6 高的 .bar、渐变填充 + 右端 14 的圆钮（rose 版用于时间对効果）。
function Crit({ label, value, rose, gradientId }: { label: string; value: EventAssessmentDisplayValue; rose?: boolean; gradientId: string }) {
  const { styles, colors } = useStyles();
  const text = value.min !== undefined && value.max !== undefined && value.min !== value.max ? `${value.min}–${value.max}` : String(value.value);
  const width = Math.max(0, Math.min(100, value.value));
  return (
    <View style={styles.crit}>
      <View style={styles.critHead}><UiText style={styles.critLabel}>{label}</UiText><UiText style={styles.critScore}>{text}</UiText></View>
      <View style={styles.bar}>
        <View style={[styles.barFill, { width: `${width}%` }]}>
          <KitGradient id={`events-crit-${rose ? "rose" : "plum"}-${gradientId}`} from={rose ? colors.rose300 : colors.plum300} to={rose ? colors.rose700 : colors.plum700} angle={90} />
        </View>
        <View style={[styles.barKnob, { borderColor: rose ? colors.rose700 : colors.plum700, left: `${width}%` }]} />
      </View>
      {value.reason ? <UiText style={styles.lbl}>{value.reason}</UiText> : null}
    </View>
  );
}

// .list > .li + .li::before：1px 线，从 50 起。
function ListLine() {
  const { styles } = useStyles();
  return <View style={styles.liLine} />;
}

/** 来源 chip（.chip.lav + 图标 sm）：URL 的域名路径 / 「ポスター画像」。 */
function SourceChip({ item }: { item: EventAssessmentContract }) {
  const { styles, colors } = useStyles();
  const { t } = useOrbitLocale();
  const label = item.sourceKind === "poster" ? t("eventsV2.posterImage") : item.sourceLabel;
  if (!label) return null;
  return (
    <View style={[styles.chip, styles.chipLav, { alignSelf: "center", gap: 4 }]}>
      <Icon name={item.sourceKind === "poster" ? "image" : "link"} size={16} color={colors.macLavInk} />
      <UiText style={[styles.chipText, { color: colors.macLavInk }]} numberOfLines={1}>{label}</UiText>
    </View>
  );
}

/** `/events/assessments/[id]`: the result (app.html #31 / b2 #3) or the failure state for that assessment. */
/** ⋯ on an assessment: 删除 (confirmed), like Mail / Notes; back to the list afterwards. */
function AssessmentMoreButton({ item }: { item: EventAssessmentContract }) {
  const router = useRouter();
  const { t } = useOrbitLocale();
  const toast = useToast();
  const api = useEventsApi();
  const [menu, setMenu] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const remove = async () => {
    setConfirm(false);
    const result = await api.remove(item.id);
    if (!result.ok) { toast.error(t("eventsV2.genericError")); return; }
    toast.success(t("eventsV2.assessmentDeleted"));
    if (router.canGoBack()) router.back(); else router.replace("/events" as Href);
  };
  return (
    <>
      <IconButton icon="more" accessibilityLabel={t("eventsV2.moreActions")} onPress={() => setMenu(true)} />
      <ActionSheet visible={menu} title={item.facts.title || t("eventsV2.assessTitleShort")} onClose={() => setMenu(false)}
        onSelect={(key) => { setMenu(false); if (key === "delete") setConfirm(true); }}
        options={[{ destructive: true, key: "delete", label: t("eventsV2.deleteAssessment") }]} />
      <ConfirmDialog visible={confirm} destructive title={t("eventsV2.deleteAssessmentTitle")} message={t("eventsV2.deleteAssessmentBody")}
        confirmLabel={t("eventsV2.deleteAssessment")} cancelLabel={t("eventsV2.keepAssessment")} onConfirm={() => void remove()} onCancel={() => setConfirm(false)} />
    </>
  );
}

export function AssessmentResultScreen() {
  const { styles, colors } = useStyles();
  const router = useRouter();
  const { t, language } = useOrbitLocale();
  const toast = useToast();
  const api = useEventsApi();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [item, setItem] = useState<EventAssessmentContract | null>(null);
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState(false);
  useEffect(() => { let live = true; void api.detail(id ?? "").then((result) => { if (live && result.ok) setItem(result.data); }); return () => { live = false; }; }, [api, id]);

  if (!item) return <AppScreen title={t("eventsV2.assessTitleShort")}><View /></AppScreen>;
  const decide = async (decision: "add" | "skip") => {
    setBusy(true);
    const result = decision === "add" ? await api.addToPlan(item.id) : await api.dismiss(item.id);
    setBusy(false);
    if (result.ok === false) { toast.error(t("eventsV2.genericError")); return; }
    setItem({ ...item, userDecision: decision === "add" ? "added" : "dismissed" });
    toast.success(decision === "add" ? t("eventsV2.added") : t("eventsV2.skipped"));
  };
  const more = <AssessmentMoreButton item={item} />;
  if (item.failureReason === "not_event_page") return <NotEventPageScreen item={item} headerActions={more} />;
  if (item.status === "needs_input") {
    return (
      <AppScreen title={t("eventsV2.assessTitleShort")} subtitle={Object.values(item.facts).some(Boolean) ? t("eventsV2.posterPartial") : t("eventsV2.posterNothing")} headerActions={more}>
        <FillThree item={item} onSubmit={async (facts, unknown) => {
          const patched = await api.fill(item.id, { facts, unknownFields: unknown });
          if (patched.ok) setItem(patched.data); else toast.error(t("eventsV2.genericError"));
        }} />
      </AppScreen>
    );
  }
  // Any other failed read (login wall, site not reachable, unreadable, AI busy) shows why and other ways to go on —
  // never a bare 0 / 100 result. (A poster that needs the user to fill in facts is handled above.)
  if (item.status === "failed") return <ReadFailedScreen item={item} headerActions={more} />;
  const display = item.display;
  // 补过的项（有值的）与仍是不明的项（补的时候选了「不明」）。
  const userFields = item.userFilledFields ?? [];
  const filled = userFields.filter((field) => Boolean(item.facts[field]));
  const stillUnknown = userFields.filter((field) => !item.facts[field]);
  const fieldLabel = (field: keyof EventAssessmentFacts) => t(field === "startsAt" ? "eventsV2.fieldWhen" : field === "price" ? "eventsV2.fieldFee" : field === "venue" || field === "area" ? "eventsV2.fieldWhere" : "eventsV2.fieldName");
  const source = item.sourceKind === "url" ? t("eventsV2.sourceUrl", { s: item.readSeconds ?? 1 }) : item.sourceKind === "poster" ? (filled.length ? t("eventsV2.sourcePosterManual") : t("eventsV2.sourcePoster")) : item.sourceKind === "manual" ? t("eventsV2.sourceManual") : t("eventsV2.sourceOrbit");
  const verdict = item.verdict === "conditional" && filled.length ? t("eventsV2.verdictConditionalLong") : t(`eventsV2.${verdictKey(item.verdict)}`);
  const price = item.facts.price === EVENT_PRICE_FREE ? t("eventsV2.free") : item.facts.price ?? (stillUnknown.includes("price") ? t("eventsV2.feeUnknownLabel") : null);
  // The range note explains an unknown fee only; with a known fee the bar's own reason line says why.
  const ranged = display && !item.facts.price ? [display.goalFit, display.people, display.timeCost].find((value) => value.min !== undefined && value.max !== undefined && value.min !== value.max) : undefined;
  const hero = filled.length ? { pad: 20, ring: 130, stroke: 12, big: 40, gap: 16 } : { pad: 22, ring: 150, stroke: 13, big: 44, gap: 18 };
  const shareText = [item.facts.title, item.facts.url].filter(Boolean).join("\n");
  const share = () => { Share.share({ message: shareText }).catch(() => undefined); };
  return (
    <AppScreen title={t("eventsV2.assessTitleShort")} subtitle={source}
      headerActions={<>{shareText ? <IconButton icon="share" accessibilityLabel={t("eventsV2.share")} onPress={share} /> : null}{more}</>}>
      <View style={styles.page} testID="events-result">
        <View style={[styles.card, { alignItems: "center", paddingHorizontal: 18, paddingVertical: hero.pad }]}>
          <SourceChip item={item} />
          {item.facts.title ? <UiText style={styles.title16}>{item.facts.title}</UiText> : null}
          <UiText style={[styles.lbl, { textAlign: "center" }]}>{[appEventWhen(item.facts.startsAt, language), item.facts.venue ?? item.facts.area, price].filter(Boolean).join(" · ")}</UiText>
          <View style={{ marginBottom: 6, marginTop: hero.gap }}>
            <ScoreRing size={hero.ring} stroke={hero.stroke} value={item.total} color={colors[ringColor(item.total)]} label={String(item.total)} fontSize={hero.big}>
              <View style={{ alignItems: "center" }}>
                <UiText style={[styles.big, { fontSize: hero.big, lineHeight: hero.big * 1.05 * 1.1 }]}>{item.total}</UiText>
                <UiText style={[styles.lbl, { lineHeight: 11.5 * 1.1 }]}>{t("eventsV2.outOf100")}</UiText>
              </View>
            </ScoreRing>
          </View>
          <View style={[styles.verdictChip, { backgroundColor: item.verdict === "recommend" ? colors.macTeal : item.verdict === "conditional" ? colors.macApricot : colors.surface2 }]}>
            <UiText style={[styles.verdictText, { color: item.verdict === "recommend" ? colors.macTealInk : item.verdict === "conditional" ? colors.macApricotInk : colors.ink2 }]}>{item.verdict === "recommend" ? `✓ ${verdict}` : verdict}</UiText>
          </View>
        </View>
        {filled.length ? (
          <View style={styles.card} testID="events-result-filled">
            <View style={[styles.row, { gap: 8 }]}>
              <View style={[styles.emoSm, { backgroundColor: colors.macApricot }]}><UiText style={styles.emoTextSm}>✍️</UiText></View>
              <View style={styles.grow}>
                <UiText style={styles.title13}>{t("eventsV2.filledByYou", { n: filled.length })}</UiText>
                <UiText style={styles.lbl}>{filledLine([...filled.map((field) => (item.adoptedGuessFields ?? []).includes(field) ? `${fieldLabel(field)}${t("eventsV2.guessAdopted")}` : fieldLabel(field)), ...stillUnknown.map((field) => t("eventsV2.stillUnknown", { field: fieldLabel(field) }))])}</UiText>
              </View>
              {ranged ? <UiPressable accessibilityRole="button" accessibilityLabel={t("eventsV2.why")} onPress={() => setWhy((open) => !open)} style={styles.why}><UiText style={styles.whyText}>?</UiText></UiPressable> : null}
            </View>
            {why && ranged ? <View style={styles.whyBody}><UiText style={styles.whyBodyText}>{t("eventsV2.rangeNote", { range: `${ranged.min}〜${ranged.max}` })}</UiText></View> : null}
          </View>
        ) : null}
        {display ? (
          <View style={styles.card}>
            <View style={styles.cardH}><UiText style={styles.cardTitle}>{t("eventsV2.breakdownLong")}</UiText></View>
            <View style={{ gap: 14 }}>
              <Crit label={t("eventsV2.dimGoal")} value={display.goalFit} gradientId="goal" />
              <Crit label={t("eventsV2.dimPeople")} value={display.people} gradientId="people" />
              <Crit label={t("eventsV2.dimTime")} value={display.timeCost} rose gradientId="time" />
            </View>
          </View>
        ) : null}
        {item.meetCandidates?.length ? (
          <View style={styles.card}>
            <View style={styles.cardH}><UiText style={styles.cardTitle}>{t("eventsV2.meetTitle")}</UiText><UiText style={styles.lbl}>{t("eventsV2.meetBasis")}</UiText></View>
            {item.meetCandidates.map((meet, index) => (
              <View key={`${meet.label}-${index}`} style={styles.li}>
                {index > 0 ? <ListLine /> : null}
                <View style={[styles.emoSm, { backgroundColor: [colors.macLav, colors.macBlue, colors.macTeal][index % 3] }]}><UiText style={styles.emoTextSm}>{meet.emoji}</UiText></View>
                <View style={styles.grow}><UiText style={styles.metaTitle} numberOfLines={1}>{meet.label}</UiText><UiText style={styles.metaSub} numberOfLines={1}>{meet.basis}</UiText></View>
              </View>
            ))}
          </View>
        ) : null}
        {item.cautions?.length ? (
          <View style={[styles.card, styles.flat]}>
            <View style={[styles.row, { alignItems: "flex-start", gap: 8 }]}>
              <View style={{ marginTop: 1 }}><Icon name="alert" size={16} color={colors.coral} /></View>
              <View style={styles.grow}>
                <UiText style={styles.cautionTitle}>{t("eventsV2.cautionsTitleShort")}</UiText>
                <UiText style={styles.cautionText}>{item.cautions.map((caution) => caution.text).join(" · ")}</UiText>
              </View>
            </View>
          </View>
        ) : null}
        <View style={styles.grid2}>
          <UiPressable accessibilityRole="button" accessibilityLabel={item.userDecision === "dismissed" ? t("eventsV2.skipped") : t("eventsV2.skip")} disabled={busy || item.userDecision === "dismissed"} onPress={() => void decide("skip")} style={[styles.btn, styles.grow, item.userDecision === "dismissed" ? { opacity: 0.6 } : null]}><UiText style={styles.btnText}>{item.userDecision === "dismissed" ? t("eventsV2.skipped") : t("eventsV2.skip")}</UiText></UiPressable>
          {filled.length && ranged && item.eventId ? (
            // b2 #3：补过项、分数是幅时主按钮是「詳細を見る」——Orbit 的活动去活动详情（/events/[id]，R27 换页路径不变）；
            // 外部活动没有详情页，展开幅的说明后换回「参加予定に追加」，不留死路（主会话 2026-10-15）。
            <UiPressable accessibilityRole="button" accessibilityLabel={t("eventsV2.seeDetails")} onPress={() => (item.eventId ? router.push(`/events/${encodeURIComponent(item.eventId)}` as Href) : setWhy(true))} style={[styles.btnPrimary, styles.grow]}><UiText style={styles.btnPrimaryText}>{t("eventsV2.seeDetails")}</UiText></UiPressable>
          ) : (
            <UiPressable accessibilityRole="button" accessibilityLabel={item.userDecision === "added" ? t("eventsV2.added") : t("eventsV2.addToPlan")} disabled={busy || item.userDecision === "added"} onPress={() => void decide("add")} style={[styles.btnPrimary, styles.grow, item.userDecision === "added" ? { opacity: 0.6 } : null]}><UiText style={styles.btnPrimaryText}>{item.userDecision === "added" ? `✓ ${t("eventsV2.added")}` : t("eventsV2.addToPlan")}</UiText></UiPressable>
          )}
        </View>
      </View>
      {busy ? null : <View testID="events-result-ready" />}
    </AppScreen>
  );
}

/** 「日時 · 場所（推測を採用）· 参加費は不明のまま」：全角括号后面的分隔只留「· 」（同画板）。 */
function filledLine(parts: readonly string[]): string {
  return parts.reduce((line, part, index) => (index === 0 ? part : `${line}${line.endsWith("）") ? "· " : " · "}${part}`), "");
}

/** 貼り付けた URL（.input.fill，读不到时 .err 珊瑚色内描边）。 */
function PastedUrl({ item, error }: { item: EventAssessmentContract; error?: boolean }) {
  const { styles, colors } = useStyles();
  const { t } = useOrbitLocale();
  return (
    <>
      <UiText style={styles.lbl}>{t("eventsV2.pastedUrl")}</UiText>
      <View style={[styles.input, error ? styles.inputErr : null, { marginTop: 6 }]}>
        <Icon name="link" size={16} color={colors.ink} />
        <UiText style={styles.inputText} numberOfLines={1}>{item.facts.url ?? item.sourceLabel}</UiText>
      </View>
    </>
  );
}

/** Why the read failed, in plain words: [chip, one line]. */
function failureCopy(reason: EventAssessmentContract["failureReason"]) {
  if (reason === "login_required") return ["eventsV2.loginTitle", "eventsV2.loginSub"] as const;
  if (reason === "unreadable" || reason === "too_large") return ["eventsV2.failUnreadable", "eventsV2.failUnreadableSub"] as const;
  if (reason === "ai_unavailable" || reason === "quota_exceeded") return ["eventsV2.failBusy", "eventsV2.failBusySub"] as const;
  return ["eventsV2.failFetch", "eventsV2.failFetchSub"] as const;
}

function ReadFailedScreen({ item, headerActions }: { item: EventAssessmentContract; headerActions?: ReactNode }) {
  const { styles, colors } = useStyles();
  const { t } = useOrbitLocale();
  const router = useRouter();
  const [chip, line] = failureCopy(item.failureReason);
  const way = (emoji: string, tone: string, title: string, sub: string, onPress: () => void, testID: string) => (
    <UiPressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={styles.optRow} testID={testID}>
      <View style={[styles.emoSm, { backgroundColor: tone }]}><UiText style={styles.emoTextSm}>{emoji}</UiText></View>
      <View style={styles.grow}><UiText style={styles.optTitle}>{title}</UiText><UiText style={styles.optSub}>{sub}</UiText></View>
      <Icon name="right" size={16} color={colors.ink3} />
    </UiPressable>
  );
  return (
    <AppScreen title={t("eventsV2.assessTitleShort")} subtitle={t("eventsV2.readFailed")} backIcon="x" headerActions={headerActions}>
      <View style={styles.page} testID={item.failureReason === "login_required" ? "events-login-required" : "events-read-failed"}>
        <View style={styles.card}>
          <PastedUrl item={item} error />
          <View style={[styles.row, { flexWrap: "wrap", gap: 6, marginTop: 10 }]}>
            <View style={[styles.chip, { backgroundColor: colors.coralSoft }]}><UiText style={[styles.chipText, { color: colors.coral }]}>{t(chip)}</UiText></View>
            <UiText style={styles.lbl}>{t(line)}</UiText>
          </View>
        </View>
        <View style={styles.card}>
          <View style={[styles.row, { alignItems: "flex-start" }]}>
            <View style={[styles.emo, { backgroundColor: colors.macApricot }]}><UiText style={styles.emoText}>{item.failureReason === "login_required" ? "🔒" : "💡"}</UiText></View>
            <View style={styles.grow}><UiText style={styles.cardTitle}>{t("eventsV2.otherWays")}</UiText>{item.failureReason === "login_required" ? <UiText style={[styles.lbl, { marginTop: 2 }]}>{t("eventsV2.noProxyLogin")}</UiText> : null}</View>
          </View>
          {way("🖼️", colors.macBlue, t("eventsV2.wayShot"), t("eventsV2.wayShotSub"), () => router.push("/events/assess?mode=poster" as Href), "events-way-shot")}
          {way("✍️", colors.macTeal, t("eventsV2.wayManual"), t("eventsV2.wayManualSub"), () => router.push("/events/assess?mode=manual" as Href), "events-way-manual")}
        </View>
        <UiPressable accessibilityRole="button" accessibilityLabel={t("eventsV2.tryOtherUrl")} onPress={() => router.replace("/events/assess?mode=url" as Href)} style={[styles.btn, styles.btnGhost, { marginTop: -14 }]}>
          <Icon name="refresh" size={16} color={colors.ink2} /><UiText style={[styles.btnText, { color: colors.ink2 }]}>{t("eventsV2.tryOtherUrl")}</UiText>
        </UiPressable>
      </View>
    </AppScreen>
  );
}

function NotEventPageScreen({ item, headerActions }: { item: EventAssessmentContract; headerActions?: ReactNode }) {
  const { styles, colors } = useStyles();
  const { t, language } = useOrbitLocale();
  const router = useRouter();
  const api = useEventsApi();
  const candidates = item.pageCandidates ?? [];
  const [creating, setCreating] = useState(false);
  const assessCandidate = (url: string) => {
    if (creating) return;
    setCreating(true);
    void api.create({ idempotencyKey: newIdempotencyKey(), sourceKind: "url", url }).then((created) => {
      setCreating(false);
      if (created.ok) router.replace(`/events/assessments/${encodeURIComponent(created.data.id)}` as Href);
    });
  };
  return (
    <AppScreen title={t("eventsV2.assessTitleShort")} subtitle={t("eventsV2.notEventTitle")} backIcon="x" headerActions={headerActions}>
      <View style={styles.page} testID="events-not-event-page">
        <View style={styles.card}>
          <PastedUrl item={item} />
          <View style={[styles.row, { gap: 6, marginTop: 10 }]}>
            <View style={[styles.chip, { backgroundColor: colors.macApricot }]}><UiText style={[styles.chipText, { color: colors.macApricotInk }]}>{t("eventsV2.articlePage")}</UiText></View>
            <UiText style={styles.lbl}>{t("eventsV2.notEventSub")}</UiText>
          </View>
        </View>
        <View style={styles.card}>
          <View style={styles.cardH}>
            <View style={[styles.row, { gap: 8 }]}><View style={[styles.emoSm, { backgroundColor: colors.macLav }]}><UiText style={styles.emoTextSm}>🔎</UiText></View><UiText style={styles.cardTitle}>{t("eventsV2.eventsOnPage")}</UiText></View>
            <UiText style={styles.lbl}>{t("eventsV2.countItems", { n: candidates.length })}</UiText>
          </View>
          {candidates.map((candidate, index) => {
            const day = candidate.startsAt ? tokyoDay(candidate.startsAt) : null;
            return (
              <View key={candidate.title} style={styles.li}>
                {index > 0 ? <ListLine /> : null}
                <View style={styles.datebox}>
                  <UiText style={styles.dateDay}>{day ? String(day.day) : "—"}</UiText>
                  <UiText style={styles.dateMonth}>{day ? t("eventsV2.monthShort", { month: day.month }) : ""}</UiText>
                </View>
                <View style={styles.grow}><UiText style={styles.metaTitle} numberOfLines={1}>{candidate.title}</UiText><UiText style={styles.metaSub} numberOfLines={1}>{[candidate.venue, candidate.startsAt ? appEventTime(candidate.startsAt, language) : null, candidate.note].filter(Boolean).join(" · ")}</UiText></View>
                <UiPressable accessibilityRole="button" accessibilityLabel={t("eventsV2.assess")} disabled={creating} onPress={() => { if (candidate.url) assessCandidate(candidate.url); else router.push("/events/assess?mode=manual" as Href); }} style={styles.btnSm}>
                  <UiText style={styles.btnSmText}>{t("eventsV2.assess")}</UiText>
                </UiPressable>
              </View>
            );
          })}
        </View>
        <View style={[styles.card, styles.flat]}>
          <View style={styles.row}>
            <View style={[styles.emoSm, { backgroundColor: colors.macTeal }]}><UiText style={styles.emoTextSm}>✍️</UiText></View>
            <View style={styles.grow}><UiText style={styles.title13}>{t("eventsV2.noneOfThese")}</UiText><UiText style={styles.lbl}>{t("eventsV2.noneOfTheseSub")}</UiText></View>
            <UiPressable accessibilityRole="button" accessibilityLabel={t("eventsV2.manual")} onPress={() => router.push("/events/assess?mode=manual" as Href)} style={styles.btnSm}><UiText style={styles.btnSmText}>{t("eventsV2.manual")}</UiText></UiPressable>
          </View>
        </View>
      </View>
    </AppScreen>
  );
}

/** 读取状态点 .cf（7px）：读到 ok / 推测 guess / 读不到 ng。 */
function FactDot({ tone }: { tone: "ok" | "guess" | "ng" }) {
  const { colors } = useOrbitTheme();
  return <View style={{ backgroundColor: tone === "ok" ? colors.ok : tone === "guess" ? colors.macApricotInk : colors.coral, borderRadius: 3.5, height: 7, width: 7 }} />;
}

/** ポスター（b2 #2 .poster 130 高）：用户的海报图片暂不回显，画渐变底 + 读到的名称（ブレを検出时加 chip）。 */
function PosterPreview({ item }: { item: EventAssessmentContract }) {
  const { styles, colors } = useStyles();
  const { t } = useOrbitLocale();
  return (
    <View style={[styles.card, { padding: 10 }]}>
      <View style={styles.poster}>
        <KitGradient id="events-poster-bg" from={colors.macBlue} to={colors.macLav} />
        {/* 画板里 chip 在海报纸片下面（.tagb 先于 .pz）。 */}
        {item.readIssue === "blurry" ? <View style={[styles.chip, styles.posterTag, { backgroundColor: colors.coralSoft }]}><UiText style={[styles.chipText, { color: colors.coral }]}>{t("eventsV2.blurDetected")}</UiText></View> : null}
        <View style={styles.posterSheet}>
          <UiText style={styles.posterTitle} numberOfLines={2}>{item.facts.title ?? ""}</UiText>
          <View style={styles.posterLine} /><View style={[styles.posterLine, { width: "60%" }]} /><View style={[styles.posterLine, { width: "80%" }]} />
        </View>
      </View>
    </View>
  );
}

/** 判定に必要な3項目 (b2 #2): 日時 · 場所 · 参加費, 「不明」 allowed → rule-only re-score with a range. */
function FillThree({ item, onSubmit }: { item: EventAssessmentContract | null; onSubmit: (facts: EventAssessmentFacts, unknown: ("startsAt" | "venue" | "price")[]) => void }) {
  const { styles, colors } = useStyles();
  const { t, language } = useOrbitLocale();
  const facts = item?.facts ?? {};
  const basis = item?.factBasis ?? {};
  const [title, setTitle] = useState(facts.title ?? "");
  // 日期和时间用 iOS 式的选择器（不再手打 YYYY-MM-DD HH:mm）；活动时间按东京时间提交。
  const [day, setDay] = useState(facts.startsAt ? facts.startsAt.slice(0, 10) : "");
  const [time, setTime] = useState(facts.startsAt ? facts.startsAt.slice(11, 16) : "");
  const [picking, setPicking] = useState<"date" | "time" | null>(null);
  const [where, setWhere] = useState(facts.venue && basis.venue !== "guessed" ? facts.venue : "");
  const [online, setOnline] = useState(false);
  // 海报读到了参加費就从读到的值开始（不算「不明」，也不当作用户补的）。
  const readFee = facts.price === EVENT_PRICE_FREE ? "free" : facts.price ? "paid" : "unknown";
  const [fee, setFee] = useState<"free" | "paid" | "unknown">(readFee);
  const [amount, setAmount] = useState(facts.price && facts.price !== EVENT_PRICE_FREE ? facts.price.replace(/[^\d]/g, "") : "");
  const parsedWhen = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})$/.exec(`${day} ${time}`);
  const known = [parsedWhen, online || where.trim(), fee !== "unknown"].filter(Boolean).length;
  const submit = () => {
    const unknown: ("startsAt" | "venue" | "price")[] = [];
    const next: EventAssessmentFacts = {};
    if (!facts.title && title.trim()) next.title = title.trim();
    if (parsedWhen) next.startsAt = `${parsedWhen[1]}-${parsedWhen[2]}-${parsedWhen[3]}T${parsedWhen[4]!.padStart(2, "0")}:${parsedWhen[5]}:00+09:00`; else unknown.push("startsAt");
    if (online) next.area = EVENT_AREA_ONLINE; else if (where.trim()) next.venue = where.trim(); else unknown.push("venue");
    const feeUnchanged = item !== null && readFee !== "unknown" && fee === readFee && (fee === "free" || amount === (facts.price ?? "").replace(/[^\d]/g, ""));
    if (feeUnchanged) { /* 读到的参加費原样保留，不提交 */ } else if (fee === "free") next.price = EVENT_PRICE_FREE; else if (fee === "paid" && amount) next.price = `¥${Number(amount).toLocaleString("en-US")}`; else unknown.push("price");
    onSubmit(next, unknown);
  };
  const tone = (field: keyof EventAssessmentFacts): "ok" | "guess" | "ng" => basis[field] === "guessed" ? "guess" : facts[field] ? "ok" : "ng";
  const rows = ([["fieldName", "title", facts.title], ["fieldOrganizer", "organizer", facts.organizer], ["fieldWhen", "startsAt", facts.startsAt ? appEventWhen(facts.startsAt, language) : null], ["fieldWhere", "venue", facts.venue ? `${facts.venue}${basis.venue === "guessed" ? "？" : ""}` : null], ["fieldFee", "price", facts.price]] as const);
  return (
    <View style={styles.page} testID="events-fill">
      {item ? (
        <>
          <PosterPreview item={item} />
          <View style={[styles.card, { paddingHorizontal: 16, paddingVertical: 6 }]}>
            {rows.map(([label, field, value], index) => (
              <View key={label} style={[styles.frow, index > 0 ? styles.frowLine : null]}>
                <UiText style={[styles.lbl, { width: 52 }]}>{t(`eventsV2.${label}`)}</UiText>
                <View style={{ width: 8 }}><FactDot tone={tone(field)} /></View>
                <UiText style={[styles.frowValue, value ? null : { color: colors.ink3 }]} numberOfLines={1}>{value ?? "—"}</UiText>
                {tone(field) === "ng" ? <View style={[styles.chip, { backgroundColor: colors.coralSoft }]}><UiText style={[styles.chipText, { color: colors.coral }]}>{t("eventsV2.unreadable")}</UiText></View>
                  : tone(field) === "guess" ? <View style={[styles.chip, { backgroundColor: colors.macApricot }]}><UiText style={[styles.chipText, { color: colors.macApricotInk }]}>{t("eventsV2.guessed")}</UiText></View> : null}
              </View>
            ))}
          </View>
        </>
      ) : null}
      {/* 名称没读到（或手动判断）时也能填，结果和列表里才有名字。 */}
      {!facts.title ? (
        <View style={styles.card}><UiText style={styles.lbl}>{t("eventsV2.fieldName")}</UiText><TextInput value={title} onChangeText={setTitle} style={[styles.input, styles.inputText, { marginTop: 4 }]} accessibilityLabel={t("eventsV2.fieldName")} testID="events-fill-title" /></View>
      ) : null}
      <View style={[styles.card, { overflow: "hidden" }]}>
        <KitGradient id="events-fill-bg" from={colors.macLav} to={colors.surface} stop={0.6} angle={150} />
        <View style={[styles.row, { justifyContent: "space-between" }]}>
          <UiText style={styles.cardTitle}>{t("eventsV2.requiredThree")}</UiText>
          <View style={[styles.chip, styles.chipLav]}><UiText style={[styles.chipText, { color: colors.macLavInk }]}>{`${known} / 3`}</UiText></View>
        </View>
        <UiText style={[styles.lbl, { marginBottom: 12, marginTop: 2 }]}>{t("eventsV2.requiredHint")}</UiText>
        <UiText style={styles.lbl}>{t("eventsV2.fieldWhen")}</UiText>
        <View style={[styles.row, { gap: 8, marginTop: 4 }]} testID="events-fill-when">
          <UiPressable accessibilityRole="button" accessibilityLabel={`${t("personal53.date")} ${day}`} onPress={() => setPicking("date")} style={[styles.input, styles.inputOnCard, styles.grow]}>
            <Icon name="calendar" size={16} color={colors.ink3} />
            <UiText style={[styles.inputText, day ? null : { color: colors.ink3 }]}>{day ? appEventWhen(`${day}T12:00:00+09:00`, language).replace(/\s*\d{1,2}:\d{2}.*$/, "") : t("personal53.date")}</UiText>
          </UiPressable>
          <UiPressable accessibilityRole="button" accessibilityLabel={`${t("personal53.time")} ${time}`} onPress={() => setPicking("time")} style={[styles.input, styles.inputOnCard, { minWidth: 110 }]}>
            <Icon name="clock" size={16} color={colors.ink3} />
            <UiText style={[styles.inputText, time ? null : { color: colors.ink3 }]}>{time || t("personal53.time")}</UiText>
          </UiPressable>
        </View>
        {picking ? (
          <PersonalScheduleDateTimePicker kind={picking} value={picking === "date" ? day : time} zone="Asia/Tokyo" disabled={false} title={t(picking === "date" ? "personal53.date" : "personal53.time")}
            onCancel={() => setPicking(null)}
            onConfirm={(value) => { if (picking === "date") { setDay(value); setPicking(time ? null : "time"); } else { setTime(value); setPicking(null); } }} />
        ) : null}
        <UiText style={[styles.lbl, { marginTop: 10 }]}>{t("eventsV2.fieldWhere")}</UiText>
        <View style={[styles.input, styles.inputOnCard, { marginTop: 4 }]}>
          <Icon name="pin" size={16} color={colors.ink3} />
          <TextInput value={where} onChangeText={(value) => { setWhere(value); setOnline(false); }} placeholder={t("eventsV2.whereHint")} placeholderTextColor={colors.ink3} style={styles.inputField} accessibilityLabel={t("eventsV2.fieldWhere")} />
        </View>
        <View style={[styles.row, { flexWrap: "wrap", gap: 6, marginTop: 6 }]}>
          {facts.venue && basis.venue === "guessed" ? (
            <UiPressable accessibilityRole="button" accessibilityLabel={t("eventsV2.useGuess", { value: facts.venue })} onPress={() => { setWhere(facts.venue!); setOnline(false); }} style={[styles.chip, { backgroundColor: colors.macApricot }]}>
              <UiText style={[styles.chipText, { color: colors.macApricotInk }]}>{t("eventsV2.useGuess", { value: facts.venue })}</UiText>
            </UiPressable>
          ) : null}
          <UiPressable accessibilityRole="button" accessibilityLabel={t("eventsV2.online")} accessibilityState={{ selected: online }} onPress={() => setOnline((value) => !value)} style={[styles.chip, online ? { backgroundColor: colors.macLav } : null]}>
            <UiText style={[styles.chipText, online ? { color: colors.macLavInk } : null]}>{t("eventsV2.online")}</UiText>
          </UiPressable>
        </View>
        <UiText style={[styles.lbl, { marginTop: 10 }]}>{t("eventsV2.fieldFee")}</UiText>
        <View style={[styles.seg, { marginTop: 4 }]}>
          {(["free", "paid", "unknown"] as const).map((key) => (
            <UiPressable key={key} accessibilityRole="button" accessibilityLabel={t(`eventsV2.${key}`)} accessibilityState={{ selected: fee === key }} onPress={() => setFee(key)} style={[styles.segOpt, fee === key ? styles.segOn : null]}>
              <UiText style={[styles.segText, fee === key ? { color: colors.ink } : null]}>{t(`eventsV2.${key}`)}</UiText>
            </UiPressable>
          ))}
        </View>
        {fee === "paid" ? <View style={[styles.input, styles.inputOnCard, { marginTop: 6 }]}><TextInput value={amount} onChangeText={(value) => setAmount(value.replace(/[^\d]/g, ""))} keyboardType="number-pad" placeholder="¥" placeholderTextColor={colors.ink3} style={styles.inputField} accessibilityLabel={t("eventsV2.fieldFee")} /></View> : null}
      </View>
      <View>
        <UiPressable accessibilityRole="button" accessibilityLabel={t("eventsV2.judgeWithThis")} onPress={submit} style={[styles.btnPrimary, { height: 46 }]} testID="events-fill-submit"><UiText style={styles.btnPrimaryText}>{t("eventsV2.judgeWithThis")}</UiText></UiPressable>
        <UiText style={[styles.lbl, { marginTop: 8, textAlign: "center" }]}>{t("eventsV2.inputOnlyHere")}</UiText>
      </View>
    </View>
  );
}

// kit 数值（app.html #31、b2 #0–#3）：.card 18 / r24、卡间 14、.input 44 / r14、.opt-row、.frow、.crit、.datebox、.seg。
const useStyles = createThemedStyles((colors) => StyleSheet.create({
  page: { gap: 14, marginHorizontal: 2, marginTop: -12 },
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: 18 },
  flat: { backgroundColor: colors.surface2 },
  row: { alignItems: "center", flexDirection: "row", gap: 10 },
  grow: { flex: 1, minWidth: 0 },
  lbl: { color: colors.ink3, fontSize: 13, fontWeight: "500", lineHeight: 20 },
  title16: { color: colors.ink, fontSize: 18, fontWeight: "800", lineHeight: 27, marginBottom: 2, marginTop: 10, textAlign: "center" },
  // 行内 b（13px）在 14px · 1.5 的行盒里。
  title13: { color: colors.ink, fontSize: 15, fontWeight: "700", lineHeight: 24 },
  cardTitle: { color: colors.ink, fontSize: 17, fontWeight: "800", lineHeight: 25 },
  cardH: { alignItems: "center", flexDirection: "row", gap: 8, justifyContent: "space-between", marginBottom: 12 },
  input: { alignItems: "center", backgroundColor: colors.surface2, borderRadius: radius.md, flexDirection: "row", gap: 8, height: 44, paddingHorizontal: 14 },
  inputErr: { borderColor: colors.coral, borderWidth: 1.5 },
  inputOnCard: { backgroundColor: colors.surface },
  inputText: { color: colors.ink, flex: 1, fontSize: 15, lineHeight: 22 },
  inputField: { color: colors.ink, flex: 1, fontSize: 15, height: 44 },
  urlInput: { color: colors.ink, fontSize: 15, minHeight: 44 },
  inputRow: { backgroundColor: colors.surface2, borderRadius: radius.md, marginTop: 6, minHeight: 44, justifyContent: "center", paddingHorizontal: 14 },
  codeInput: { backgroundColor: colors.surface2, borderRadius: radius.md, color: colors.ink, fontSize: 24, fontWeight: "800", height: 56, letterSpacing: 4, textAlign: "center" },
  wayRow: { alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.md, flexDirection: "row", gap: 12, marginTop: 8, padding: 12 },
  wayText: { color: colors.ink, fontSize: 16, fontWeight: "700", lineHeight: 23 },
  optRow: { alignItems: "center", backgroundColor: colors.surface2, borderRadius: 16, flexDirection: "row", gap: 10, marginTop: 8, paddingHorizontal: 12, paddingVertical: 11 },
  // .opt-row b：块级、13px，行高按 1.5 继承 = 19.5。
  optTitle: { color: colors.ink, fontSize: 15, fontWeight: "700", lineHeight: 22 },
  optSub: { color: colors.ink3, fontSize: 14, lineHeight: 21 },
  emo: { alignItems: "center", borderRadius: 13, height: 40, justifyContent: "center", width: 40 },
  emoSm: { alignItems: "center", borderRadius: 10, height: 32, justifyContent: "center", width: 32 },
  emoText: { fontSize: 23, lineHeight: 28 },
  emoTextSm: { fontSize: 19, lineHeight: 25 },
  stepDot: { alignItems: "center", backgroundColor: colors.surface2, borderRadius: radius.pill, height: 22, justifyContent: "center", width: 22 },
  stepNum: { color: colors.ink3, fontSize: 13, fontWeight: "700", lineHeight: 18 },
  stepText: { color: colors.ink3, fontSize: 15, lineHeight: 21 },
  big: { color: colors.ink, fontFamily: Platform.OS === "ios" ? "ui-rounded" : undefined, fontWeight: "800", letterSpacing: -0.88 },
  verdictChip: { borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 5 },
  verdictText: { fontSize: 15, fontWeight: "700", lineHeight: 23 },
  crit: { gap: 6 },
  critHead: { alignItems: "baseline", flexDirection: "row", gap: 10, justifyContent: "space-between" },
  critLabel: { color: colors.ink, flexShrink: 1, fontSize: 14, fontWeight: "600", lineHeight: 21 },
  bar: { backgroundColor: colors.surface3, borderRadius: 6, height: 6, marginHorizontal: 7 },
  barFill: { borderRadius: 6, bottom: 0, left: 0, overflow: "hidden", position: "absolute", top: 0 },
  barKnob: { backgroundColor: colors.surface, borderRadius: 7, borderWidth: 3, height: 14, marginLeft: -7, position: "absolute", top: -4, width: 14 },
  critScore: { color: colors.ink, flexShrink: 0, fontFamily: Platform.OS === "ios" ? "ui-rounded" : undefined, fontSize: 14, fontWeight: "800", lineHeight: 21, textAlign: "right" },
  li: { alignItems: "center", flexDirection: "row", gap: 12, paddingVertical: 11 },
  liLine: { backgroundColor: colors.line, height: 1, left: 50, position: "absolute", right: 0, top: 0 },
  metaTitle: { color: colors.ink, fontSize: 17, fontWeight: "700", lineHeight: 25 },
  metaSub: { color: colors.ink3, fontSize: 14, lineHeight: 21 },
  cautionTitle: { color: colors.ink, fontSize: 15, fontWeight: "700", lineHeight: 23 },
  cautionText: { color: colors.ink3, fontSize: 15, lineHeight: 23 },
  grid2: { flexDirection: "row", gap: 12 },
  btn: { alignItems: "center", backgroundColor: colors.surface2, borderRadius: radius.pill, flexDirection: "row", gap: 6, height: 40, justifyContent: "center", paddingHorizontal: 16 },
  btnGhost: { backgroundColor: "transparent" },
  btnText: { color: colors.ink, fontSize: 15, fontWeight: "700", lineHeight: 22 },
  btnSm: { alignItems: "center", backgroundColor: colors.surface2, borderRadius: radius.pill, height: 32, justifyContent: "center", paddingHorizontal: 12 },
  btnSmText: { color: colors.ink, fontSize: 14, fontWeight: "700", lineHeight: 21 },
  btnPrimary: { alignItems: "center", backgroundColor: colors.ink, borderRadius: radius.pill, height: 40, justifyContent: "center", paddingHorizontal: 16 },
  btnPrimaryText: { color: colors.bg, fontSize: 15, fontWeight: "700", lineHeight: 22 },
  chip: { alignItems: "center", alignSelf: "flex-start", backgroundColor: colors.surface2, borderRadius: radius.pill, flexDirection: "row", paddingHorizontal: 9, paddingVertical: 3 },
  chipLav: { backgroundColor: colors.macLav },
  chipText: { color: colors.ink2, fontSize: 13, fontWeight: "700", lineHeight: 20 },
  why: { alignItems: "center", backgroundColor: colors.surface2, borderRadius: 9, height: 18, justifyContent: "center", width: 18 },
  whyText: { color: colors.ink3, fontSize: 12, fontWeight: "800", lineHeight: 16 },
  whyBody: { backgroundColor: colors.surface2, borderRadius: radius.md, marginTop: 10, paddingHorizontal: 12, paddingVertical: 10 },
  whyBodyText: { color: colors.ink2, fontSize: 14, lineHeight: 23 },
  datebox: { backgroundColor: colors.surface2, borderRadius: 13, paddingVertical: 5, width: 44 },
  dateDay: { color: colors.ink, fontFamily: Platform.OS === "ios" ? "ui-rounded" : undefined, fontSize: 19, fontWeight: "800", lineHeight: 21, textAlign: "center" },
  // .datebox line-height 1.1：small 落在外层 14px 的行盒里（15.4）。
  dateMonth: { color: colors.ink3, fontSize: 12, fontWeight: "700", lineHeight: 18, textAlign: "center" },
  frow: { alignItems: "center", flexDirection: "row", gap: 8, paddingVertical: 9 },
  frowLine: { borderTopColor: colors.line, borderTopWidth: 1 },
  frowValue: { color: colors.ink, flex: 1, fontSize: 15, fontWeight: "700", lineHeight: 22 },
  poster: { alignItems: "center", borderRadius: 16, height: 130, justifyContent: "center", overflow: "hidden" },
  posterSheet: { backgroundColor: colors.surface, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 12, transform: [{ rotate: "-3deg" }], width: "62%" },
  posterTitle: { color: colors.ink, fontSize: 17, fontWeight: "700", lineHeight: 20, marginBottom: 8, marginTop: 4 },
  posterLine: { backgroundColor: colors.surface3, borderRadius: 3, height: 5, marginTop: 4 },
  posterTag: { left: 10, position: "absolute", top: 10 },
  seg: { backgroundColor: colors.surface, borderRadius: radius.pill, flexDirection: "row", gap: 2, padding: 3 },
  segOpt: { alignItems: "center", borderRadius: radius.pill, flex: 1, paddingHorizontal: 13, paddingVertical: 6 },
  segOn: { backgroundColor: colors.surface, ...shadows.segment },
  segText: { color: colors.ink2, fontSize: 14, fontWeight: "600", lineHeight: 21 },
}));
