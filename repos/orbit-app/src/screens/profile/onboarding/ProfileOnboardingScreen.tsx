/**
 * New-user onboarding, three steps and no way around it (docs/designs/redesign-2026-10/onboarding-3step-proposal.html):
 * ① card + basics ② goals + strengths ③ introduction. 「次へ」 is always tappable: what is missing is marked, listed
 * above the button and scrolled to. Each 「次へ」 saves through PUT /api/profile, verifies the receipt and reads the
 * profile back; everything typed in between stays in a draft on the device, so leaving or killing the App loses nothing.
 */
import * as Crypto from "expo-crypto";
import * as ImagePicker from "expo-image-picker";
import { type Href, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, findNodeHandle, Keyboard, Linking, Platform, View, type LayoutChangeEvent, type ScrollView, type TextInput } from "react-native";

import { useOrbitApiBaseUrl } from "../../../api/ApiBaseUrlProvider";
import { useOrbitAuthSession } from "../../../api/AuthSessionProvider";
import { encodeDirectScanImage } from "../../../api/batch-images";
import type { IndustryIdCode, SecondaryIndustryIdCode } from "../../../api/contract/industries";
import type { ProfileOnboardingProgressCommandContract } from "../../../api/contract/profile";
import { INDUSTRY_CATALOG, listSecondaryIndustries } from "../../../api/domain/industries";
import type { ProfileDetail } from "../../../api/profile-detail-contract";
import {
  generateOnboardingIntro,
  inferOnboardingAutofill,
  readOnboardingProfile,
  saveOnboardingFields,
  scanOwnBusinessCard,
  suggestOnboardingSeeking,
  type OnboardingProfileFields,
} from "../../../api/profile-onboarding";
import { readProfileOnboardingProgress, updateProfileOnboardingProgress, type AppProfileOnboardingProgress } from "../../../api/profile-onboarding-progress";
import { isTabPageHref, openMainTab, resetStackTo } from "../../../components/shell-navigation";
import { BottomSheet, Skeleton, UiText } from "../../../components/ui";
import { presentConfirm } from "../../../components/ui/feedback-requests";
import { clearProfileEditSession } from "../../../data/profile-edit-session";
import { useOrbitApiClient } from "../../../hooks/useOrbitApiClient";
import { useOrbitLocale } from "../../../i18n/OrbitLocaleContext";
import type { MessageKey } from "../../../i18n/messages";
import { useOnboardingGate } from "../../../onboarding/OnboardingGateProvider";
import { profileOnboardingStorage, type OnboardingDraft, type OnboardingMarkedField } from "../../../storage/profile-onboarding-storage";
import { useOrbitTimeZone } from "../../../time/OrbitTimeZoneProvider";
import { localizeAuthMessage } from "../../../view-models/account-auth";
import {
  EMPTY_BASIC,
  INTRO_REGENERATE_LIMIT,
  ONBOARDING_STEPS,
  SEEK_OPTIONS,
  STEP_SCREENS,
  basicDraftFromProfile,
  bioCounter,
  composeRelationshipGoal,
  introDraftLanguage,
  isValidProfileBirthDate,
  onboardingDestination,
  onboardingGoals,
  onboardingMissing,
  onboardingRequired,
  optionLabel,
  stepForConfirmedScreen,
  toggleValue,
  GOAL_LIMIT,
  type BasicDraft,
  type OnboardingMissingField,
  type OnboardingStep,
} from "../../../view-models/profile-onboarding";
import { PersonalScheduleDateTimePicker } from "../../schedule/PersonalScheduleDateTimePicker";
import { KitButton, MissLine, OnboardingFrame, OnboardingProgress, OnboardingTopBar, OnceNotice, useOnboardingStyles } from "./OnboardingParts";
import { GoalsStep, IntroStep, ProfileStep, SheetRow, type IntroStatus, type IntroTone, type Marks, type ScanState, type TextKey } from "./OnboardingSteps";

type View_ = "loading" | "loadError" | OnboardingStep;
type Notice = "failed" | "offline" | "conflict" | null;

const STEP_NAME: Record<OnboardingStep, MessageKey> = { profile: "onboarding.v3.step.profile", goals: "onboarding.v3.step.goals", intro: "onboarding.v3.step.intro" };
const MISSING_NAME: Record<OnboardingMissingField, MessageKey> = {
  name: "onboarding.v3.name", primaryIndustry: "onboarding.v3.primaryIndustry", secondaryIndustry: "onboarding.v3.secondaryIndustry", goals: "onboarding.v3.missGoalsName", intro: "onboarding.v3.bio",
};
const DRAFT_DELAY_MS = 250;
/** A chosen goal rests this long before candidates are asked for, and at most this many times per visit (paid AI). */
const SEEK_DELAY_MS = 1200;
const SEEK_REQUEST_LIMIT = 3;

/** Home (or another tab page) becomes the only page, with no way back to login, signup or onboarding. */
function leaveOnboarding(router: ReturnType<typeof useRouter>, href: string): void {
  if (isTabPageHref(href)) openMainTab(router, href);
  else router.replace(href as Href);
}

function localToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

const HANDLE_KEYS = ["email", "phone", "wechatId", "lineId", "website", "linkedinUrl", "xHandle"] as const;
const basicIndustryPair = (basic: BasicDraft) => (basic.primaryIndustryId && basic.secondaryIndustryId ? { primary: basic.primaryIndustryId, secondary: basic.secondaryIndustryId } : null);
const stepIndex = (step: OnboardingStep) => ONBOARDING_STEPS.indexOf(step);

export function ProfileOnboardingScreen({ next }: { next?: string | string[] | undefined }) {
  const { styles } = useOnboardingStyles();
  const locale = useOrbitLocale();
  const t = locale.t;
  const router = useRouter();
  const client = useOrbitApiClient();
  const auth = useOrbitAuthSession();
  const server = useOrbitApiBaseUrl();
  const gate = useOnboardingGate();
  const { timeZone } = useOrbitTimeZone();
  const destination = onboardingDestination(next);
  const scope = useMemo(() => (auth.actorId ? { actorId: auth.actorId, baseUrl: server.baseUrl } : null), [auth.actorId, server.baseUrl]);
  const mounted = useRef(true);
  // Set it again on every mount: Fast Refresh re-runs effects after their cleanup.
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const [view, setView] = useState<View_>("loading");
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
  // Counts AI fills of the chip rows, which then show the chosen ones first again.
  const [fillRevision, setFillRevision] = useState(0);
  const [marks, setMarks] = useState<Marks>({});
  const [scan, setScan] = useState<ScanState>({ kind: "idle" });
  const [introStatus, setIntroStatus] = useState<IntroStatus>("idle");
  const [tone, setTone] = useState<IntroTone>("native");
  const [editing, setEditing] = useState(false);
  const [regenerations, setRegenerations] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [picker, setPicker] = useState<"primary" | "secondary" | null>(null);
  const [dateOpen, setDateOpen] = useState(false);
  const today = localToday();

  const flowRef = useRef<AppProfileOnboardingProgress | null>(null);
  const initMutationRef = useRef<string | null>(null);
  const pendingConfirmRef = useRef<ProfileOnboardingProgressCommandContract | null>(null);
  const finishMutationRef = useRef<string | null>(null);
  const introActionKeyRef = useRef<string | null>(null);
  const introDrafts = useRef<Partial<Record<IntroTone, { bio: string; headline: string }>>>({});
  const generating = useRef(false);
  const signingOut = useRef(false);
  const busy = useRef(false);

  const scrollRef = useRef<ScrollView | null>(null);
  const fieldY = useRef<Partial<Record<OnboardingMissingField, number>>>({});
  const nameInput = useRef<TextInput | null>(null);
  const bioInput = useRef<TextInput | null>(null);
  const primaryButton = useRef<View | null>(null);
  const secondaryButton = useRef<View | null>(null);
  const inputs = useMemo(() => ({ name: nameInput, primary: primaryButton, secondary: secondaryButton }), []);

  const routerRef = useRef(router); routerRef.current = router;
  const destinationRef = useRef(destination); destinationRef.current = destination;
  const settleRef = useRef(gate.settle); settleRef.current = gate.settle;

  // ── Load: server profile + progress, then what this device still holds unsaved ──
  const load = useCallback(async () => {
    setView("loading"); setNotice(null); setAttempted(false);
    const [result, progress, draft] = await Promise.all([
      readOnboardingProfile(client), readProfileOnboardingProgress(client), scope ? profileOnboardingStorage.readDraft(scope) : null,
    ]);
    if (!mounted.current) return;
    if (!result.ok || !progress.ok) {
      // Nothing known yet about this account on this device: it stays held until the server says it is done.
      if (gate.status === "unknown" || gate.status === "open") void settleRef.current("required");
      setView("loadError");
      return;
    }
    flowRef.current = progress.progress;
    if (!onboardingRequired(result.detail, progress.progress)) {
      await settleRef.current("clear");
      if (scope) await profileOnboardingStorage.clearDraft(scope);
      if (mounted.current) leaveOnboarding(routerRef.current, destinationRef.current);
      return;
    }
    void settleRef.current("required");
    const profile = result.detail.profile;
    const confirmed = progress.progress?.lastConfirmedScreen ?? 0;
    const savedGoal = onboardingGoals(profile?.relationshipGoal ?? "");
    const saved = { basic: basicDraftFromProfile(profile), goals: [...savedGoal.goals], bio: profile?.bio ?? "" };
    // The draft speaks for every step while the profile has not moved on elsewhere; otherwise only for steps not confirmed yet.
    const fresh = draft !== null && draft.updatedAt === (profile?.updatedAt ?? null);
    const from = (step: OnboardingStep) => (draft && (fresh || confirmed < STEP_SCREENS[step][0]!) ? draft : null);
    const values = { basic: from("profile")?.basic ?? saved.basic, goals: from("goals")?.goals ?? saved.goals, bio: from("intro")?.bio ?? saved.bio };
    setDetail(result.detail);
    setBasic(values.basic);
    setGoals(values.goals); setFocus(from("goals")?.focus ?? savedGoal.focus); setHorizon(savedGoal.horizon);
    setOffer(from("goals")?.offer ?? [...(profile?.offering ?? [])]);
    setSeek(from("goals")?.seek ?? [...(profile?.seeking ?? [])]);
    setTopics(from("goals")?.topics ?? [...(profile?.topics ?? [])]);
    setBio(values.bio); setHeadline(from("intro")?.headline ?? profile?.headline ?? "");
    setMarks(draft?.marks ?? {});
    setScan(draft?.scan ? { kind: "done", ...draft.scan } : { kind: "idle" });
    // Same step as before, but never past one that is not complete.
    const reached = progress.progress?.finishedAt ? "intro" : stepForConfirmedScreen(confirmed);
    const incomplete = ONBOARDING_STEPS.find(step => onboardingMissing(step, saved).length > 0) ?? reached;
    const start = stepIndex(incomplete) < stepIndex(reached) ? incomplete : reached;
    setView(draft && stepIndex(draft.step) < stepIndex(start) ? draft.step : start);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, scope]);

  // Read once per mount (and per signed-in client); later edits stay local until 「次へ」.
  useEffect(() => { void load(); }, [load]);

  // ── Draft on this device ──
  const draft: OnboardingDraft | null = view === "loading" || view === "loadError" ? null : {
    step: view, updatedAt: detail?.profile?.updatedAt ?? null, basic, goals, focus, offer, seek, topics, bio, headline, marks,
    scan: scan.kind === "done" ? { card: scan.card, ai: scan.ai } : null,
  };
  const draftText = draft ? JSON.stringify(draft) : null;
  const unsaved = useRef<{ scope: NonNullable<typeof scope>; draft: OnboardingDraft } | null>(null);
  const flushDraft = useCallback(() => {
    if (unsaved.current) void profileOnboardingStorage.writeDraft(unsaved.current.scope, unsaved.current.draft);
    unsaved.current = null;
  }, []);
  useEffect(() => {
    if (!scope || !draftText) return;
    unsaved.current = { scope, draft: JSON.parse(draftText) as OnboardingDraft };
    const timer = setTimeout(flushDraft, DRAFT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [draftText, flushDraft, scope]);
  useEffect(() => flushDraft, [flushDraft]);

  // ── Progress on the server (five screens, see STEP_SCREENS) ──
  async function ensureFlow(): Promise<AppProfileOnboardingProgress | Notice> {
    if (flowRef.current) return flowRef.current;
    initMutationRef.current ??= `ios:onboarding:init:${Crypto.randomUUID()}`;
    const result = await updateProfileOnboardingProgress(client, { action: "initialize", expectedRevision: null, mutationId: initMutationRef.current });
    if (!result.ok || !result.progress) return result.ok ? "failed" : result.kind;
    flowRef.current = result.progress;
    return result.progress;
  }

  async function confirmStep(step: OnboardingStep): Promise<Notice> {
    for (const screen of STEP_SCREENS[step]) {
      const flow = await ensureFlow();
      if (!flow || typeof flow === "string") return flow ?? "failed";
      if (flow.finishedAt || flow.lastConfirmedScreen >= screen) { pendingConfirmRef.current = null; continue; }
      const pending = pendingConfirmRef.current;
      if (pending?.action !== "confirm" || pending.screen !== screen) {
        pendingConfirmRef.current = { action: "confirm", screen, expectedRevision: flow.revision, mutationId: `ios:onboarding:screen:${Crypto.randomUUID()}` };
      }
      const result = await updateProfileOnboardingProgress(client, pendingConfirmRef.current!);
      if (!result.ok || !result.progress) {
        const latest = await readProfileOnboardingProgress(client);
        if (!latest.ok || !latest.progress || latest.progress.lastConfirmedScreen < screen) return result.ok ? "failed" : result.kind;
        flowRef.current = latest.progress;
      } else flowRef.current = result.progress;
      pendingConfirmRef.current = null;
    }
    return null;
  }

  async function finishFlow(): Promise<Notice> {
    const flow = flowRef.current;
    if (!flow || flow.finishedAt) return null;
    finishMutationRef.current ??= `ios:onboarding:finish:${Crypto.randomUUID()}`;
    const result = await updateProfileOnboardingProgress(client, { action: "finish", expectedRevision: flow.revision, mutationId: finishMutationRef.current });
    if (result.ok && result.progress?.finishedAt) { flowRef.current = result.progress; return null; }
    const latest = await readProfileOnboardingProgress(client);
    if (latest.ok && latest.progress?.finishedAt) { flowRef.current = latest.progress; return null; }
    return result.ok ? "failed" : result.kind;
  }

  function fieldsFor(step: OnboardingStep): OnboardingProfileFields {
    if (step === "goals") return { relationshipGoal: composeRelationshipGoal({ goals, focus, horizon }, locale.language), offering: offer, seeking: seek, topics };
    if (step === "intro") return { bio: bio.trim(), headline: headline.trim() };
    // PUT replaces handles as a whole: keep what is saved, in the response schema's key order (the receipt is compared as text).
    const saved = detail?.profile?.handles;
    const merged: Record<string, string | undefined> = { ...saved, email: basic.email.trim(), phone: basic.phone.trim() };
    const handles = Object.fromEntries(HANDLE_KEYS.filter(key => merged[key]).map(key => [key, merged[key]!]));
    const contacts = saved || Object.keys(handles).length ? { handles } : {};
    return {
      birthDate: basic.birthDate || null, displayName: basic.name.trim(), organization: basic.company.trim(),
      primaryIndustryId: basic.primaryIndustryId as IndustryIdCode, role: basic.title.trim(), secondaryIndustryId: basic.secondaryIndustryId as SecondaryIndustryIdCode, ...contacts,
    } as OnboardingProfileFields;
  }

  // ── 「次へ」 ──
  const missing = view === "loading" || view === "loadError" ? [] : onboardingMissing(view, { basic, goals, bio });
  const introBlocked = view === "intro" && introStatus === "generating";
  const shown = attempted ? (introBlocked ? ["intro" as const] : missing) : [];
  const errors = new Set<OnboardingMissingField>(shown);
  const bioCount = bioCounter(bio);
  const fieldError = (field: OnboardingMissingField): string => {
    if (field === "name") return t("onboarding.v3.missName");
    if (field === "primaryIndustry") return t("onboarding.v3.missIndustry");
    if (field === "secondaryIndustry") return t("onboarding.v3.missDetail");
    if (field === "goals") return t("onboarding.v3.missGoals");
    if (introBlocked) return t("onboarding.v3.missIntroGenerating");
    return bioCount.over ? t("onboarding.v3.bioTooLong", { limit: bioCount.limit }) : t("onboarding.v3.missIntro");
  };
  const summaryOf = (fields: readonly OnboardingMissingField[]) => t("onboarding.v3.missing", { count: fields.length, fields: fields.map(field => t(MISSING_NAME[field])).join(t("onboarding.v3.missingSeparator")) });

  /** Scroll to the first missing field and put the focus there (keyboard for text, VoiceOver for buttons). */
  function showMissing(fields: readonly OnboardingMissingField[]) {
    const first = fields[0]!;
    scrollRef.current?.scrollTo({ y: Math.max(0, (fieldY.current[first] ?? 0) - 24), animated: true });
    if (first === "name") nameInput.current?.focus();
    else if (first === "intro") bioInput.current?.focus();
    else {
      const target = first === "primaryIndustry" ? primaryButton.current : first === "secondaryIndustry" ? secondaryButton.current : null;
      const handle = target && Platform.OS !== "web" ? findNodeHandle(target) : null;
      if (handle != null) AccessibilityInfo.setAccessibilityFocus(handle);
      else (target as (View & { focus?: () => void }) | null)?.focus?.();
    }
    AccessibilityInfo.announceForAccessibility([summaryOf(fields), ...fields.map(fieldError)].join("。"));
  }

  async function onNext(step: OnboardingStep) {
    if (busy.current || saving) return;
    const blocked = introBlocked ? (["intro"] as const) : missing;
    if (blocked.length) { setAttempted(true); setNotice(null); showMissing(blocked); return; }
    if (!detail) return;
    busy.current = true;
    setSaving(true); setNotice(null); setMessage(null);
    try {
      const fields = fieldsFor(step);
      const profile = detail.profile as Record<string, unknown> | null;
      const unchanged = profile !== null && Object.entries(fields).every(([key, value]) => JSON.stringify(profile[key] ?? null) === JSON.stringify(value ?? null));
      if (!unchanged) {
        const result = await saveOnboardingFields(client, fields, detail, () => `ios:onboarding:${Crypto.randomUUID()}`);
        if (!mounted.current) return;
        if (!result.ok) {
          setNotice(result.kind);
          // Another device moved the profile on: take its version, keep what was typed here.
          if (result.kind === "conflict") {
            const latest = await readOnboardingProfile(client);
            if (mounted.current && latest.ok) setDetail(latest.detail);
          }
          return;
        }
        setDetail(result.detail);
      }
      const confirmFailure = await confirmStep(step);
      if (!mounted.current) return;
      if (confirmFailure) { setNotice(confirmFailure); return; }
      // No card read: guess strengths and topics from what was typed, while the next step opens.
      if (step === "profile" && !offer.length && !topics.length) {
        void infer({ displayName: basic.name, organization: basic.company, role: basic.title, industry: basicIndustryPair(basic) });
      }
      if (step !== "intro") { go(ONBOARDING_STEPS[stepIndex(step) + 1]!); return; }
      const finishFailure = await finishFlow();
      if (!mounted.current) return;
      if (finishFailure) { setNotice(finishFailure); return; }
      unsaved.current = null;
      setView("loading");
      if (scope) await profileOnboardingStorage.clearDraft(scope);
      await gate.settle("clear");
      leaveOnboarding(router, destination);
    } catch {
      if (mounted.current) setNotice("failed");
    } finally {
      busy.current = false;
      if (mounted.current) setSaving(false);
    }
  }

  function go(target: OnboardingStep) {
    setNotice(null); setMessage(null); setAttempted(false); setEditing(false);
    fieldY.current = {};
    setView(target);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }

  // ── Log out: what was typed stays for the next sign-in ──
  async function logOut() {
    if (signingOut.current) return;
    signingOut.current = true;
    setSignOutError(null);
    flushDraft();
    const actorId = auth.actorId;
    try {
      const result = await auth.signOut({
        confirmSignOut: () => presentConfirm({ title: t("me.logoutConfirm"), confirmLabel: t("me.logout"), cancelLabel: t("common.cancel"), destructive: true, icon: "out" }),
      });
      if (result.cancelled) return;
      if (result.success) {
        if (actorId) clearProfileEditSession({ actorId, apiOrigin: server.baseUrl });
        resetStackTo(router, "/account/login");
      } else if (mounted.current) setSignOutError(localizeAuthMessage(result.message, t) ?? t("account.signOutFailure"));
    } finally {
      signingOut.current = false;
    }
  }

  // ── Own business card ──
  const unmark = (...fields: OnboardingMarkedField[]) => setMarks(current => {
    if (!fields.some(field => current[field])) return current;
    const rest = { ...current };
    for (const field of fields) delete rest[field];
    return rest;
  });
  async function scanWith(source: "camera" | "library") {
    if (scan.kind === "scanning") return;
    const before = scan;
    Keyboard.dismiss();
    try {
      // The iOS photo picker needs no library access; only Android and the camera ask.
      const permission = source === "camera" ? await ImagePicker.requestCameraPermissionsAsync() : Platform.OS === "ios" ? { granted: true, canAskAgain: true } : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!mounted.current) return;
      if (!permission.granted) {
        const denied = t(source === "camera" ? "onboarding.v3.cameraDenied" : "onboarding.v3.libraryDenied");
        if (before.kind !== "done") setScan({ kind: "failed", message: denied });
        if (!permission.canAskAgain && Platform.OS !== "web" && await presentConfirm({ title: denied, confirmLabel: t("add.scan.openSettings"), cancelLabel: t("common.cancel"), icon: "settings" })) void Linking.openSettings().catch(() => undefined);
        return;
      }
      const options: ImagePicker.ImagePickerOptions = { allowsEditing: false, mediaTypes: ["images"], quality: 0.86 };
      const picked = source === "camera" ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      const asset = picked.canceled ? null : picked.assets?.[0];
      if (!asset || !mounted.current) return;
      setScan({ kind: "scanning" });
      const image = await encodeDirectScanImage({ ...asset, fileName: asset.fileName || "business-card.jpg" });
      if (!mounted.current) return;
      const card = await scanOwnBusinessCard(client, image);
      if (!mounted.current) return;
      if (!card.ok) { setScan({ kind: "failed", message: t("onboarding.v3.scanFailed") }); return; }
      const read = { name: card.name, company: card.company, title: card.title, email: card.email, phone: card.phone };
      const found = (Object.keys(read) as TextKey[]).filter(key => read[key]);
      if (!found.length) { setScan({ kind: "failed", message: t("onboarding.v3.scanFailed") }); return; }
      setBasic(current => ({
        ...current, ...Object.fromEntries(found.map(key => [key, read[key]])),
        ...(card.industry ? { primaryIndustryId: card.industry.primary, secondaryIndustryId: card.industry.secondary } : {}),
      }));
      setMarks(current => ({
        ...current, ...Object.fromEntries(found.map(key => [key, "card" as const])),
        ...(card.industry ? { primaryIndustryId: "ai" as const, secondaryIndustryId: "ai" as const } : {}),
      }));
      setScan({ kind: "done", card: found.length, ai: card.industry ? 2 : 0 });
      void infer({ displayName: card.name, organization: card.company, role: card.title, industry: card.industry });
    } catch {
      if (mounted.current) setScan(before.kind === "done" ? before : { kind: "failed", message: t("onboarding.v3.scanFailed") });
    }
  }

  // ── AI guesses from company + title: in the background, never over something the person chose ──
  const latest = useRef({ basic, offer, topics }); latest.current = { basic, offer, topics };
  const inferredFor = useRef<string | null>(null);
  async function infer(input: { displayName: string; organization: string; role: string; industry: { primary: IndustryIdCode; secondary: SecondaryIndustryIdCode } | null }) {
    const source = `${input.organization.trim()}\u0000${input.role.trim()}`;
    if ((!input.organization.trim() && !input.role.trim()) || inferredFor.current === source) return;
    inferredFor.current = source;
    const before = latest.current;
    const result = await inferOnboardingAutofill(client, {
      displayName: input.displayName.trim(), organization: input.organization.trim(), role: input.role.trim(), language: locale.language,
      ...(input.industry ? { primaryIndustryId: input.industry.primary, secondaryIndustryId: input.industry.secondary } : {}),
    }).catch(() => null);
    if (!mounted.current || !result) return;
    const industry = result.industry;
    if (industry && !input.industry && !latest.current.basic.primaryIndustryId) {
      setBasic(current => ({ ...current, primaryIndustryId: industry.primary, secondaryIndustryId: industry.secondary }));
      setMarks(current => ({ ...current, primaryIndustryId: "ai", secondaryIndustryId: "ai" }));
      setScan(current => (current.kind === "done" ? { ...current, ai: 2 } : current));
    }
    const fill = (apply: () => void) => { apply(); setFillRevision(value => value + 1); };
    // Untouched since the request and still empty, or still exactly an earlier guess.
    if (result.offering.length && latest.current.offer === before.offer && (!before.offer.length || marksRef.current.offer === "ai")) {
      fill(() => { setOffer(result.offering); setMarks(current => ({ ...current, offer: "ai" })); });
    }
    if (result.topics.length && latest.current.topics === before.topics && (!before.topics.length || marksRef.current.topics === "ai")) {
      fill(() => { setTopics(result.topics); setMarks(current => ({ ...current, topics: "ai" })); });
    }
  }
  const marksRef = useRef(marks); marksRef.current = marks;

  const [seekSuggestions, setSeekSuggestions] = useState<string[]>([]);
  const seekRequests = useRef(new Set<string>());
  const goalText = composeRelationshipGoal({ goals, focus: "", horizon: "" }, locale.language);
  useEffect(() => {
    if (view !== "goals" || !goalText || seekRequests.current.has(goalText) || seekRequests.current.size >= SEEK_REQUEST_LIMIT) return;
    const timer = setTimeout(() => {
      seekRequests.current.add(goalText);
      void suggestOnboardingSeeking(client, { candidates: SEEK_OPTIONS.map(option => optionLabel(option, locale.language)), goal: goalText, language: locale.language }).then(values => {
        if (mounted.current && values.length) setSeekSuggestions(values);
      }, () => undefined);
    }, SEEK_DELAY_MS);
    return () => clearTimeout(timer);
  }, [client, goalText, locale.language, view]);

  // ── Introduction: drafted once on entry when there is none; 「別の案」 counts only on success ──
  async function generateIntro(kind: "auto" | "retry" | "regenerate", target: IntroTone = tone) {
    if (generating.current || (kind === "regenerate" && regenerations >= INTRO_REGENERATE_LIMIT)) return;
    const hadDraft = Boolean(bio.trim());
    const previous = introStatus;
    generating.current = true;
    setIntroStatus("generating"); setMessage(null); setEditing(false); setTone(target);
    try {
      if (kind === "regenerate" || (kind === "retry" && !introActionKeyRef.current)) introActionKeyRef.current = `ios:onboarding:intro:${Crypto.randomUUID()}`;
      introActionKeyRef.current ??= `ios:onboarding:intro:first:${detail?.profile?.updatedAt ?? "new"}`;
      const result = await generateOnboardingIntro(client, target === "en" ? "en" : introDraftLanguage(locale.language), introActionKeyRef.current);
      if (!mounted.current) return;
      if (result.ok) {
        introActionKeyRef.current = null;
        introDrafts.current[target] = { bio: result.bio, headline: result.headline };
        setBio(result.bio); setHeadline(result.headline); setIntroStatus("ready");
        if (kind === "regenerate") setRegenerations(count => count + 1);
        return;
      }
      if (result.kind !== "offline") introActionKeyRef.current = null;
      if (result.kind === "limit") { setIntroStatus("limit"); return; }
      if (kind === "regenerate" && hadDraft) {
        setIntroStatus(previous === "error" ? "ready" : previous);
        setMessage(t("onboarding.v3.introFailed"));
      } else setIntroStatus("error");
    } finally {
      generating.current = false;
    }
  }
  useEffect(() => {
    if (view === "intro" && introStatus === "idle") {
      if (bio.trim()) setIntroStatus("ready");
      else void generateIntro("auto");
    }
    // Entering the step triggers the draft; later edits never do.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);
  function onTone(target: IntroTone) {
    if (target === tone) return;
    const known = introDrafts.current[target];
    if (bio.trim()) introDrafts.current[tone] = { bio, headline };
    if (known) { setTone(target); setBio(known.bio); setHeadline(known.headline); setEditing(false); return; }
    void generateIntro("regenerate", target);
  }

  // ── Render ──
  const onFieldLayout = (field: OnboardingMissingField, event: LayoutChangeEvent) => { fieldY.current[field] = event.nativeEvent.layout.y; };
  if (view === "loading") {
    return <OnboardingFrame footer={null}><View accessibilityLabel={t("onboarding.v3.loading")} accessible style={{ marginTop: 60 }}><Skeleton lines={3} /></View></OnboardingFrame>;
  }
  if (view === "loadError") {
    return (
      <OnboardingFrame footer={<KitButton block label={t("onboarding.v3.retry")} onPress={() => void load()} variant="primary" />}>
        <OnboardingTopBar onLogout={() => void logOut()} />
        <View style={{ marginTop: 160 }}><MissLine text={signOutError ?? t("onboarding.v3.loadFailed")} /></View>
      </OnboardingFrame>
    );
  }
  const index = stepIndex(view);
  const noticeText = signOutError ?? (notice ? t(notice === "conflict" ? "onboarding.v3.conflict" : notice === "offline" ? "onboarding.v3.offline" : "onboarding.v3.saveFailed") : null);
  const label = saving ? t("onboarding.v3.saving") : view === "intro" ? t("onboarding.v3.start") : t("onboarding.v3.next");
  const footer = (
    <>
      {shown.length ? <MissLine text={summaryOf(shown)} /> : noticeText ? <MissLine text={noticeText} /> : null}
      <KitButton block label={label} onPress={() => void onNext(view)} testID="onboarding-next" variant="primary"
        trailing={view === "goals" && goals.length && !saving ? t("onboarding.v3.nextGoals", { count: goals.length, limit: GOAL_LIMIT }) : undefined} />
    </>
  );
  const birthLabel = isValidProfileBirthDate(basic.birthDate, today)
    ? new Intl.DateTimeFormat(locale.language, { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(`${basic.birthDate}T12:00:00Z`)) : null;
  const pickerOptions = picker === "primary" ? INDUSTRY_CATALOG.map(item => ({ id: item.id as string, label: item.labels[locale.language] }))
    : picker === "secondary" && basic.primaryIndustryId ? listSecondaryIndustries(basic.primaryIndustryId).map(item => ({ id: item.id as string, label: item.labels[locale.language] })) : [];
  function pick(id: string) {
    if (picker === "primary") {
      setBasic(current => ({ ...current, primaryIndustryId: id as IndustryIdCode, secondaryIndustryId: current.primaryIndustryId === id ? current.secondaryIndustryId : "" }));
      if (id !== basic.primaryIndustryId) unmark("primaryIndustryId", "secondaryIndustryId");
    } else {
      setBasic(current => ({ ...current, secondaryIndustryId: id as SecondaryIndustryIdCode }));
      if (id !== basic.secondaryIndustryId) unmark("secondaryIndustryId");
    }
    setPicker(null);
  }
  const pickerTitle = t(picker === "secondary" ? "onboarding.v3.secondaryIndustry" : "onboarding.v3.primaryIndustry");

  return (
    <>
      <OnboardingFrame footer={footer} scrollRef={scrollRef}>
        <OnboardingTopBar onBack={index ? () => go(ONBOARDING_STEPS[index - 1]!) : undefined} onLogout={() => void logOut()} />
        <OnboardingProgress eta={t("onboarding.v3.eta")} index={index} label={t("onboarding.v3.step", { step: index + 1, total: ONBOARDING_STEPS.length, name: t(STEP_NAME[view]) })} total={ONBOARDING_STEPS.length} />
        <OnceNotice scan={view === "profile"} />
        {view === "profile" ? (
          <ProfileStep basic={basic} birthLabel={birthLabel} disabled={saving} errors={errors} inputs={inputs} marks={marks} onBirth={() => setDateOpen(true)} onClearBirth={() => setBasic(current => ({ ...current, birthDate: "" }))} onFieldLayout={onFieldLayout}
            onPick={setPicker} onScan={source => void scanWith(source)} onText={(key, value) => { setBasic(current => ({ ...current, [key]: value })); unmark(key); }} scan={scan}
            showEmail={Boolean(marks.email || basic.email || detail?.profile?.handles?.email)} showPhone={Boolean(marks.phone || basic.phone || detail?.profile?.handles?.phone)} />
        ) : view === "goals" ? (
          <GoalsStep disabled={saving} error={errors.has("goals")} focus={focus} goals={goals} marks={marks} offer={offer} onFocus={setFocus} onGoal={(goal, selected) => setGoals(current => (selected ? current.filter(value => value !== selected) : toggleValue(current, goal, GOAL_LIMIT)))}
            onGoalsLayout={event => onFieldLayout("goals", event)} onGroup={(group, values) => { (group === "offer" ? setOffer : group === "seek" ? setSeek : setTopics)(values); if (group !== "seek") unmark(group); }} revision={fillRevision} seek={seek} seekSuggestions={goals.length ? seekSuggestions : []} topics={topics} />
        ) : (
          <IntroStep bio={bio} bioCount={bioCount} disabled={saving} editing={editing} error={errors.has("intro") ? fieldError("intro") : null} goals={goals.length} input={bioInput} message={message} offer={offer.length} onBio={setBio} onCardLayout={event => onFieldLayout("intro", event)}
            onEdit={() => setEditing(open => !open)} onRegenerate={() => void generateIntro(introStatus === "error" ? "retry" : "regenerate")} onTone={onTone} regenerationsLeft={INTRO_REGENERATE_LIMIT - regenerations} status={introStatus} tone={tone}
            tones={locale.language === "en" ? [{ key: "native", label: t("onboarding.v3.toneEnglish") }] : [{ key: "native", label: t("onboarding.v3.toneNative") }, { key: "en", label: t("onboarding.v3.toneEnglish") }]} topics={topics.length} />
        )}
      </OnboardingFrame>
      <BottomSheet accessibilityLabel={pickerTitle} header={<UiText accessibilityRole="header" style={styles.sheetTitle}>{pickerTitle}</UiText>} onClose={() => setPicker(null)} visible={picker !== null}>
        {pickerOptions.map(option => <SheetRow key={option.id} label={option.label} on={option.id === (picker === "primary" ? basic.primaryIndustryId : basic.secondaryIndustryId)} onPress={() => pick(option.id)} />)}
      </BottomSheet>
      {dateOpen ? (
        <PersonalScheduleDateTimePicker kind="date" value={isValidProfileBirthDate(basic.birthDate, today) ? basic.birthDate : ""} zone={timeZone} disabled={saving} yearJump max={today} title={t("onboarding.v3.birthDate")}
          initialMonth={`${Number(today.slice(0, 4)) - 30}-01`} onCancel={() => setDateOpen(false)} onConfirm={value => { setDateOpen(false); setBasic(current => ({ ...current, birthDate: value })); }} />
      ) : null}
    </>
  );
}
