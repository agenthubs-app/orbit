// R26 イベント評価 (App): the input and 判定中 (app.html #30), the result (#31, dark #37) and the failure states
// (b2 #0 login, #1 not an event page, #2 poster fill-in, #3 after filling). Scores come from the server by rule;
// a URL / poster read polls every 2 seconds for up to 90 seconds (DESIGN §5). The poster picker loads lazily.
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, TextInput, View } from "react-native";

import { EVENT_AREA_ONLINE, EVENT_PRICE_FREE } from "../../../api/compute/event-score-input";
import type { EventAssessmentContract, EventAssessmentCreateInput, EventAssessmentDisplayValue, EventAssessmentFacts } from "../../../api/contract/event-assessment";
import { AppScreen } from "../../../components/AppScreen";
import { Icon, RingChart, UiPressable, UiText, useToast } from "../../../components/ui";
import { createThemedStyles } from "../../../design/theme";
import { radius } from "../../../design/tokens";
import { useOrbitLocale } from "../../../i18n/OrbitLocaleContext";
import { newIdempotencyKey, useEventsApi, type EventsApi } from "./events-api";
import { appEventWhen, ringColor, verdictKey } from "./events-model";

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
    if (created.ok === false) { toast.error(created.reason === "rate_limited" ? t("eventsV2.rateLimited") : t("eventsV2.genericError")); return; }
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
    const images = await media.pickCardImages(3);
    if (!images?.length) return;
    const uploads = await Promise.all(images.slice(0, 3).map(async (image) => api.uploadPoster(await media.preparedImageBytes(image), image.mimeType)));
    const ids = uploads.flatMap((upload) => (upload.ok ? [upload.data.posterAssetId] : []));
    if (ids.length === 0) { toast.error(t("eventsV2.genericError")); return; }
    await run({ idempotencyKey: newIdempotencyKey(), posterAssetId: ids[0]!, ...(ids.length > 1 ? { posterAssetIds: ids } : {}), sourceKind: "poster" });
  }, [api, run, t, toast]);

  useEffect(() => { if (params.mode === "poster") void pickPoster(); }, [params.mode, pickPoster]);

  if (params.mode === "code") {
    const valid = /^[A-Z0-9]{8}$/.test(code);
    return (
      <AppScreen title={t("eventsV2.codeDialogTitle")} subtitle={t("eventsV2.codeDialogSub")}>
        <View style={styles.card}>
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
          <TextInput value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder={t("eventsV2.pasteHere")} placeholderTextColor={colors.ink3} style={styles.urlInput} accessibilityLabel={t("eventsV2.urlLabel")} testID="events-url-input"
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

function Crit({ label, value, rose }: { label: string; value: EventAssessmentDisplayValue; rose?: boolean }) {
  const { styles, colors } = useStyles();
  const text = value.min !== undefined && value.max !== undefined && value.min !== value.max ? `${value.min}–${value.max}` : String(value.value);
  return (
    <View style={styles.crit}>
      <UiText style={styles.critLabel}>{label}</UiText>
      <View style={styles.bar}><View style={[styles.barFill, { backgroundColor: rose ? colors.rose500 : colors.plum500, width: `${Math.min(100, value.max ?? value.value)}%` }]} /></View>
      <UiText style={styles.critScore}>{text}</UiText>
    </View>
  );
}

/** `/events/assessments/[id]`: the result (app.html #31) or the failure state for that assessment. */
export function AssessmentResultScreen() {
  const { styles, colors } = useStyles();
  const { t, language } = useOrbitLocale();
  const toast = useToast();
  const api = useEventsApi();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [item, setItem] = useState<EventAssessmentContract | null>(null);
  const [busy, setBusy] = useState(false);
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
  if (item.failureReason === "login_required") return <LoginRequiredScreen item={item} />;
  if (item.failureReason === "not_event_page") return <NotEventPageScreen item={item} />;
  if (item.status === "needs_input") {
    return (
      <AppScreen title={t("eventsV2.assessTitleShort")}>
        <FillThree item={item} onSubmit={async (facts, unknown) => {
          const patched = await api.fill(item.id, { facts, unknownFields: unknown });
          if (patched.ok) setItem(patched.data); else toast.error(t("eventsV2.genericError"));
        }} />
      </AppScreen>
    );
  }
  const display = item.display;
  const filled = item.userFilledFields ?? [];
  const source = item.sourceKind === "url" ? t("eventsV2.sourceUrl", { s: item.readSeconds ?? 1 }) : item.sourceKind === "poster" ? (filled.length ? t("eventsV2.sourcePosterManual") : t("eventsV2.sourcePoster")) : item.sourceKind === "manual" ? t("eventsV2.sourceManual") : t("eventsV2.sourceOrbit");
  const verdict = item.verdict === "conditional" && filled.length ? t("eventsV2.verdictConditionalLong") : t(`eventsV2.${verdictKey(item.verdict)}`);
  return (
    <AppScreen title={t("eventsV2.assessTitleShort")} subtitle={source}>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }} testID="events-result">
        {item.sourceLabel ? <View style={styles.urlChip}><UiText style={styles.lbl} numberOfLines={1}>{item.sourceLabel}</UiText></View> : null}
        <View style={[styles.card, { alignItems: "center" }]}>
          <UiText style={styles.title16}>{item.facts.title}</UiText>
          <UiText style={styles.lbl}>{[appEventWhen(item.facts.startsAt, language), item.facts.venue ?? item.facts.area, item.facts.price === EVENT_PRICE_FREE ? t("eventsV2.free") : item.facts.price].filter(Boolean).join(" · ")}</UiText>
          <View style={styles.heroRing}>
            <RingChart size={120} stroke={11} segments={[{ color: colors[ringColor(item.total)], value: item.total / 100 }]} accessibilityLabel={`${item.total}`} />
            <View style={styles.heroCenter}><UiText style={styles.big}>{item.total}</UiText><UiText style={styles.lbl}>{t("eventsV2.outOf100")}</UiText></View>
          </View>
          <View style={[styles.verdictChip, { backgroundColor: item.verdict === "recommend" ? colors.macTeal : item.verdict === "conditional" ? colors.macApricot : colors.surface2 }]}>
            <UiText style={[styles.verdictText, { color: item.verdict === "recommend" ? colors.macTealInk : item.verdict === "conditional" ? colors.macApricotInk : colors.ink2 }]}>{item.verdict === "recommend" ? `✓ ${verdict}` : verdict}</UiText>
          </View>
        </View>
        {filled.length ? <View style={[styles.card, { marginTop: 14 }]}><UiText style={styles.cardTitle}>{`✍️ ${t("eventsV2.filledByYou", { n: filled.length })}`}</UiText></View> : null}
        {display ? (
          <View style={[styles.card, { marginTop: 14 }]}>
            <UiText style={[styles.cardTitle, { marginBottom: 10 }]}>{t("eventsV2.breakdownLong")}</UiText>
            <Crit label={t("eventsV2.dimGoal")} value={display.goalFit} />
            <Crit label={t("eventsV2.dimPeople")} value={display.people} />
            <Crit label={t("eventsV2.dimTime")} value={display.timeCost} rose />
          </View>
        ) : null}
        {item.meetCandidates?.length ? (
          <View style={[styles.card, { marginTop: 14 }]}>
            <UiText style={styles.cardTitle}>{t("eventsV2.meetTitle")}</UiText>
            <UiText style={styles.lbl}>{t("eventsV2.meetBasis")}</UiText>
            {item.meetCandidates.map((meet, index) => (
              <View key={`${meet.label}-${index}`} style={[styles.row, { marginTop: 10 }]}>
                <View style={[styles.emoSm, { backgroundColor: [colors.macLav, colors.macBlue, colors.macTeal][index % 3] }]}><UiText style={styles.emoTextSm}>{meet.emoji}</UiText></View>
                <View style={{ flex: 1 }}><UiText style={styles.meetLabel}>{meet.label}</UiText><UiText style={styles.lbl}>{meet.basis}</UiText></View>
              </View>
            ))}
          </View>
        ) : null}
        {item.cautions?.length ? (
          <View style={[styles.card, { marginTop: 14 }]}>
            <UiText style={styles.cardTitle}>{t("eventsV2.cautionsTitleShort")}</UiText>
            <UiText style={[styles.lbl, { marginTop: 4 }]}>{item.cautions.map((caution) => caution.text).join(" · ")}</UiText>
          </View>
        ) : null}
      </ScrollView>
      <View style={styles.ctaBar}>
        <UiPressable accessibilityRole="button" accessibilityLabel={t("eventsV2.skip")} disabled={busy} onPress={() => void decide("skip")} style={[styles.btn, { flex: 1 }]}><UiText style={styles.btnText}>{t("eventsV2.skip")}</UiText></UiPressable>
        <UiPressable accessibilityRole="button" accessibilityLabel={t("eventsV2.addToPlan")} disabled={busy || item.userDecision === "added"} onPress={() => void decide("add")} style={[styles.btnPrimary, { flex: 1.4, marginTop: 0 }]}><UiText style={styles.btnPrimaryText}>{t("eventsV2.addToPlan")}</UiText></UiPressable>
      </View>
      {busy ? null : <View testID="events-result-ready" />}
    </AppScreen>
  );
}

function LoginRequiredScreen({ item }: { item: EventAssessmentContract }) {
  const { styles, colors } = useStyles();
  const { t } = useOrbitLocale();
  const router = useRouter();
  const way = (emoji: string, title: string, sub: string, onPress: () => void, testID: string) => (
    <UiPressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={styles.wayRow} testID={testID}>
      <UiText style={styles.emoText}>{emoji}</UiText>
      <View style={{ flex: 1 }}><UiText style={styles.wayText}>{title}</UiText><UiText style={styles.lbl}>{sub}</UiText></View>
      <Icon name="right" size={16} color={colors.ink3} />
    </UiPressable>
  );
  return (
    <AppScreen title={t("eventsV2.assessTitleShort")} subtitle={t("eventsV2.readFailed")}>
      <View style={styles.card} testID="events-login-required">
        <UiText style={styles.lbl}>{t("eventsV2.pastedUrl")}</UiText>
        <View style={styles.inputRow}><UiText style={styles.urlText} numberOfLines={1}>{item.facts.url ?? item.sourceLabel}</UiText></View>
        <View style={[styles.row, { marginTop: 14 }]}><View style={[styles.emo, { backgroundColor: colors.macApricot }]}><UiText style={styles.emoText}>🔒</UiText></View><View style={{ flex: 1 }}><UiText style={styles.cardTitle}>{t("eventsV2.loginTitle")}</UiText><UiText style={styles.lbl}>{t("eventsV2.loginSub")}</UiText></View></View>
      </View>
      <UiText style={[styles.lbl, { marginTop: 16 }]}>{t("eventsV2.otherWays")}</UiText>
      <UiText style={[styles.lbl, { marginBottom: 8 }]}>{t("eventsV2.noProxyLogin")}</UiText>
      {way("📋", t("eventsV2.wayPaste"), t("eventsV2.wayPasteSub"), () => router.push("/events/assess?mode=url" as Href), "events-way-paste")}
      {way("🖼️", t("eventsV2.wayShot"), t("eventsV2.wayShotSub"), () => router.push("/events/assess?mode=poster" as Href), "events-way-shot")}
      {way("✍️", t("eventsV2.wayManual"), t("eventsV2.wayManualSub"), () => router.push("/events/assess?mode=manual" as Href), "events-way-manual")}
      <UiPressable accessibilityRole="button" accessibilityLabel={t("eventsV2.tryOtherUrl")} onPress={() => router.replace("/events/assess?mode=url" as Href)} style={[styles.btn, { marginTop: 14 }]}><UiText style={styles.btnText}>{t("eventsV2.tryOtherUrl")}</UiText></UiPressable>
    </AppScreen>
  );
}

function NotEventPageScreen({ item }: { item: EventAssessmentContract }) {
  const { styles } = useStyles();
  const { t, language } = useOrbitLocale();
  const router = useRouter();
  const api = useEventsApi();
  const candidates = item.pageCandidates ?? [];
  return (
    <AppScreen title={t("eventsV2.assessTitleShort")} subtitle={t("eventsV2.notEventTitle")}>
      <View style={styles.card} testID="events-not-event-page">
        <UiText style={styles.lbl}>{t("eventsV2.pastedUrl")}</UiText>
        <View style={styles.inputRow}><UiText style={styles.urlText} numberOfLines={1}>{item.facts.url ?? item.sourceLabel}</UiText></View>
        <View style={[styles.row, { marginTop: 10 }]}><View style={styles.chip}><UiText style={styles.chipText}>{t("eventsV2.articlePage")}</UiText></View><UiText style={styles.lbl}>{t("eventsV2.notEventSub")}</UiText></View>
      </View>
      <View style={[styles.row, { marginBottom: 8, marginTop: 16 }]}><UiText>🔎</UiText><UiText style={styles.cardTitle}>{t("eventsV2.eventsOnPage")}</UiText><UiText style={styles.lbl}>{t("eventsV2.countItems", { n: candidates.length })}</UiText></View>
      {candidates.map((candidate) => (
        <View key={candidate.title} style={styles.wayRow}>
          <View style={{ flex: 1 }}><UiText style={styles.wayText}>{candidate.title}</UiText><UiText style={styles.lbl}>{[candidate.venue, candidate.startsAt ? appEventWhen(candidate.startsAt, language) : null, candidate.note].filter(Boolean).join(" · ")}</UiText></View>
          <UiPressable accessibilityRole="button" accessibilityLabel={t("eventsV2.assess")} onPress={() => { if (candidate.url) void api.create({ idempotencyKey: newIdempotencyKey(), sourceKind: "url", url: candidate.url }).then((created) => { if (created.ok) router.replace(`/events/assessments/${encodeURIComponent(created.data.id)}` as Href); }); else router.push("/events/assess?mode=manual" as Href); }} style={styles.btnSm}>
            <UiText style={styles.btnText}>{t("eventsV2.assess")}</UiText>
          </UiPressable>
        </View>
      ))}
      <View style={[styles.wayRow, { marginTop: 10 }]}>
        <UiText style={styles.emoText}>✍️</UiText>
        <View style={{ flex: 1 }}><UiText style={styles.wayText}>{t("eventsV2.noneOfThese")}</UiText><UiText style={styles.lbl}>{t("eventsV2.noneOfTheseSub")}</UiText></View>
        <UiPressable accessibilityRole="button" accessibilityLabel={t("eventsV2.manual")} onPress={() => router.push("/events/assess?mode=manual" as Href)} style={styles.btnSm}><UiText style={styles.btnText}>{t("eventsV2.manual")}</UiText></UiPressable>
      </View>
    </AppScreen>
  );
}

/** 判定に必要な3項目 (b2 #2): 日時 · 場所 · 参加費, 「不明」 allowed → rule-only re-score with a range. */
function FillThree({ item, onSubmit }: { item: EventAssessmentContract | null; onSubmit: (facts: EventAssessmentFacts, unknown: ("startsAt" | "venue" | "price")[]) => void }) {
  const { styles, colors } = useStyles();
  const { t, language } = useOrbitLocale();
  const facts = item?.facts ?? {};
  const basis = item?.factBasis ?? {};
  const [title, setTitle] = useState(facts.title ?? "");
  const [when, setWhen] = useState(facts.startsAt ? facts.startsAt.slice(0, 16).replace("T", " ") : "");
  const [where, setWhere] = useState(facts.venue ?? "");
  const [online, setOnline] = useState(false);
  const [fee, setFee] = useState<"free" | "paid" | "unknown" | null>(null);
  const [amount, setAmount] = useState("");
  const known = [facts.startsAt, facts.venue && basis.venue !== "guessed" ? facts.venue : null, facts.price].filter(Boolean).length;
  const status = (field: "startsAt" | "venue" | "price") => basis[field] === "guessed" ? [t("eventsV2.guessed"), colors.macApricot, colors.macApricotInk] : facts[field] ? ["✓", colors.macTeal, colors.macTealInk] : [t("eventsV2.unreadable"), colors.macPink, colors.macPinkInk];
  const submit = () => {
    const unknown: ("startsAt" | "venue" | "price")[] = [];
    const next: EventAssessmentFacts = {};
    if (!item && title.trim()) next.title = title.trim();
    const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})$/.exec(when.trim());
    if (match) next.startsAt = `${match[1]}-${match[2]}-${match[3]}T${match[4]!.padStart(2, "0")}:${match[5]}:00+09:00`; else unknown.push("startsAt");
    if (online) next.area = EVENT_AREA_ONLINE; else if (where.trim()) next.venue = where.trim(); else unknown.push("venue");
    if (fee === "free") next.price = EVENT_PRICE_FREE; else if (fee === "paid" && amount) next.price = `¥${Number(amount).toLocaleString("en-US")}`; else unknown.push("price");
    onSubmit(next, unknown);
  };
  const option = (label: string, on: boolean, onPress: () => void) => (
    <UiPressable key={label} accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={[styles.opt, on ? styles.optOn : null]}><UiText style={styles.optText}>{label}</UiText></UiPressable>
  );
  return (
    <View testID="events-fill">
      {item ? (
        <View style={styles.card}>
          <View style={styles.row}><UiText style={[styles.cardTitle, { flex: 1 }]}>{t("eventsV2.posterPartial")}</UiText>{item.readIssue === "blurry" ? <View style={[styles.chip, { backgroundColor: colors.macApricot }]}><UiText style={[styles.chipText, { color: colors.macApricotInk }]}>{t("eventsV2.blurDetected")}</UiText></View> : null}</View>
          {([["fieldName", facts.title, null], ["fieldOrganizer", facts.organizer, null], ["fieldWhen", facts.startsAt ? appEventWhen(facts.startsAt, language) : null, "startsAt"], ["fieldWhere", facts.venue ? `${facts.venue}${basis.venue === "guessed" ? "?" : ""}` : null, "venue"], ["fieldFee", facts.price, "price"]] as const).map(([label, value, field]) => (
            <View key={label} style={[styles.row, { marginTop: 8 }]}>
              <UiText style={[styles.lbl, { width: 56 }]}>{t(`eventsV2.${label}`)}</UiText>
              <UiText style={[styles.wayText, { flex: 1 }]}>{value ?? "—"}</UiText>
              {field ? <View style={[styles.chip, { backgroundColor: status(field)[1] }]}><UiText style={[styles.chipText, { color: status(field)[2] }]}>{status(field)[0]}</UiText></View> : null}
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.card}><UiText style={styles.lbl}>{t("eventsV2.fieldName")}</UiText><TextInput value={title} onChangeText={setTitle} style={styles.field} accessibilityLabel={t("eventsV2.fieldName")} /></View>
      )}
      <View style={[styles.card, { marginTop: 14 }]}>
        <View style={styles.row}><UiText style={[styles.cardTitle, { flex: 1 }]}>{t("eventsV2.requiredThree")}</UiText><UiText style={styles.lbl}>{`${known} / 3`}</UiText></View>
        <UiText style={[styles.lbl, { marginBottom: 10 }]}>{t("eventsV2.requiredHint")}</UiText>
        <UiText style={styles.lbl}>{t("eventsV2.fieldWhen")}</UiText>
        <TextInput value={when} onChangeText={setWhen} placeholder="2026-10-29 18:30" placeholderTextColor={colors.ink3} style={styles.field} accessibilityLabel={t("eventsV2.fieldWhen")} testID="events-fill-when" />
        <UiText style={styles.lbl}>{t("eventsV2.fieldWhere")}</UiText>
        <TextInput value={where} onChangeText={(value) => { setWhere(value); setOnline(false); }} placeholder={t("eventsV2.whereHint")} placeholderTextColor={colors.ink3} style={styles.field} accessibilityLabel={t("eventsV2.fieldWhere")} />
        <View style={styles.optRow}>
          {facts.venue && basis.venue === "guessed" ? option(t("eventsV2.useGuess", { value: facts.venue }), where === facts.venue, () => { setWhere(facts.venue!); setOnline(false); }) : null}
          {option(t("eventsV2.online"), online, () => setOnline((value) => !value))}
        </View>
        <UiText style={styles.lbl}>{t("eventsV2.fieldFee")}</UiText>
        <View style={styles.optRow}>
          {option(t("eventsV2.free"), fee === "free", () => setFee("free"))}
          {option(t("eventsV2.paid"), fee === "paid", () => setFee("paid"))}
          {option(t("eventsV2.unknown"), fee === "unknown", () => setFee("unknown"))}
        </View>
        {fee === "paid" ? <TextInput value={amount} onChangeText={(value) => setAmount(value.replace(/[^\d]/g, ""))} keyboardType="number-pad" placeholder="¥" placeholderTextColor={colors.ink3} style={styles.field} accessibilityLabel={t("eventsV2.fieldFee")} /> : null}
        {fee !== "free" && fee !== "paid" ? <UiText style={styles.lbl}>{t("eventsV2.feeUnknownRange")}</UiText> : null}
        <UiPressable accessibilityRole="button" accessibilityLabel={t("eventsV2.judgeWithThis")} onPress={submit} style={styles.btnPrimary} testID="events-fill-submit"><UiText style={styles.btnPrimaryText}>{t("eventsV2.judgeWithThis")}</UiText></UiPressable>
        <UiText style={[styles.lbl, { marginTop: 8, textAlign: "center" }]}>{t("eventsV2.inputOnlyHere")}</UiText>
      </View>
    </View>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 18 },
  row: { alignItems: "center", flexDirection: "row", gap: 10 },
  lbl: { color: colors.ink3, fontSize: 11.5, fontWeight: "500", lineHeight: 17 },
  title16: { color: colors.ink, fontSize: 16, fontWeight: "800", lineHeight: 22, textAlign: "center" },
  cardTitle: { color: colors.ink, fontSize: 14.5, fontWeight: "800", lineHeight: 21 },
  inputRow: { backgroundColor: colors.surface2, borderRadius: radius.md, marginTop: 6, minHeight: 44, justifyContent: "center", paddingHorizontal: 14 },
  urlInput: { color: colors.ink, fontSize: 13, minHeight: 44 },
  urlText: { color: colors.ink2, fontSize: 13, lineHeight: 18 },
  codeInput: { backgroundColor: colors.surface2, borderRadius: radius.md, color: colors.ink, fontSize: 22, fontWeight: "800", height: 56, letterSpacing: 4, textAlign: "center" },
  wayRow: { alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.md, flexDirection: "row", gap: 12, marginTop: 8, padding: 12 },
  wayText: { color: colors.ink, fontSize: 13.5, fontWeight: "700", lineHeight: 19 },
  emo: { alignItems: "center", borderRadius: 13, height: 40, justifyContent: "center", width: 40 },
  emoSm: { alignItems: "center", borderRadius: 10, height: 32, justifyContent: "center", width: 32 },
  emoText: { fontSize: 21, lineHeight: 26 },
  emoTextSm: { fontSize: 17, lineHeight: 22 },
  stepDot: { alignItems: "center", backgroundColor: colors.surface2, borderRadius: radius.pill, height: 22, justifyContent: "center", width: 22 },
  stepNum: { color: colors.ink3, fontSize: 11, fontWeight: "700", lineHeight: 15 },
  stepText: { color: colors.ink3, fontSize: 13, lineHeight: 18 },
  urlChip: { alignSelf: "center", backgroundColor: colors.macLav, borderRadius: radius.pill, marginBottom: 10, paddingHorizontal: 10, paddingVertical: 3 },
  heroRing: { alignItems: "center", height: 120, justifyContent: "center", marginBottom: 10, marginTop: 14, width: 120 },
  heroCenter: { alignItems: "center", position: "absolute" },
  big: { color: colors.ink, fontSize: 38, fontWeight: "800", letterSpacing: -0.76, lineHeight: 40 },
  verdictChip: { borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 5 },
  verdictText: { fontSize: 12, fontWeight: "700", lineHeight: 18 },
  crit: { alignItems: "center", flexDirection: "row", gap: 10, marginTop: 8 },
  critLabel: { color: colors.ink3, fontSize: 12.5, lineHeight: 18, width: 84 },
  bar: { backgroundColor: colors.surface3, borderRadius: radius.tag, flex: 1, height: 6, overflow: "hidden" },
  barFill: { borderRadius: radius.tag, height: 6 },
  critScore: { color: colors.ink, fontSize: 12.5, fontWeight: "800", lineHeight: 18, textAlign: "right", width: 40 },
  meetLabel: { color: colors.ink, fontSize: 13, fontWeight: "700", lineHeight: 18 },
  ctaBar: { backgroundColor: colors.bg, bottom: 0, flexDirection: "row", gap: 10, left: 0, paddingBottom: 34, paddingHorizontal: 18, paddingTop: 10, position: "absolute", right: 0 },
  btn: { alignItems: "center", backgroundColor: colors.surface2, borderRadius: radius.pill, height: 44, justifyContent: "center" },
  btnText: { color: colors.ink, fontSize: 13, fontWeight: "700", lineHeight: 19 },
  btnSm: { alignItems: "center", backgroundColor: colors.surface2, borderRadius: radius.pill, height: 32, justifyContent: "center", paddingHorizontal: 12 },
  btnPrimary: { alignItems: "center", backgroundColor: colors.ink, borderRadius: radius.pill, height: 44, justifyContent: "center", marginTop: 14 },
  btnPrimaryText: { color: colors.bg, fontSize: 13, fontWeight: "700", lineHeight: 19 },
  chip: { backgroundColor: colors.surface2, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 3 },
  chipText: { color: colors.ink2, fontSize: 11, fontWeight: "700", lineHeight: 16 },
  field: { backgroundColor: colors.surface2, borderRadius: radius.md, color: colors.ink, fontSize: 13, height: 40, marginBottom: 10, marginTop: 4, paddingHorizontal: 14 },
  optRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 10, marginTop: 4 },
  opt: { alignItems: "center", backgroundColor: colors.surface2, borderColor: "transparent", borderRadius: radius.pill, borderWidth: 1.5, height: 32, justifyContent: "center", paddingHorizontal: 12 },
  optOn: { backgroundColor: colors.surface, borderColor: colors.plum500 },
  optText: { color: colors.ink2, fontSize: 12, fontWeight: "700", lineHeight: 18 },
}));
