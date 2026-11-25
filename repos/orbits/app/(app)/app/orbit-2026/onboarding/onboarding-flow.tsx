/**
 * 新用户引导（三步版，docs/designs/redesign-2026-10/onboarding-3step-proposal.html）。首次登录资料未完成时由门禁带到这里；没有壳、不能跳过。
 *
 * ① 名刺・基本情報 → ② 目標と強み → ③ 自己紹介。扫自己的名片填大部分（名刺から / AI 推定 分开标，用户一改就去掉标记）。
 * 「次へ」始终可点：缺项时滚到第一个缺项、标红、写清缺什么。每步经 PUT /api/profile 保存并复读核验，再推进 actor 级进度
 * （/api/profile/onboarding-progress，仍是五屏：①=1，②=2、3，③=4、5 后 finish）。未提交的输入写本地草稿（「自動保存済み」）；
 * 「ログアウト」先把这一步能存的存到服务端，下次登录回到同一步。
 */
"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";

import type { ProfilePayload } from "../../../../../features/profile/contract";
import type { ContactHandlesContract, ProfileOnboardingProgressCommandContract, ProfileOnboardingProgressContract, SeniorityLevelCode } from "../../../../../shared/contract/profile";
import { composeProfileOnboardingGoal, parseProfileOnboardingGoal } from "../../../../../shared/compute/profile-onboarding-goal";
import type { IndustryIdCode, SecondaryIndustryIdCode } from "../../../../../shared/contract/industries";
import { isIndustryIdCode, validateIndustrySelection } from "../../../../../shared/domain/industries";
import { regionDisplayName } from "../../../../../shared/domain/regions";
import { isSeniorityLevelValue } from "../../../../../shared/domain/seniority";
import { isValidProfileBirthDate } from "../../../../../features/profile/onboarding";
import { useOrbitLanguage } from "../../orbit-language-context";
import { signOutAndForget } from "../../orbit-sign-out";
import { visibleCharacterCount } from "../../profile/profile-save-model";
import { InviteQr } from "../add/invite/InviteQr";
import { Icon, Modal, Orbit2026Scope } from "../ui";
import {
  fetchAutofillInference,
  fetchOnboardingProgress,
  fetchProfile,
  fetchSeekSuggestions,
  generateIntroDraft,
  saveProfileFields,
  scanOwnBusinessCard,
  updateOnboardingProgress,
  type ProfileFields,
} from "./onboarding-client";
import {
  bioCounter,
  HEADLINE_LIMIT,
  INTRO_REGENERATE_LIMIT,
  ONBOARDING_STEPS,
  ONBOARDING_STEP_SCREENS,
  SEEK_OPTIONS,
  clearOnboardingDraft,
  hasDraftInput,
  missingBasics,
  missingIntro,
  onboardingStepForProgress,
  optionMatches,
  readOnboardingDraft,
  writeOnboardingDraft,
  type BasicField,
  type Copy,
  type FieldOrigin,
  type OnboardingMissing,
  type OnboardingView,
  type ProfileScreenNumber,
} from "./onboarding-model";
import { ONBOARDING_STEP_LABELS, OnboardingStepper, rememberOnboardingFlow, rememberedOnboardingFlow } from "./OnboardingGuide";
import {
  GoalsStep,
  IntroAside,
  IntroStep,
  MISSING_TARGETS,
  OnceNote,
  ProfileAside,
  ProfileStep,
  StrengthGroups,
  missingSummary,
  type BasicDraft,
  type IntroStatus,
  type IntroTone,
  type T,
} from "./onboarding-steps";
import { ONBOARDING_COPY } from "../copy/onboarding";
import styles from "./OnboardingFlow.module.css";

export interface OnboardingFlowProps {
  actorKey: string;
  cardScanAvailable: boolean;
  next: string;
  todayIso: string;
}

const EMPTY_BASIC: BasicDraft = { birthDate: "", company: "", email: "", name: "", phone: "", primaryIndustryId: "", secondaryIndustryId: "", title: "" };
const SEEK_DEBOUNCE_MS = 700;

function basicFromPayload(payload: ProfilePayload): BasicDraft {
  const profile = payload.profile;
  if (!profile) return EMPTY_BASIC;
  return {
    birthDate: profile.birthDate ?? "",
    company: profile.organization ?? "",
    email: profile.handles?.email ?? "",
    name: profile.displayName ?? "",
    phone: profile.handles?.phone ?? "",
    primaryIndustryId: isIndustryIdCode(profile.primaryIndustryId) ? profile.primaryIndustryId : "",
    secondaryIndustryId: (profile.secondaryIndustryId as SecondaryIndustryIdCode | undefined) ?? "",
    title: profile.role ?? "",
  };
}

function basicFromDraft(draft: NonNullable<NonNullable<ReturnType<typeof readOnboardingDraft>>["fields"]>["basic"]): BasicDraft | null {
  if (!draft) return null;
  return {
    ...draft,
    primaryIndustryId: isIndustryIdCode(draft.primaryIndustryId) ? draft.primaryIndustryId : "",
    secondaryIndustryId: draft.secondaryIndustryId as SecondaryIndustryIdCode | "",
  };
}

type Origins = Partial<Record<BasicField, FieldOrigin>>;

export function OnboardingFlow({ actorKey, cardScanAvailable, next, todayIso }: OnboardingFlowProps) {
  const { language, t: siteText } = useOrbitLanguage();
  const t: T = (copy: Copy) => siteText(copy as { ja: string; zh: string; en: string });
  // Start on the step this tab last read, so the header and stepper do not show step 1 and then jump once the read lands.
  const [start] = useState(() => {
    const confirmed = rememberedOnboardingFlow()?.lastConfirmedScreen ?? 0;
    return { confirmed, view: onboardingStepForProgress(confirmed) };
  });
  const [view, setView] = useState<OnboardingView>(start.view);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [expectedUpdatedAt, setExpectedUpdatedAt] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<number>(start.confirmed);
  const [basic, setBasic] = useState<BasicDraft>(EMPTY_BASIC);
  const [origins, setOrigins] = useState<Origins>({});
  const [scan, setScan] = useState<{ ai: number; card: number } | null>(null);
  const [region, setRegion] = useState("");
  const [seniority, setSeniority] = useState<SeniorityLevelCode | null>(null);
  const [goalText, setGoalText] = useState("");
  const [goalChoices, setGoalChoices] = useState<string[]>([]);
  const [offer, setOffer] = useState<string[]>([]);
  const [seek, setSeek] = useState<string[]>([]);
  const [topics, setTopics] = useState<string[]>([]);
  const [offerFromAi, setOfferFromAi] = useState(false);
  const [topicsFromAi, setTopicsFromAi] = useState(false);
  const [seekAi, setSeekAi] = useState<readonly string[]>([]);
  const [bio, setBio] = useState("");
  const [headline, setHeadline] = useState("");
  const [introStatus, setIntroStatus] = useState<IntroStatus>("idle");
  const [introErrorCode, setIntroErrorCode] = useState<"INTRO_LIMIT_REACHED" | "SAMPLE_READ_ONLY" | null>(null);
  const [introRegenerations, setIntroRegenerations] = useState(0);
  const [introTone, setIntroTone] = useState<IntroTone>("native");
  const [editingIntro, setEditingIntro] = useState(false);
  // 每个语气只生成一次：切回已生成过的语气直接复用，不再调用模型（R28 §2.11）。
  const introDrafts = useRef<Partial<Record<IntroTone, { bio: string; headline: string }>>>({});
  const [saving, setSaving] = useState(false);
  // 点过「次へ」但有缺项的那一步：标红与汇总只在这之后出现，补齐即消失。
  const [attempted, setAttempted] = useState<OnboardingView | null>(null);
  // 「自動保存済み」只在真的存过之后出现：某屏已经服务端确认，或这次改动已写进本地草稿（读取后的第一次写入不算改动）。
  const [draftSaved, setDraftSaved] = useState(false);
  const draftBaselineRef = useRef<string | null>(null);
  const handlesRef = useRef<ContactHandlesContract>({});
  const savedPlaceRef = useRef({ homeMarket: "", seniority: false });
  const progressRef = useRef<ProfileOnboardingProgressContract | null>(null);
  const initMutationRef = useRef<string | null>(null);
  const pendingConfirmRef = useRef<ProfileOnboardingProgressCommandContract | null>(null);
  const savedFieldsRef = useRef<string | null>(null);
  const finishMutationRef = useRef<string | null>(null);
  const introActionKeyRef = useRef<string | null>(null);
  const inferredForRef = useRef<string | null>(null);
  // 用户动过的字段：后到的 AI 结果不覆盖。
  const touchedRef = useRef({ industry: false, offer: false, topics: false });
  const basicRef = useRef(basic);
  basicRef.current = basic;
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const cameraRef = useRef<HTMLInputElement | null>(null);

  const stepIndex = ONBOARDING_STEPS.indexOf(view);
  const name = basic.name.trim();
  const initial = name ? Array.from(name)[0]!.toUpperCase() : "";

  // 读取已保存资料 + 进度 + 本地草稿。草稿只补该屏还没被服务端确认的输入。
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [payload, flow] = await Promise.all([fetchProfile(), fetchOnboardingProgress()]);
        if (!active) return;
        progressRef.current = flow;
        rememberOnboardingFlow(flow);
        const done = flow?.lastConfirmedScreen ?? 0;
        setConfirmed(done);
        const profile = payload.profile;
        handlesRef.current = { ...(profile?.handles ?? {}) };
        savedPlaceRef.current = { homeMarket: profile?.homeMarket?.trim() ?? "", seniority: Boolean(profile?.seniorityLevel) };
        const complete = payload.onboarding?.status === "complete";
        const draft = readOnboardingDraft(actorKey);
        const fields = draft?.fields;
        const draftBasic = done < 1 || !complete ? basicFromDraft(fields?.basic) : null;
        setBasic(draftBasic ?? basicFromPayload(payload));
        setExpectedUpdatedAt(profile?.updatedAt ?? null);
        setOffer(done < 3 && fields?.offer ? fields.offer : [...(profile?.offering ?? [])]);
        setSeek(done < 3 && fields?.seek ? fields.seek : [...(profile?.seeking ?? [])]);
        setTopics(done < 3 && fields?.topics ? fields.topics : [...(profile?.topics ?? [])]);
        setBio(done < 4 && fields?.bio !== undefined ? fields.bio : profile?.bio ?? "");
        setHeadline(profile?.headline ?? "");
        if (draft) {
          setDraftSaved(hasDraftInput(draft));
          setGoalText(draft.goalText);
          setGoalChoices(draft.goalChoices ?? []);
          setIntroRegenerations(draft.introRegenerations);
          if (draft.scan) {
            if (draftBasic) { setOrigins(draft.scan.origins); setScan({ ai: draft.scan.ai, card: draft.scan.card }); }
            if (done < 3) { setOfferFromAi(draft.scan.offerFromAi); setTopicsFromAi(draft.scan.topicsFromAi); }
            setRegion(draft.scan.region ?? "");
            if (isSeniorityLevelValue(draft.scan.seniorityLevel)) setSeniority(draft.scan.seniorityLevel);
          }
        }
        if (done >= 2 || !draft?.goalText.trim()) {
          const restored = parseProfileOnboardingGoal(profile?.relationshipGoal ?? "");
          if (done >= 2 || restored.raw || !draft?.goalChoices?.length) {
            setGoalText(restored.focus);
            setGoalChoices(restored.choices);
          }
        }
        // 必填项缺了（包括走完后又被清空的老账号）：回到第一步补，不跳去会把人送回来的页面。
        if (!complete) setView("basics");
        else if (flow?.finishedAt) { window.location.assign(next); return; }
        else setView(flow ? onboardingStepForProgress(done) : draft?.view ?? "basics");
        setLoaded(true);
      } catch {
        if (!active) return;
        setLoadError(t(ONBOARDING_COPY.flow019));
      }
    })();
    return () => {
      active = false;
    };
    // 只在挂载时读取一次。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const fields = { basic, offer, seek, topics, bio };
    const written = writeOnboardingDraft(actorKey, {
      view, goalText, goalChoices, horizon: "", introRegenerations, fields,
      ...(scan || offerFromAi || topicsFromAi ? { scan: { ai: scan?.ai ?? 0, card: scan?.card ?? 0, offerFromAi, origins, region, topicsFromAi, ...(seniority ? { seniorityLevel: seniority } : {}) } } : {}),
    });
    const input = JSON.stringify([goalText, goalChoices, fields]);
    if (draftBaselineRef.current === null) draftBaselineRef.current = input;
    else if (written && input !== draftBaselineRef.current) setDraftSaved(true);
  }, [actorKey, goalText, goalChoices, introRegenerations, loaded, view, basic, offer, seek, topics, bio, scan, origins, offerFromAi, topicsFromAi, region, seniority]);

  function go(nextView: OnboardingView) {
    setError("");
    setAttempted(null);
    setView(nextView);
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  }

  // ── 校验 ──
  const industryValid = Boolean(basic.primaryIndustryId && basic.secondaryIndustryId)
    && validateIndustrySelection({ primaryIndustryId: basic.primaryIndustryId, secondaryIndustryId: basic.secondaryIndustryId }).valid;
  const birthValid = !basic.birthDate || isValidProfileBirthDate(basic.birthDate, todayIso);
  const bioCount = bioCounter(bio);
  const missing: OnboardingMissing[] = view === "basics"
    ? missingBasics({ birthValid, industryValid, name: basic.name, primaryIndustryId: basic.primaryIndustryId })
    : view === "goals" ? (goalChoices.length ? [] : ["goal"])
      : missingIntro({ bio, bioOver: bioCount.over, generating: introStatus === "generating", headlineOver: visibleCharacterCount(headline.trim()) > HEADLINE_LIMIT });
  const shown = attempted === view ? missing : [];

  function focusMissing(first: OnboardingMissing) {
    if (first === "introEmpty") setEditingIntro(true);
    if (typeof document === "undefined") return;
    requestAnimationFrame(() => {
      const target = document.getElementById(MISSING_TARGETS[first]);
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
      target?.focus({ preventScroll: true });
    });
  }

  // ── 保存与进度 ──
  async function ensureProgress(): Promise<ProfileOnboardingProgressContract> {
    if (progressRef.current) return progressRef.current;
    initMutationRef.current ??= crypto.randomUUID();
    const flow = await updateOnboardingProgress({ action: "initialize", expectedRevision: null, mutationId: initMutationRef.current });
    progressRef.current = flow;
    return flow;
  }

  async function confirmScreen(screen: ProfileScreenNumber): Promise<void> {
    const flow = await ensureProgress();
    if (flow.lastConfirmedScreen >= screen) { pendingConfirmRef.current = null; return; }
    if (!pendingConfirmRef.current || pendingConfirmRef.current.action !== "confirm" || pendingConfirmRef.current.screen !== screen) {
      pendingConfirmRef.current = { action: "confirm", screen, expectedRevision: flow.revision, mutationId: crypto.randomUUID() };
    }
    try {
      progressRef.current = await updateOnboardingProgress(pendingConfirmRef.current);
      pendingConfirmRef.current = null;
    } catch (caught) {
      const latest = await fetchOnboardingProgress().catch(() => null);
      if (!latest || latest.lastConfirmedScreen < screen) throw caught;
      progressRef.current = latest;
      pendingConfirmRef.current = null;
    } finally {
      setConfirmed(progressRef.current?.lastConfirmedScreen ?? 0);
      rememberOnboardingFlow(progressRef.current);
    }
  }

  function saveError(caught: unknown): string {
    const conflict = caught instanceof Error && "code" in caught && caught.code === "PROFILE_VERSION_CONFLICT";
    return conflict
      ? t({ zh: "资料已在另一处更新。请刷新并核对后再保存。", en: "Your profile changed elsewhere. Refresh and review it before saving.", ja: "別の画面でプロフィールが更新されました。再読み込みして内容を確認してください。" })
      : t(ONBOARDING_COPY.flow020);
  }

  /** 存字段（同一份内容重试时不再 PUT），再依次确认这一步对应的服务端屏。 */
  async function save(step: OnboardingView, fields: ProfileFields): Promise<boolean> {
    setSaving(true);
    setError("");
    try {
      await ensureProgress(); // Must persist the flow before the first profile PUT.
      const fingerprint = JSON.stringify([step, fields]);
      if (savedFieldsRef.current !== fingerprint) {
        const payload = await saveProfileFields(fields, expectedUpdatedAt);
        setExpectedUpdatedAt(payload.profile?.updatedAt ?? null);
        handlesRef.current = { ...(payload.profile?.handles ?? {}) };
        savedFieldsRef.current = fingerprint;
      }
      for (const screen of ONBOARDING_STEP_SCREENS[step]) await confirmScreen(screen);
      savedFieldsRef.current = null;
      return true;
    } catch (caught) {
      setError(saveError(caught));
      return false;
    } finally {
      setSaving(false);
    }
  }

  function basicsFields(): ProfileFields {
    const handles: ContactHandlesContract = { ...handlesRef.current };
    const email = basic.email.trim();
    const phone = basic.phone.trim();
    if (email) handles.email = email; else delete handles.email;
    if (phone) handles.phone = phone; else delete handles.phone;
    return {
      birthDate: basic.birthDate || null,
      displayName: name,
      handles,
      organization: basic.company.trim(),
      primaryIndustryId: basic.primaryIndustryId as IndustryIdCode,
      role: basic.title.trim(),
      secondaryIndustryId: basic.secondaryIndustryId as SecondaryIndustryIdCode,
      // 名片地址与职位给出的所在地、职级：只在资料里还没有时补上，之后可在账户里改。
      ...(region && !savedPlaceRef.current.homeMarket ? { homeMarket: region } : {}),
      ...(seniority && !savedPlaceRef.current.seniority ? { seniorityLevel: seniority } : {}),
    };
  }

  const goalsFields = (): ProfileFields => ({ offering: offer, relationshipGoal: composeProfileOnboardingGoal(goalChoices, goalText, language), seeking: seek, topics });
  const introFields = (): ProfileFields => ({ bio: bio.trim(), headline: headline.trim() });

  async function finish(): Promise<void> {
    setSaving(true);
    try {
      const flow = progressRef.current!;
      if (!flow.finishedAt) {
        finishMutationRef.current ??= crypto.randomUUID();
        progressRef.current = await updateOnboardingProgress({ action: "finish", expectedRevision: flow.revision, mutationId: finishMutationRef.current });
      }
      rememberOnboardingFlow(progressRef.current);
      clearOnboardingDraft(actorKey);
      window.location.assign(next);
    } catch {
      setError(t({ zh: "无法完成设置，请重试。", en: "Could not finish onboarding. Please retry.", ja: "設定を完了できませんでした。再試行してください。" }));
    } finally {
      setSaving(false);
    }
  }

  async function onNext() {
    if (saving || !loaded || scanning) return;
    if (missing.length) {
      setAttempted(view);
      focusMissing(missing[0]!);
      return;
    }
    setAttempted(null);
    if (view === "basics") {
      // 没扫名片（或扫完又改了公司、职位）：用这一步填的内容在后台补推断，不等它。
      void infer(basic);
      if (!await save("basics", basicsFields())) return;
      // 走完过的老账号只是回来补必填项。
      if (progressRef.current?.finishedAt) { clearOnboardingDraft(actorKey); window.location.assign(next); return; }
      go("goals");
      return;
    }
    if (view === "goals") {
      if (await save("goals", goalsFields())) go("intro");
      return;
    }
    if (await save("intro", introFields())) await finish();
  }

  function onBack() {
    if (stepIndex > 0) go(ONBOARDING_STEPS[stepIndex - 1]!);
  }

  /** 退出登录会清掉本机草稿：先把这一步能存的存到服务端（不推进进度），下次登录回到同一步。 */
  async function logout() {
    if (saving) return;
    setSaving(true);
    try {
      if (loaded) {
        if (view === "basics" && name) {
          const { birthDate, primaryIndustryId, secondaryIndustryId, ...rest } = basicsFields();
          await saveProfileFields({ ...rest, ...(birthValid ? { birthDate } : {}), ...(industryValid ? { primaryIndustryId, secondaryIndustryId } : {}) }, expectedUpdatedAt);
        } else if (view === "goals") await saveProfileFields(goalsFields(), expectedUpdatedAt);
        else if (view === "intro" && bio.trim() && !bioCount.over) await saveProfileFields(introFields(), expectedUpdatedAt);
      }
    } catch {
      // 存不上也照样退出：人要离开这台设备。
    }
    await signOutAndForget(`/app/account/login?next=${encodeURIComponent(next)}`);
  }

  // ── 扫名片与推断 ──
  function editBasic(patch: Partial<BasicDraft>) {
    setBasic(current => ({ ...current, ...patch }));
    if ("primaryIndustryId" in patch || "secondaryIndustryId" in patch) touchedRef.current.industry = true;
    setOrigins(current => {
      const kept = { ...current };
      for (const key of Object.keys(patch)) delete kept[key as BasicField];
      return kept;
    });
  }

  async function infer(from: BasicDraft): Promise<void> {
    const company = from.company.trim();
    const title = from.title.trim();
    const key = `${company}\u0000${title}`;
    if ((!company && !title) || inferredForRef.current === key) return;
    inferredForRef.current = key;
    const result = await fetchAutofillInference({
      displayName: from.name.trim(), language, organization: company, role: title,
      ...(from.primaryIndustryId && from.secondaryIndustryId ? { primaryIndustryId: from.primaryIndustryId, secondaryIndustryId: from.secondaryIndustryId } : {}),
    });
    if (result.status !== "ready") return;
    if (result.primaryIndustryId && result.secondaryIndustryId && !touchedRef.current.industry && !basicRef.current.primaryIndustryId) {
      const pair = { primaryIndustryId: result.primaryIndustryId, secondaryIndustryId: result.secondaryIndustryId };
      setBasic(current => (current.primaryIndustryId ? current : { ...current, ...pair }));
      setOrigins(current => ({ ...current, primaryIndustryId: "ai", secondaryIndustryId: "ai" }));
      setScan(current => (current ? { ...current, ai: 2 } : current));
    }
    if (result.seniorityLevel) setSeniority(current => current ?? result.seniorityLevel);
    if (!touchedRef.current.offer && result.offering.length) setOffer(current => { if (current.length) return current; setOfferFromAi(true); return [...result.offering]; });
    if (!touchedRef.current.topics && result.topics.length) setTopics(current => { if (current.length) return current; setTopicsFromAi(true); return [...result.topics]; });
  }

  async function scanCard(file: File | undefined) {
    if (!file || scanning) return;
    setScanning(true);
    setError("");
    try {
      const card = await scanOwnBusinessCard(file);
      const printed = ([["name", card.name], ["company", card.company], ["title", card.title], ["email", card.email], ["phone", card.phone]] as const).filter(([, value]) => value);
      if (!printed.length) throw new Error("empty card");
      const filled: BasicDraft = { ...basicRef.current, ...Object.fromEntries(printed), ...(card.industry ?? {}) };
      const nextOrigins: Origins = { ...origins };
      for (const [key] of printed) nextOrigins[key] = "card";
      if (card.industry) { nextOrigins.primaryIndustryId = "ai"; nextOrigins.secondaryIndustryId = "ai"; touchedRef.current.industry = false; }
      setBasic(filled);
      setOrigins(nextOrigins);
      setScan({ ai: card.industry ? 2 : 0, card: printed.length });
      if (card.region) setRegion(regionDisplayName({ city: card.region.city ?? null, countryCode: card.region.countryCode }, language));
      if (card.seniorityLevel) setSeniority(card.seniorityLevel);
      void infer(filled);
    } catch {
      setError(t(ONBOARDING_COPY.flow023));
    } finally {
      setScanning(false);
    }
  }

  const chooseOffer = (update: (current: string[]) => string[]) => { touchedRef.current.offer = true; setOfferFromAi(false); setOffer(update); };
  const chooseTopics = (update: (current: string[]) => string[]) => { touchedRef.current.topics = true; setTopicsFromAi(false); setTopics(update); };

  // 选了目标之后给「求めていること」虚线候选；同一组目标只问一次，点了才加入。
  const goalKey = goalChoices.join("\u0000");
  useEffect(() => {
    if (view !== "goals" || !loaded || !goalKey) { setSeekAi([]); return; }
    let active = true;
    const timer = setTimeout(() => {
      fetchSeekSuggestions(SEEK_OPTIONS.map(option => t(option)), composeProfileOnboardingGoal(goalChoices, goalText, language), language)
        .then(labels => { if (active) setSeekAi(labels.map(label => { const option = SEEK_OPTIONS.find(item => optionMatches(item, label)); return option ? t(option) : label; })); }, () => undefined);
    }, SEEK_DEBOUNCE_MS);
    return () => { active = false; clearTimeout(timer); };
    // 只随目标选择变化；一句话的改动不重问。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, loaded, goalKey]);

  // ── AI 介绍：进入这一步且还没有介绍时自动起草；用户可「別の案」、切换语气、直接改 ──
  // kind: auto = 进入本步自动生成；retry = 失败后重试；这两种不计次。regenerate = 新草稿（別の案 / 第一次切到 English），成功才计次，上限 2 次。
  async function generateIntro(kind: "auto" | "retry" | "regenerate", tone: IntroTone = introTone) {
    if (introStatus === "generating") return;
    if (kind === "regenerate" && introRegenerations >= INTRO_REGENERATE_LIMIT) return;
    const previous = { bio, headline, status: introStatus, tone: introTone };
    setIntroStatus("generating");
    setIntroErrorCode(null);
    setIntroTone(tone);
    try {
      if (kind === "regenerate" || (kind === "retry" && !introActionKeyRef.current)) introActionKeyRef.current = crypto.randomUUID();
      introActionKeyRef.current ??= `web:onboarding:intro:first:${actorKey}:${expectedUpdatedAt ?? "new"}`;
      const draft = await generateIntroDraft(tone === "en" ? "en" : language, introActionKeyRef.current);
      introActionKeyRef.current = null;
      introDrafts.current[tone] = draft;
      setHeadline(draft.headline);
      setBio(draft.bio);
      setIntroStatus("ready");
      setEditingIntro(false);
      if (kind === "regenerate") setIntroRegenerations(count => count + 1);
    } catch (caught) {
      if (caught instanceof Error && "code" in caught && caught.code) introActionKeyRef.current = null;
      const code = caught instanceof Error && "code" in caught ? caught.code : null;
      if (kind === "regenerate" && (previous.bio.trim() || previous.headline.trim())) {
        // 新草稿失败：保留上一版，不扣次数。
        setIntroStatus(previous.status === "error" ? "ready" : previous.status);
        setIntroTone(previous.tone);
        setError(t(ONBOARDING_COPY.flow021));
        return;
      }
      setIntroStatus("error");
      setIntroErrorCode(code === "INTRO_LIMIT_REACHED" || code === "SAMPLE_READ_ONLY" ? code : null);
    }
  }

  function switchTone(tone: IntroTone) {
    if (tone === introTone || introStatus === "generating") return;
    introDrafts.current[introTone] = { bio, headline };
    const cached = introDrafts.current[tone];
    if (cached) {
      setIntroTone(tone);
      setBio(cached.bio);
      setHeadline(cached.headline);
      return;
    }
    void generateIntro("regenerate", tone);
  }

  useEffect(() => {
    if (view === "intro" && loaded && introStatus === "idle" && !bio.trim() && !headline.trim()) {
      void generateIntro("auto");
    }
    // generateIntro 只依赖当前状态；按进入步骤触发。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, loaded]);

  // ── 渲染 ──
  const groups = { goals: goalChoices.length, offer, offerFromAi, seek, seekAi, setOffer: chooseOffer, setSeek, setTopics: chooseTopics, t, topics, topicsFromAi };
  const logoutButton = <button className={`btn ${styles.logout}`} data-onboarding-logout="" disabled={saving} onClick={() => void logout()} type="button">{t({ ja: "ログアウト", zh: "退出登录", en: "Log out" })}</button>;
  const back = t({ zh: "返回", en: "Back", ja: "戻る" });
  const eta = t({ ja: "約1分", zh: "约 1 分钟", en: "About 1 min" });
  const nextLabel = saving ? t(ONBOARDING_COPY.flow024) : view === "intro" ? t({ ja: "この内容ではじめる", zh: "就用这份开始", en: "Start with this" }) : t({ zh: "下一步", en: "Next", ja: "次へ" });
  const stepLabel = t(ONBOARDING_STEP_LABELS[stepIndex]!);

  return (
    <Orbit2026Scope language={language} as="main" className={styles.page}>
      <header className={styles.head}>
        <span className={styles.brand}><span className={styles.logo} aria-hidden>O</span><b>Orbit</b></span>
        <div className={styles.steps}><OnboardingStepper current={stepIndex + 1} confirmed={stepIndex} /><span className={styles.eta}>{eta}</span></div>
        {logoutButton}
      </header>

      <div className={styles.body} data-onboarding-view={view}>
        <div className={styles.phoneHead}>
          <div className={styles.phoneTop}>
            {stepIndex > 0 ? <button aria-label={back} className={`btn ${styles.round}`} disabled={saving} onClick={onBack} type="button"><Icon name="left" size={20} /></button> : <span className={styles.logo} aria-hidden>O</span>}
            <b>Orbit</b>
            {logoutButton}
          </div>
          <div className={styles.bar} aria-hidden>{ONBOARDING_STEPS.map((step, index) => <i className={index < stepIndex ? styles.barDone : index === stepIndex ? styles.barNow : ""} key={step} />)}</div>
          <div className={styles.barLabel}><span>{t({ ja: `ステップ ${stepIndex + 1} / 3 · ${stepLabel}`, zh: `第 ${stepIndex + 1} / 3 步 · ${stepLabel}`, en: `Step ${stepIndex + 1} / 3 · ${stepLabel}` })}</span><span>{eta}</span></div>
        </div>
        {loadError ? <div className={styles.notice} role="alert">{loadError}</div> : null}
        <OnceNote t={t} withScan={view === "basics" && cardScanAvailable} />
        <div className={styles.grid}>
          <section className={styles.card} aria-busy={!loaded || undefined}>
            {view === "basics" ? <ProfileStep basic={basic} cameraRef={cameraRef} cardScanAvailable={cardScanAvailable} disabled={!loaded || saving} fileRef={fileRef} language={language} missing={shown}
              onCardDrop={(file) => void scanCard(file)} onCardFile={(event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; event.target.value = ""; void scanCard(file); }} onQr={() => setQrOpen(true)}
              onUserEdit={editBasic} origins={origins} scan={scan} scanning={scanning} showContact={{ email: Boolean(basic.email) || Boolean(origins.email) || scan !== null && Boolean(handlesRef.current.email), phone: Boolean(basic.phone) || Boolean(origins.phone) || scan !== null && Boolean(handlesRef.current.phone) }} t={t} todayIso={todayIso} /> : null}
            {view === "goals" ? <>
              <GoalsStep error={shown.includes("goal")} goals={goalChoices} setGoals={setGoalChoices} setGoalText={setGoalText} t={t} text={goalText} />
              <div className={styles.inline}><StrengthGroups {...groups} /></div>
            </> : null}
            {view === "intro" ? <IntroStep bio={bio} bioCount={bioCount} editing={editingIntro} errorCode={introErrorCode} goals={goalChoices.length || (goalText.trim() ? 1 : 0)} missing={shown}
              offer={offer.length} topics={topics.length} onEdit={() => setEditingIntro(value => !value)}
              onRegenerate={() => void generateIntro(introStatus === "error" ? "retry" : "regenerate")} onTone={switchTone}
              regenerationsLeft={INTRO_REGENERATE_LIMIT - introRegenerations} setBio={setBio} status={introStatus} t={t} tone={introTone} /> : null}

            {error ? <div className={styles.notice} role="alert">{error}</div> : null}

            <div className={styles.foot}>
              {stepIndex > 0 ? <button className={`btn ${styles.back}`} disabled={saving} onClick={onBack} type="button"><Icon name="left" size={16} />{back}</button> : null}
              {shown.length === 0 && (confirmed > 0 || draftSaved) ? <span className={styles.saved}><Icon name="check" size={16} /> {t({ zh: "已自动保存", en: "Saved automatically", ja: "自動保存済み" })}</span> : null}
              <span className={styles.spacer} />
              {shown.length ? <span className={styles.miss} role="alert"><Icon name="flag" size={16} />{missingSummary(shown, t, language)}</span> : null}
              <button aria-busy={saving || undefined} className={`btn ${styles.primary}`} data-onboarding-next="" onClick={() => void onNext()} type="button">
                {nextLabel}{view === "goals" && goalChoices.length ? <span className={styles.goalCount}>{t({ ja: ` · 目標 ${goalChoices.length} / 2`, zh: ` · 目标 ${goalChoices.length} / 2`, en: ` · Goals ${goalChoices.length} / 2` })}</span> : null}<Icon name="right" size={16} />
              </button>
            </div>
          </section>

          <aside className={styles.aside}>
            {view === "basics" ? <ProfileAside basic={basic} initial={initial} language={language} t={t} /> : null}
            {view === "goals" ? <div className={styles.sideCard}><StrengthGroups {...groups} /></div> : null}
            {view === "intro" ? <IntroAside bio={bio} t={t} /> : null}
          </aside>
        </div>
      </div>
      <Modal open={qrOpen} onClose={() => setQrOpen(false)} title={t({ ja: "スマホで撮る", zh: "用手机拍", en: "Use your phone" })} size={380}>
        <div className={styles.qrBody}>
          {qrOpen ? <InviteQr label={t({ ja: "スマホで開く QR コード", zh: "用手机打开的二维码", en: "QR code to open on your phone" })} text={`${window.location.origin}/app/profile/onboarding?next=${encodeURIComponent(next)}`} /> : null}
          <div className={styles.sub}>{t({ ja: "スマホで読み取り、同じアカウントでログインすると、そこで名刺を撮れます。", zh: "用手机扫码，登录同一个账号后就能在手机上拍名片。", en: "Scan this with your phone and sign in to the same account to photograph your card there." })}</div>
        </div>
      </Modal>
    </Orbit2026Scope>
  );
}
