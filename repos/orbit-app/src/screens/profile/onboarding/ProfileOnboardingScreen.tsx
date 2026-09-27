/**
 * New-user onboarding (Sprint 0106), the App counterpart of web /app/profile/onboarding.
 * Welcome → 5 steps; each 「继续」 saves through PUT /api/profile, verifies the receipt and
 * reads the profile back before moving on. Re-entry opens the 「继续设置你的资料」 card at
 * the first unfinished step inferred from saved fields. "Later" never locks the App.
 */
import { Ionicons } from "@expo/vector-icons";
import * as Crypto from "expo-crypto";
import * as ImagePicker from "expo-image-picker";
import { type Href, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { INDUSTRY_CATALOG, industryLabel, listSecondaryIndustries, secondaryIndustryLabel } from "../../../api/domain/industries";
import type { IndustryIdCode, SecondaryIndustryIdCode } from "../../../api/contract/industries";
import type { ProfileDetail } from "../../../api/profile-detail-contract";
import {
  generateOnboardingIntro,
  readOnboardingImportSummary,
  readOnboardingProfile,
  saveOnboardingFields,
  scanOwnBusinessCard,
  type OnboardingProfileFields
} from "../../../api/profile-onboarding";
import { LoadingState } from "../../../components/LoadingState";
import { profileVisibleCharacterCount } from "../../../data/profile-edit-session";
import { useOrbitApiClient } from "../../../hooks/useOrbitApiClient";
import { useOrbitLocale } from "../../../i18n/OrbitLocaleContext";
import type { MessageKey } from "../../../i18n/messages";
import {
  BIO_LIMIT,
  EMPTY_BASIC,
  FOCUS_LIMIT,
  GOAL_GROUPS,
  GOAL_LIMIT,
  HEADLINE_LIMIT,
  HORIZONS,
  INTRO_REGENERATE_LIMIT,
  OFFER_LIMIT,
  OFFER_OPTIONS,
  ONBOARDING_STEPS,
  SEEK_LIMIT,
  SEEK_OPTIONS,
  TOPIC_LIMIT,
  TOPIC_OPTIONS,
  addCustomValue,
  basicDraftFromProfile,
  basicDraftValid,
  basicIndustryValid,
  composeRelationshipGoal,
  introDraftLanguage,
  isKnownOption,
  isValidProfileBirthDate,
  onboardingDestination,
  onboardingEntry,
  optionLabel,
  optionMatches,
  parseRelationshipGoal,
  toggleValue,
  type BasicDraft,
  type Copy,
  type OnboardingImportSummary,
  type OnboardingStep
} from "../../../view-models/profile-onboarding";
import { batchRoutePath } from "../../../view-models/business-card-ingest";
import { Banner, Chip, CustomChip, Field, PrimaryButton, SecondaryButton, StepFrame, StepHead, useOnboardingStyles } from "./OnboardingParts";

type View_ = "loading" | "loadError" | "welcome" | "resume" | OnboardingStep;
type Notice = { kind: "failed" | "offline" } | null;
type IntroStatus = "idle" | "generating" | "ready" | "error";

const STEP_TITLE_KEYS: Record<OnboardingStep, MessageKey> = {
  profile: "onboarding.step.profile", goals: "onboarding.step.goals", persona: "onboarding.step.persona", intro: "onboarding.step.intro", import: "onboarding.step.import"
};
const STEP_TIME_KEYS: Record<OnboardingStep, MessageKey> = {
  profile: "onboarding.time.quick", goals: "onboarding.time.quick", persona: "onboarding.time.quick", intro: "onboarding.time.ai", import: "onboarding.time.optional"
};

function localToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function ProfileOnboardingScreen({ next }: { next?: string | string[] | undefined }) {
  const { styles } = useOnboardingStyles();
  const locale = useOrbitLocale();
  const t = locale.t;
  const router = useRouter();
  const client = useOrbitApiClient();
  const destination = onboardingDestination(next);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const [view, setView] = useState<View_>("loading");
  const [resume, setResume] = useState<{ completed: number; step: OnboardingStep } | null>(null);
  const [detail, setDetail] = useState<ProfileDetail | null>(null);
  const [basic, setBasic] = useState<BasicDraft>(EMPTY_BASIC);
  const [goals, setGoals] = useState<string[]>([]);
  const [focus, setFocus] = useState("");
  const [horizon, setHorizon] = useState("");
  const [offer, setOffer] = useState<string[]>([]);
  const [seek, setSeek] = useState<string[]>([]);
  const [topics, setTopics] = useState<string[]>([]);
  const [bio, setBio] = useState("");
  const [headline, setHeadline] = useState("");
  const [introStatus, setIntroStatus] = useState<IntroStatus>("idle");
  const [regenerations, setRegenerations] = useState(0);
  const [notice, setNotice] = useState<Notice>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [importSince, setImportSince] = useState<number | null>(null);
  const [importSummary, setImportSummary] = useState<OnboardingImportSummary | null>(null);
  const [importReadFailed, setImportReadFailed] = useState(false);
  const today = localToday();
  const effectiveHorizon = horizon || optionLabel(HORIZONS[1]!, locale.language);

  const routerRef = useRef(router); routerRef.current = router;
  const destinationRef = useRef(destination); destinationRef.current = destination;
  const load = useCallback(async () => {
    setView("loading");
    const result = await readOnboardingProfile(client);
    if (!mounted.current) return;
    if (!result.ok) { setView("loadError"); return; }
    const entry = onboardingEntry(result.detail);
    if (entry.kind === "done") { routerRef.current.replace(destinationRef.current as Href); return; }
    const profile = result.detail.profile;
    setDetail(result.detail);
    setBasic(basicDraftFromProfile(profile));
    const restored = parseRelationshipGoal(profile?.relationshipGoal ?? "");
    setGoals([...restored.goals]); setFocus(restored.focus); setHorizon(restored.horizon);
    setOffer([...(profile?.offering ?? [])]); setSeek([...(profile?.seeking ?? [])]); setTopics([...(profile?.topics ?? [])]);
    setBio(profile?.bio ?? ""); setHeadline(profile?.headline ?? "");
    if (entry.kind === "resume") { setResume({ completed: entry.completed, step: entry.step }); setView("resume"); }
    else setView("welcome");
  }, [client]);

  // Read once per mount (and per signed-in client); later edits stay local until 「继续」.
  useEffect(() => { void load(); }, [load]);

  function go(target: View_) {
    setNotice(null); setMessage(null); setView(target);
    if (target === "import" && importSince === null) setImportSince(Date.now() - 5000);
  }
  function leave() { router.replace(destination as Href); }

  async function save(fields: OnboardingProfileFields, then: OnboardingStep | "finish"): Promise<void> {
    if (!detail || saving) return;
    setSaving(true); setNotice(null); setMessage(null);
    try {
      const result = await saveOnboardingFields(client, fields, detail, () => `ios:onboarding:${Crypto.randomUUID()}`);
      if (!mounted.current) return;
      if (!result.ok) { setNotice({ kind: result.kind }); return; }
      setDetail(result.detail);
      if (then === "finish") leave(); else go(then);
    } catch {
      if (mounted.current) setNotice({ kind: "failed" });
    } finally {
      if (mounted.current) setSaving(false);
    }
  }

  const profileValid = basicDraftValid(basic, today);
  const bioCount = profileVisibleCharacterCount(bio.trim());
  const introValid = bioCount <= BIO_LIMIT && profileVisibleCharacterCount(headline.trim()) <= HEADLINE_LIMIT;

  function onContinue() {
    if (view === "profile" && profileValid) {
      void save({
        birthDate: basic.birthDate, displayName: basic.name.trim(), organization: basic.company.trim(),
        primaryIndustryId: basic.primaryIndustryId as IndustryIdCode, role: basic.title.trim(),
        secondaryIndustryId: basic.secondaryIndustryId as SecondaryIndustryIdCode
      }, "goals");
    } else if (view === "goals" && goals.length) {
      void save({ relationshipGoal: composeRelationshipGoal({ goals, focus, horizon: effectiveHorizon }, locale.language) }, "persona");
    } else if (view === "persona") {
      void save({ offering: offer, seeking: seek, topics }, "intro");
    } else if (view === "intro" && introValid && introStatus !== "generating") {
      void save({ bio: bio.trim(), headline: headline.trim() }, "import");
    }
  }

  // ── AI introduction: auto-draft on entry when empty; 「换一版」 counts only on success ──
  const generating = useRef(false);
  async function generateIntro(kind: "auto" | "retry" | "regenerate") {
    if (generating.current) return;
    if (kind === "regenerate" && regenerations >= INTRO_REGENERATE_LIMIT) return;
    const hadDraft = Boolean(bio.trim() || headline.trim());
    const previousStatus = introStatus;
    generating.current = true;
    setIntroStatus("generating"); setMessage(null);
    try {
      const result = await generateOnboardingIntro(client, introDraftLanguage(locale.language));
      if (!mounted.current) return;
      if (result.ok) {
        setBio(result.bio); setHeadline(result.headline); setIntroStatus("ready");
        if (kind === "regenerate") setRegenerations(count => count + 1);
      } else if (kind === "regenerate" && hadDraft) {
        setIntroStatus(previousStatus === "error" ? "ready" : previousStatus);
        setMessage(t("onboarding.regenerateFailed"));
      } else {
        setIntroStatus("error");
      }
    } finally {
      generating.current = false;
    }
  }
  useEffect(() => {
    if (view === "intro" && introStatus === "idle" && !bio.trim() && !headline.trim()) void generateIntro("auto");
    // Entering the step triggers the draft; later edits never do.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  // ── Own business card → name / company / title ──
  async function scanWith(source: "camera" | "library") {
    if (scanning) return;
    setMessage(null); setNotice(null);
    try {
      const permission = source === "camera" ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) { setMessage(t(source === "camera" ? "onboarding.cameraDenied" : "onboarding.libraryDenied")); return; }
      const options: ImagePicker.ImagePickerOptions = { allowsEditing: false, base64: true, mediaTypes: ["images"], quality: 0.86 };
      const picked = source === "camera" ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      const asset = picked.canceled ? null : picked.assets?.[0];
      if (!asset) return;
      if (!asset.base64) { setMessage(t("onboarding.scanFailed")); return; }
      setScanning(true);
      const card = await scanOwnBusinessCard(client, { base64: asset.base64, fileName: asset.fileName || "business-card.jpg", mimeType: asset.mimeType ?? "image/jpeg", size: asset.fileSize ?? null });
      if (!mounted.current) return;
      if (!card.ok) { setMessage(t("onboarding.scanFailed")); return; }
      setBasic(current => ({ ...current, company: card.company || current.company, name: card.name || current.name, title: card.title || current.title }));
      setMessage(t("onboarding.scanFilled"));
    } catch {
      if (mounted.current) setMessage(t("onboarding.scanFailed"));
    } finally {
      if (mounted.current) setScanning(false);
    }
  }
  function startScan() {
    if (Platform.OS === "web") { void scanWith("library"); return; }
    Alert.alert(t("onboarding.scanCard"), undefined, [
      { text: t("onboarding.scanCamera"), onPress: () => void scanWith("camera") },
      { text: t("onboarding.scanLibrary"), onPress: () => void scanWith("library") },
      { text: t("onboarding.cancel"), style: "cancel" }
    ]);
  }

  // ── Import step: counts for batches started from here, refreshed on focus and while reading ──
  const refreshImport = useCallback(async () => {
    if (importSince === null) return;
    const result = await readOnboardingImportSummary(client, importSince, null);
    if (!mounted.current) return;
    if (result.ok) { setImportSummary(result.summary); setImportReadFailed(false); } else setImportReadFailed(true);
  }, [client, importSince]);
  useFocusEffect(useCallback(() => { if (view === "import") void refreshImport(); }, [view, refreshImport]));
  useEffect(() => {
    if (view !== "import" || !importSummary?.recognizing) return;
    const timer = setInterval(() => { void refreshImport(); }, 5000);
    return () => clearInterval(timer);
  }, [view, importSummary?.recognizing, refreshImport]);

  // ── Render ──
  if (view === "loading") {
    return <SafeAreaView edges={["top", "bottom"]} style={styles.screen}><LoadingState accessibilityLabel={t("onboarding.loading")} /></SafeAreaView>;
  }
  if (view === "loadError") {
    return (
      <SafeAreaView edges={["top", "bottom"]} style={styles.screen}>
        <View style={styles.center}>
          <Banner actionLabel={t("onboarding.retry")} kind="failed" message={t("onboarding.loadFailed")} onAction={() => void load()} />
          <SecondaryButton grow={false} label={t("onboarding.later")} onPress={leave} />
        </View>
      </SafeAreaView>
    );
  }
  if (view === "welcome" || view === "resume") {
    return (
      <SafeAreaView edges={["top", "bottom"]} style={styles.screen}>
        <ScrollView contentContainerStyle={styles.welcome}>
          <Text style={styles.logo}>Orbit<Text style={styles.logoDot}>.</Text></Text>
          {view === "welcome" ? (
            <>
              <View style={styles.welcomeIntro}>
                <Text style={styles.kicker}>{t("onboarding.kicker")}</Text>
                <Text accessibilityRole="header" style={styles.welcomeTitle}>{t("onboarding.welcomeTitle")}</Text>
                <Text style={styles.lead}>{t("onboarding.welcomeLead")}</Text>
              </View>
              <View style={styles.stepList}>
                {ONBOARDING_STEPS.map((step, index) => (
                  <View key={step} style={styles.stepRow}>
                    <Text style={styles.stepNo}>{String(index + 1).padStart(2, "0")}</Text>
                    <Text style={styles.stepTitle}>{t(STEP_TITLE_KEYS[step])}</Text>
                    <Text style={styles.stepHint}>{t(STEP_TIME_KEYS[step])}</Text>
                  </View>
                ))}
              </View>
              <View style={styles.spacer} />
              <View style={styles.actions}>
                <PrimaryButton label={t("onboarding.start")} onPress={() => go("profile")} />
                <Pressable accessibilityLabel={t("onboarding.browse")} accessibilityRole="button" onPress={leave} style={styles.textButton}>
                  <Text style={styles.textButtonText}>{t("onboarding.browse")}</Text>
                </Pressable>
              </View>
            </>
          ) : resume ? (
            <View style={styles.resumeCard}>
              <View style={styles.head}>
                <Text accessibilityRole="header" style={styles.resumeTitle}>{t("onboarding.resumeTitle")}</Text>
                <Text style={styles.resumeBody}>{t("onboarding.resumeBody", { done: resume.completed, total: ONBOARDING_STEPS.length, step: t(STEP_TITLE_KEYS[resume.step]) })}</Text>
              </View>
              <View style={styles.resumeActions}>
                <View style={{ flex: 1 }}><PrimaryButton label={t("onboarding.continue")} onPress={() => go(resume.step)} /></View>
                <SecondaryButton grow={false} label={t("onboarding.later")} onPress={leave} />
              </View>
            </View>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    );
  }

  const index = ONBOARDING_STEPS.indexOf(view);
  const back = () => go(index === 0 ? "welcome" : ONBOARDING_STEPS[index - 1]!);
  const banner = notice ? (
    <Banner actionLabel={notice.kind === "failed" ? t("onboarding.retry") : undefined} kind={notice.kind}
      message={t(notice.kind === "failed" ? "onboarding.saveFailed" : "onboarding.offline")} onAction={notice.kind === "failed" ? onContinue : undefined} />
  ) : null;
  const continueDisabled = saving
    || (view === "profile" && !profileValid)
    || (view === "goals" && goals.length === 0)
    || (view === "intro" && (!introValid || introStatus === "generating"));
  const footer = view === "import" ? (
    <>
      {banner}
      <SecondaryButton label={t("onboarding.takeCards")} onPress={() => router.push("/contacts/new/batch2" as Href)} />
      <PrimaryButton label={t("onboarding.finish")} onPress={leave} />
    </>
  ) : (
    <>
      {banner}
      <PrimaryButton disabled={continueDisabled} label={saving ? t("onboarding.saving") : t(view === "intro" ? "onboarding.useIntro" : "onboarding.continue")} onPress={onContinue} />
    </>
  );

  return (
    <StepFrame backLabel={t(index === 0 ? "onboarding.backWelcome" : "onboarding.back")} footer={footer} index={index} onBack={back} total={ONBOARDING_STEPS.length}>
      {view === "profile" ? <ProfileStep basic={basic} disabled={saving} message={message} onScan={startScan} scanning={scanning} setBasic={setBasic} today={today} /> : null}
      {view === "goals" ? <GoalsStep focus={focus} goals={goals} horizon={effectiveHorizon} setFocus={setFocus} setGoals={setGoals} setHorizon={setHorizon} /> : null}
      {view === "persona" ? <PersonaStep offer={offer} seek={seek} setOffer={setOffer} setSeek={setSeek} setTopics={setTopics} topics={topics} /> : null}
      {view === "intro" ? (
        <IntroStep bio={bio} bioCount={bioCount} headline={headline} message={message} onRegenerate={() => void generateIntro(introStatus === "error" ? "retry" : "regenerate")}
          regenerationsLeft={INTRO_REGENERATE_LIMIT - regenerations} setBio={setBio} setHeadline={setHeadline} status={introStatus} />
      ) : null}
      {view === "import" ? (
        <ImportStep failed={importReadFailed} onReview={id => router.push(batchRoutePath("current", id) as Href)} summary={importSummary} />
      ) : null}
    </StepFrame>
  );
}

function ProfileStep({ basic, disabled, message, onScan, scanning, setBasic, today }: {
  basic: BasicDraft;
  disabled: boolean;
  message: string | null;
  onScan: () => void;
  scanning: boolean;
  setBasic: (update: (current: BasicDraft) => BasicDraft) => void;
  today: string;
}) {
  const { colors, styles } = useOnboardingStyles();
  const locale = useOrbitLocale();
  const t = locale.t;
  const [picker, setPicker] = useState<"primary" | "secondary" | null>(null);
  const set = (key: keyof BasicDraft) => (value: string) => setBasic(current => ({ ...current, [key]: value }));
  const primaryLabel = basic.primaryIndustryId ? industryLabel(basic.primaryIndustryId, locale.language) : null;
  const secondaryLabel = basic.secondaryIndustryId && basicIndustryValid(basic) ? secondaryIndustryLabel(basic.secondaryIndustryId, locale.language) : null;
  const options = picker === "primary"
    ? INDUSTRY_CATALOG.map(item => ({ id: item.id as string, label: item.labels[locale.language] }))
    : picker === "secondary" && basic.primaryIndustryId
      ? listSecondaryIndustries(basic.primaryIndustryId).map(item => ({ id: item.id as string, label: item.labels[locale.language] }))
      : [];
  const showBirthError = basic.birthDate.length >= 10 && !isValidProfileBirthDate(basic.birthDate, today);
  function select(id: string) {
    if (picker === "primary") setBasic(current => ({ ...current, primaryIndustryId: id as IndustryIdCode, secondaryIndustryId: current.primaryIndustryId === id ? current.secondaryIndustryId : "" }));
    else setBasic(current => ({ ...current, secondaryIndustryId: id as SecondaryIndustryIdCode }));
    setPicker(null);
  }
  const selectButton = (which: "primary" | "secondary", label: string, value: string | null, placeholder: string, enabled: boolean) => (
    <Field half label={label}>
      <Pressable accessibilityLabel={`${label}：${value ?? placeholder}`} accessibilityRole="button" accessibilityState={{ disabled: !enabled, expanded: picker === which }} disabled={!enabled}
        onPress={() => setPicker(current => (current === which ? null : which))} style={[styles.selectButton, !enabled && styles.disabled]}>
        <Text numberOfLines={1} style={[styles.selectText, !value && styles.selectPlaceholder]}>{value ?? placeholder}</Text>
        <Ionicons color={colors.text3} name={picker === which ? "chevron-up" : "chevron-down"} size={14} />
      </Pressable>
    </Field>
  );
  return (
    <>
      <StepHead lead={t("onboarding.profileLead")} title={t("onboarding.profileTitle")} />
      <SecondaryButton disabled={disabled || scanning} icon="scan-outline" label={scanning ? t("onboarding.scanning") : t("onboarding.scanCard")} onPress={onScan} />
      {message ? <Text accessibilityLiveRegion="polite" style={message === t("onboarding.scanFilled") ? styles.toast : styles.warning}>{message}</Text> : null}
      <View style={styles.fields}>
        <Field label={t("onboarding.name")}>
          <TextInput accessibilityLabel={t("onboarding.name")} editable={!disabled} maxLength={60} onChangeText={set("name")} placeholder={t("onboarding.namePlaceholder")} placeholderTextColor={colors.text4} style={styles.input} value={basic.name} />
        </Field>
        <View style={styles.fieldRow}>
          {selectButton("primary", t("onboarding.primaryIndustry"), primaryLabel, t("onboarding.select"), !disabled)}
          {selectButton("secondary", t("onboarding.secondaryIndustry"), secondaryLabel, basic.primaryIndustryId ? t("onboarding.select") : t("onboarding.selectPrimaryFirst"), !disabled && Boolean(basic.primaryIndustryId))}
        </View>
        {picker ? (
          <View style={styles.optionList}>
            {options.map(option => {
              const selected = option.id === (picker === "primary" ? basic.primaryIndustryId : basic.secondaryIndustryId);
              return (
                <Pressable accessibilityLabel={option.label} accessibilityRole="button" accessibilityState={{ selected }} key={option.id} onPress={() => select(option.id)} style={styles.optionRow}>
                  <Text style={styles.optionText}>{option.label}</Text>
                  {selected ? <Ionicons color={colors.ink} name="checkmark" size={18} /> : null}
                </Pressable>
              );
            })}
          </View>
        ) : null}
        <View style={styles.fieldRow}>
          <Field half label={t("onboarding.role")} optional>
            <TextInput accessibilityLabel={t("onboarding.role")} editable={!disabled} maxLength={80} onChangeText={set("title")} placeholder={t("onboarding.rolePlaceholder")} placeholderTextColor={colors.text4} style={styles.input} value={basic.title} />
          </Field>
          <Field half label={t("onboarding.company")} optional>
            <TextInput accessibilityLabel={t("onboarding.company")} editable={!disabled} maxLength={80} onChangeText={set("company")} placeholder={t("onboarding.companyPlaceholder")} placeholderTextColor={colors.text4} style={styles.input} value={basic.company} />
          </Field>
        </View>
        <Field helper={t("onboarding.birthDateHelp")} label={t("onboarding.birthDate")}>
          <TextInput accessibilityLabel={t("onboarding.birthDate")} autoCorrect={false} editable={!disabled} keyboardType="numbers-and-punctuation" maxLength={10} onChangeText={set("birthDate")}
            placeholder={t("onboarding.birthDatePlaceholder")} placeholderTextColor={colors.text4} style={styles.input} value={basic.birthDate} />
        </Field>
        {showBirthError ? <Text accessibilityRole="alert" style={styles.warning}>{t("onboarding.birthDateInvalid")}</Text> : null}
      </View>
    </>
  );
}

function ChipSet({ limit, options, setValues, values }: { limit?: number; options: readonly Copy[]; setValues: (update: (current: string[]) => string[]) => void; values: readonly string[] }) {
  const { styles } = useOnboardingStyles();
  const locale = useOrbitLocale();
  const full = limit !== undefined && values.length >= limit;
  const custom = values.filter(value => !isKnownOption(options, value));
  return (
    <View style={styles.chips}>
      {options.map(option => {
        const selected = values.find(value => optionMatches(option, value));
        return (
          <Chip disabled={!selected && full} key={option.zh} label={optionLabel(option, locale.language)} selected={Boolean(selected)}
            onPress={() => setValues(current => (selected ? current.filter(value => value !== selected) : toggleValue(current, optionLabel(option, locale.language), limit)))} />
        );
      })}
      {custom.map(value => <Chip key={value} label={value} onPress={() => setValues(current => current.filter(item => item !== value))} removable selected />)}
      <CustomChip disabled={full} onAdd={value => setValues(current => addCustomValue(current, value, limit))} />
    </View>
  );
}

function GoalsStep({ focus, goals, horizon, setFocus, setGoals, setHorizon }: {
  focus: string;
  goals: string[];
  horizon: string;
  setFocus: (value: string) => void;
  setGoals: (update: (current: string[]) => string[]) => void;
  setHorizon: (value: string) => void;
}) {
  const { colors, styles } = useOnboardingStyles();
  const locale = useOrbitLocale();
  const t = locale.t;
  const full = goals.length >= GOAL_LIMIT;
  const known = GOAL_GROUPS.flatMap(group => group.options);
  const custom = goals.filter(goal => !isKnownOption(known, goal));
  return (
    <>
      <StepHead lead={t("onboarding.goalsLead")} title={t("onboarding.goalsTitle")} />
      <View style={styles.sectionHead}>
        <Text style={styles.groupHeading}>{t("onboarding.goalsPick")}</Text>
        <Text style={styles.count}>{`${goals.length} / ${GOAL_LIMIT}`}</Text>
      </View>
      {GOAL_GROUPS.map(group => (
        <View key={group.title.zh} style={styles.group}>
          <Text style={styles.groupName}>{optionLabel(group.title, locale.language)}</Text>
          <View style={styles.chips}>
            {group.options.map(option => {
              const selected = goals.find(goal => optionMatches(option, goal));
              return <Chip disabled={!selected && full} key={option.zh} label={optionLabel(option, locale.language)} selected={Boolean(selected)}
                onPress={() => setGoals(current => (selected ? current.filter(goal => goal !== selected) : toggleValue(current, optionLabel(option, locale.language), GOAL_LIMIT)))} />;
            })}
          </View>
        </View>
      ))}
      <View style={styles.chips}>
        {custom.map(goal => <Chip key={goal} label={goal} onPress={() => setGoals(current => current.filter(item => item !== goal))} removable selected />)}
        <CustomChip disabled={full} onAdd={value => setGoals(current => addCustomValue(current, value, GOAL_LIMIT))} />
      </View>
      <View style={styles.horizonRow}>
        <Text style={styles.groupName}>{t("onboarding.horizon")}</Text>
        <View accessibilityRole="radiogroup" style={styles.horizonChips}>
          {HORIZONS.map(option => <Chip key={option.zh} label={optionLabel(option, locale.language)} onPress={() => setHorizon(optionLabel(option, locale.language))} selected={optionMatches(option, horizon)} />)}
        </View>
      </View>
      <Field label={t("onboarding.focus")} optional>
        <TextInput accessibilityLabel={t("onboarding.focus")} maxLength={FOCUS_LIMIT} multiline onChangeText={setFocus} placeholder={t("onboarding.focusPlaceholder")} placeholderTextColor={colors.text4} style={styles.multiline} value={focus} />
      </Field>
    </>
  );
}

function PersonaStep({ offer, seek, setOffer, setSeek, setTopics, topics }: {
  offer: string[];
  seek: string[];
  setOffer: (update: (current: string[]) => string[]) => void;
  setSeek: (update: (current: string[]) => string[]) => void;
  setTopics: (update: (current: string[]) => string[]) => void;
  topics: string[];
}) {
  const { styles } = useOnboardingStyles();
  const t = useOrbitLocale().t;
  const section = (title: string, meta: string, count: string, set: typeof setOffer, values: string[], options: readonly Copy[], limit: number) => (
    <View style={styles.group}>
      <View style={styles.sectionHead}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionMeta}>{`${meta} · ${count}`}</Text>
      </View>
      <ChipSet limit={limit} options={options} setValues={set} values={values} />
    </View>
  );
  return (
    <>
      <StepHead lead={t("onboarding.personaLead")} title={t("onboarding.personaTitle")} />
      {section(t("onboarding.offer"), t("onboarding.upTo", { count: OFFER_LIMIT }), `${offer.length}/${OFFER_LIMIT}`, setOffer, offer, OFFER_OPTIONS, OFFER_LIMIT)}
      {section(t("onboarding.seek"), t("onboarding.upTo", { count: SEEK_LIMIT }), `${seek.length}/${SEEK_LIMIT}`, setSeek, seek, SEEK_OPTIONS, SEEK_LIMIT)}
      {section(t("onboarding.topics"), t("onboarding.optional"), `${topics.length}/${TOPIC_LIMIT}`, setTopics, topics, TOPIC_OPTIONS, TOPIC_LIMIT)}
    </>
  );
}

function IntroStep({ bio, bioCount, headline, message, onRegenerate, regenerationsLeft, setBio, setHeadline, status }: {
  bio: string;
  bioCount: number;
  headline: string;
  message: string | null;
  onRegenerate: () => void;
  regenerationsLeft: number;
  setBio: (value: string) => void;
  setHeadline: (value: string) => void;
  status: IntroStatus;
}) {
  const { colors, styles } = useOnboardingStyles();
  const t = useOrbitLocale().t;
  const generating = status === "generating";
  const canRegenerate = !generating && regenerationsLeft > 0;
  return (
    <>
      <StepHead lead={t("onboarding.introLead")} title={t("onboarding.introTitle")} />
      {status === "error" ? (
        <View accessibilityRole="alert" style={styles.aiFailed}>
          <Text style={styles.sectionTitle}>{t("onboarding.introFailedTitle")}</Text>
          <Text style={styles.aiFailedBody}>{t("onboarding.introFailedBody")}</Text>
          <Pressable accessibilityLabel={t("onboarding.introRetry")} accessibilityRole="button" onPress={onRegenerate} style={[styles.linkButton, { justifyContent: "flex-start", paddingHorizontal: 0 }]}>
            <Text style={styles.linkText}>{t("onboarding.introRetry")}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.aiRow}>
          <View style={styles.aiLabel}>
            <View style={styles.aiMark}><View style={styles.aiMarkDot} /></View>
            <Text style={generating ? styles.sectionMeta : styles.groupHeading}>{generating ? t("onboarding.introGenerating") : t("onboarding.introDraftLabel")}</Text>
          </View>
          <Pressable accessibilityLabel={regenerationsLeft > 0 ? t("onboarding.regenerate", { count: regenerationsLeft }) : t("onboarding.regenerateUsed")} accessibilityRole="button"
            accessibilityState={{ disabled: !canRegenerate }} disabled={!canRegenerate} onPress={onRegenerate} style={styles.linkButton}>
            <Ionicons color={canRegenerate ? colors.accent : colors.text4} name="refresh" size={16} />
            <Text style={[styles.linkText, !canRegenerate && styles.mutedLink]}>{regenerationsLeft > 0 ? t("onboarding.regenerate", { count: regenerationsLeft }) : t("onboarding.regenerateUsed")}</Text>
          </Pressable>
        </View>
      )}
      {message ? <Text accessibilityLiveRegion="polite" style={styles.warning}>{message}</Text> : null}
      <Field label={t("onboarding.headline")}>
        <TextInput accessibilityLabel={t("onboarding.headline")} editable={!generating} maxLength={HEADLINE_LIMIT} onChangeText={setHeadline} placeholder={t("onboarding.headlinePlaceholder")} placeholderTextColor={colors.text4} style={styles.headlineInput} value={headline} />
      </Field>
      <Field label={t("onboarding.bio")}>
        <TextInput accessibilityLabel={t("onboarding.bio")} editable={!generating} multiline onChangeText={setBio} style={styles.bioInput} value={bio} />
        <Text style={[styles.counter, bioCount > BIO_LIMIT && styles.counterOver]}>{t("onboarding.charCount", { count: bioCount, limit: BIO_LIMIT })}</Text>
        {bioCount > BIO_LIMIT ? <Text accessibilityRole="alert" style={styles.warning}>{t("onboarding.bioTooLong", { limit: BIO_LIMIT })}</Text> : null}
      </Field>
    </>
  );
}

function ImportStep({ failed, onReview, summary }: { failed: boolean; onReview: (batchId: string) => void; summary: OnboardingImportSummary | null }) {
  const { colors, styles } = useOnboardingStyles();
  const t = useOrbitLocale().t;
  const hasCards = Boolean(summary && (summary.imported || summary.review || summary.recognizing));
  return (
    <>
      <StepHead lead={t("onboarding.importLead")} title={t("onboarding.importTitle")} />
      <View style={styles.importCard}>
        <View style={styles.importIcon}><Ionicons color={colors.ink} name="scan-outline" size={28} /></View>
        <Text style={styles.sectionTitle}>{t("onboarding.importCardTitle")}</Text>
        <Text style={styles.importBody}>{t("onboarding.importCardBody")}</Text>
      </View>
      {hasCards && summary ? (
        <View style={styles.statList}>
          <View style={styles.statRow}><Text style={styles.statLabel}>{t("onboarding.imported")}</Text><Text style={styles.statValue}>{summary.imported}</Text></View>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>{t("onboarding.needsReview")}</Text>
            {summary.review && summary.reviewBatchId ? (
              <Pressable accessibilityLabel={`${t("onboarding.needsReview")} ${t("onboarding.reviewCount", { count: summary.review })}`} accessibilityRole="link" onPress={() => onReview(summary.reviewBatchId!)}>
                <Text style={styles.statLink}>{t("onboarding.reviewCount", { count: summary.review })}</Text>
              </Pressable>
            ) : <Text style={styles.statValue}>0</Text>}
          </View>
          <View style={styles.statRow}><Text style={[styles.statLabel, styles.statMuted]}>{t("onboarding.recognizing")}</Text><Text style={[styles.statValue, styles.statMuted]}>{summary.recognizing}</Text></View>
        </View>
      ) : null}
      {failed ? <Text style={styles.helper}>{t("onboarding.importReadFailed")}</Text> : null}
    </>
  );
}
