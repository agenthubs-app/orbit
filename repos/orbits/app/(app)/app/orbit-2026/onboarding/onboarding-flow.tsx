/**
 * 新用户引导（Orbit_0918 新用户引导.dc.html）。首次登录资料未完成时由门禁带到这里。
 *
 * 流程：欢迎 → 关于你 → 目标 → 画像 → iOrbit 帮你写介绍（AI，设计外新增）→ 带入人脉（只开放扫描名片）。
 * 每一步点「继续」即经 PUT /api/profile 保存并复读核验；关于你一步保存后资料门禁即解除。
 * 顶栏 iOrbit / Network 打开预览屏（onboarding-previews），预览里点任何位置都回到填写步骤。
 */
"use client";

import { useEffect, useRef, useState, type ChangeEvent, type ReactNode, type RefObject } from "react";

import type { ProfilePayload } from "../../../../../features/profile/contract";
import type { ProfileOnboardingProgressCommandContract, ProfileOnboardingProgressContract } from "../../../../../shared/contract/profile";
import { PROFILE_ONBOARDING_GOALS, composeProfileOnboardingGoal, parseProfileOnboardingGoal } from "../../../../../shared/compute/profile-onboarding-goal";
import type { IndustryIdCode, SecondaryIndustryIdCode } from "../../../../../shared/contract/industries";
import {
  INDUSTRY_CATALOG,
  industryLabel,
  isIndustryIdCode,
  listSecondaryIndustries,
  secondaryIndustryLabel,
  validateIndustrySelection,
} from "../../../../../shared/domain/industries";
import { isValidProfileBirthDate } from "../../../../../features/profile/onboarding";
import { useOrbitLanguage } from "../../orbit-language-context";
import { visibleCharacterCount } from "../../profile/profile-save-model";
import {
  fetchProfile,
  fetchOnboardingProgress,
  generateIntroDraft,
  saveProfileFields,
  updateOnboardingProgress,
  fetchSeekSuggestions,
  scanOwnBusinessCard,
  type ProfileFields,
} from "./onboarding-client";
import {
  bioCounter,
  HEADLINE_LIMIT,
  INTRO_REGENERATE_LIMIT,
  OFFER_LIMIT,
  OFFER_OPTIONS,
  ONBOARDING_STEPS,
  SEEK_LIMIT,
  SEEK_OPTIONS,
  TOPIC_LIMIT,
  TOPIC_OPTIONS,
  addCustomValue,
  clearOnboardingDraft,
  optionMatches,
  readOnboardingDraft,
  seekOptionsFromLabels,
  toggleValue,
  writeOnboardingDraft,
  type Copy,
  type OnboardingStep,
  type OnboardingView,
} from "./onboarding-model";
import { horizonOption, type GoalHorizon } from "../../profile/goal-editor/goal-editor-model";
import { OnboardingHomePreview, OnboardingNetworkPreview, type PreviewProgress } from "./onboarding-previews";
import { ONBOARDING_STYLES } from "./onboarding-styles";
import { ONBOARDING_COPY, ONBOARDING_PREVIEW_PEOPLE, ONBOARDING_SCREEN_LABELS } from "../copy/onboarding";

export interface OnboardingFlowProps {
  actorKey: string;
  cardScanAvailable: boolean;
  next: string;
  todayIso: string;
}

type IntroStatus = "idle" | "generating" | "ready" | "error";


interface BasicDraft {
  birthDate: string;
  company: string;
  name: string;
  primaryIndustryId: IndustryIdCode | "";
  secondaryIndustryId: SecondaryIndustryIdCode | "";
  title: string;
}

const EMPTY_BASIC: BasicDraft = { birthDate: "", company: "", name: "", primaryIndustryId: "", secondaryIndustryId: "", title: "" };

const WEEKDAYS: readonly Copy[] = [
  ONBOARDING_COPY.flow001, ONBOARDING_COPY.flow002, ONBOARDING_COPY.flow003, ONBOARDING_COPY.flow004,
  ONBOARDING_COPY.flow005, ONBOARDING_COPY.flow006, ONBOARDING_COPY.flow007,
];

const STEP_TITLES: Record<OnboardingStep, Copy> = {
  profile: ONBOARDING_COPY.flow008,
  goals: ONBOARDING_COPY.flow009,
  persona: ONBOARDING_COPY.flow010,
  intro: ONBOARDING_COPY.flow011,
  import: ONBOARDING_COPY.flow012,
};

const STEP_NAV_TITLES: Record<OnboardingStep, Copy> = {
  profile: { zh: "基本信息", en: "Basics", ja: "基本情報" },
  goals: { zh: "目标", en: "Goals", ja: "目標" },
  persona: { zh: "优势与需求", en: "Offer & seek", ja: "強み・ニーズ" },
  intro: { zh: "自我介绍", en: "Introduction", ja: "自己紹介" },
  import: { zh: "导入名片", en: "Cards", ja: "名刺の取り込み" },
};

const STEP_TIMES: Record<OnboardingStep, Copy> = {
  profile: ONBOARDING_COPY.flow013,
  goals: ONBOARDING_COPY.flow014,
  persona: ONBOARDING_COPY.flow015,
  intro: ONBOARDING_COPY.flow016,
  import: ONBOARDING_COPY.flow017,
};

function todayLabel(iso: string, t: (copy: Copy) => string): string {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return "";
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  const monthsEn = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return t({ zh: `${year}年${month}月${day}日 · ${weekday.zh}`, en: `${weekday.en}, ${monthsEn[month - 1]} ${day}, ${year}`, ja: `${year}年${month}月${day}日 · ${t(weekday)}` });
}

function basicFromPayload(payload: ProfilePayload): BasicDraft {
  const profile = payload.profile;
  if (!profile) return EMPTY_BASIC;
  return {
    birthDate: profile.birthDate ?? "",
    company: profile.organization ?? "",
    name: profile.displayName ?? "",
    primaryIndustryId: isIndustryIdCode(profile.primaryIndustryId) ? profile.primaryIndustryId : "",
    secondaryIndustryId: (profile.secondaryIndustryId as SecondaryIndustryIdCode | undefined) ?? "",
    title: profile.role ?? "",
  };
}

export function OnboardingFlow({ actorKey, cardScanAvailable, next, todayIso }: OnboardingFlowProps) {
  const { language, setLanguage, t: siteText } = useOrbitLanguage();
  const t = (copy: Copy) => siteText(copy);
  const lang = language;
  const [view, setView] = useState<OnboardingView>("welcome");
  const [scrolled, setScrolled] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [expectedUpdatedAt, setExpectedUpdatedAt] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);
  const [basic, setBasic] = useState<BasicDraft>(EMPTY_BASIC);
  const [goalText, setGoalText] = useState("");
  const [goalChoices, setGoalChoices] = useState<string[]>([]);
  const [horizon, setHorizon] = useState<GoalHorizon | "">("");
  const [savedGoal, setSavedGoal] = useState("");
  const [offer, setOffer] = useState<string[]>([]);
  const [seek, setSeek] = useState<string[]>([]);
  const [topics, setTopics] = useState<string[]>([]);
  const [bio, setBio] = useState("");
  const [headline, setHeadline] = useState("");
  const [savedIntro, setSavedIntro] = useState(false);
  const [introStatus, setIntroStatus] = useState<IntroStatus>("idle");
  const [introErrorCode, setIntroErrorCode] = useState<"INTRO_LIMIT_REACHED" | "SAMPLE_READ_ONLY" | null>(null);
  const [introRegenerations, setIntroRegenerations] = useState(0);
  // 「我在寻找」✦ 建议由 AI 按已保存的目标与资料挑选；forGoal 记录它对应哪一版目标，目标变了才重新请求。
  const [seekSuggest, setSeekSuggest] = useState<{ forGoal: string; labels: string[]; status: "idle" | "loading" | "ready" | "error" }>({ forGoal: "", labels: [], status: "idle" });
  const [saving, setSaving] = useState(false);
  const progressRef = useRef<ProfileOnboardingProgressContract | null>(null);
  const initMutationRef = useRef<string | null>(null);
  const pendingConfirmRef = useRef<ProfileOnboardingProgressCommandContract | null>(null);
  const pendingFieldsRef = useRef<string | null>(null);
  const finishMutationRef = useRef<string | null>(null);
  const introActionKeyRef = useRef<string | null>(null);
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(false);
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const stepIndex = ONBOARDING_STEPS.indexOf(view as OnboardingStep);
  const isStep = stepIndex >= 0;
  const name = basic.name.trim();
  const initial = name ? Array.from(name)[0]!.toUpperCase() : t(ONBOARDING_COPY.flow018);
  const effectiveHorizon = horizon;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  // 读取已保存资料 + 本地草稿（目标正文 / 期限 / 当前步骤）。
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [payload, flow] = await Promise.all([fetchProfile(), fetchOnboardingProgress()]);
        if (!active) return;
        progressRef.current = flow;
        const profile = payload.profile;
        setBasic(basicFromPayload(payload));
        setExpectedUpdatedAt(profile?.updatedAt ?? null);
        setComplete(payload.onboarding?.status === "complete");
        setSavedGoal(profile?.relationshipGoal ?? "");
        setOffer([...(profile?.offering ?? [])]);
        setSeek([...(profile?.seeking ?? [])]);
        setTopics([...(profile?.topics ?? [])]);
        setBio(profile?.bio ?? "");
        setHeadline(profile?.headline ?? "");
        setSavedIntro(Boolean(profile?.bio?.trim() || profile?.headline?.trim()));
        const draft = readOnboardingDraft(actorKey);
        if (draft) {
          setGoalText(draft.goalText);
          setGoalChoices(draft.goalChoices ?? []);
          setHorizon(draft.horizon);
          setIntroRegenerations(draft.introRegenerations);
          if (!flow) setView(draft.view);
        }
        if ((flow?.lastConfirmedScreen ?? 0) >= 2 || !draft?.goalText.trim()) {
          const restored = parseProfileOnboardingGoal(profile?.relationshipGoal ?? "");
          setGoalText(restored.focus);
          setGoalChoices(restored.choices);
        }
        if (flow?.currentScreen) setView(ONBOARDING_STEPS[flow.currentScreen - 1]!);
        if (flow?.finishedAt) window.location.assign(next);
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
    writeOnboardingDraft(actorKey, { goalText, goalChoices, horizon, introRegenerations, view });
  }, [actorKey, goalText, goalChoices, horizon, introRegenerations, loaded, view]);

  function flash(text: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(text);
    toastTimer.current = setTimeout(() => setToast(""), 2600);
  }

  function go(nextView: OnboardingView) {
    setError("");
    setView(nextView);
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  }

  // 中途离开（跳过、先进入 Orbit）保留草稿，回来还能接着填；只有走完最后一步才清除。
  function leaveTo(href: string) {
    window.location.assign(href);
  }

  async function finish() {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      await ensureProgress();
      if ((progressRef.current?.lastConfirmedScreen ?? 0) < 5) await confirmScreen(5);
      const flow = progressRef.current!;
      if (!flow.finishedAt) {
        finishMutationRef.current ??= crypto.randomUUID();
        progressRef.current = await updateOnboardingProgress({ action: "finish", expectedRevision: flow.revision, mutationId: finishMutationRef.current });
      }
      clearOnboardingDraft(actorKey);
      window.location.assign(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t({ zh: "无法完成设置，请重试。", en: "Could not finish onboarding. Please retry.", ja: "設定を完了できませんでした。再試行してください。" }));
    } finally {
      setSaving(false);
    }
  }

  const progress: PreviewProgress = {
    profileDone: complete,
    goalsDone: Boolean(savedGoal.trim()),
    personaDone: offer.length > 0 || seek.length > 0,
    introDone: savedIntro,
  };

  // ── 校验 ──
  const industryValid = Boolean(basic.primaryIndustryId && basic.secondaryIndustryId)
    && validateIndustrySelection({ primaryIndustryId: basic.primaryIndustryId, secondaryIndustryId: basic.secondaryIndustryId }).valid;
  const birthValid = !basic.birthDate || isValidProfileBirthDate(basic.birthDate, todayIso);
  const profileValid = Boolean(name) && industryValid && birthValid;
  const bioCount = bioCounter(bio);
  const introValid = !bioCount.over && visibleCharacterCount(headline.trim()) <= HEADLINE_LIMIT;

  async function ensureProgress(): Promise<ProfileOnboardingProgressContract> {
    if (progressRef.current) return progressRef.current;
    initMutationRef.current ??= crypto.randomUUID();
    const flow = await updateOnboardingProgress({ action: "initialize", expectedRevision: null, mutationId: initMutationRef.current });
    progressRef.current = flow;
    return flow;
  }

  async function confirmScreen(screen: 1 | 2 | 3 | 4 | 5): Promise<void> {
    const flow = await ensureProgress();
    if (flow.lastConfirmedScreen >= screen) { pendingConfirmRef.current = null; pendingFieldsRef.current = null; return; }
    if (!pendingConfirmRef.current || pendingConfirmRef.current.action !== "confirm" || pendingConfirmRef.current.screen !== screen) {
      pendingConfirmRef.current = { action: "confirm", screen, expectedRevision: flow.revision, mutationId: crypto.randomUUID() };
    }
    try {
      progressRef.current = await updateOnboardingProgress(pendingConfirmRef.current);
      pendingConfirmRef.current = null;
      pendingFieldsRef.current = null;
    } catch (error) {
      const latest = await fetchOnboardingProgress().catch(() => null);
      if (latest && latest.lastConfirmedScreen >= screen) {
        progressRef.current = latest;
        pendingConfirmRef.current = null;
        pendingFieldsRef.current = null;
        return;
      }
      throw error;
    }
  }

  async function save(screen: 1 | 2 | 3 | 4, fields: ProfileFields): Promise<boolean> {
    setSaving(true);
    setError("");
    try {
      await ensureProgress(); // Must persist the flow before the first profile PUT.
      const fingerprint = JSON.stringify(fields);
      const pendingScreen = pendingConfirmRef.current?.action === "confirm" ? pendingConfirmRef.current.screen : null;
      if (pendingScreen && (pendingScreen !== screen || pendingFieldsRef.current !== fingerprint)) await confirmScreen(pendingScreen);
      const samePending = pendingConfirmRef.current?.action === "confirm" && pendingConfirmRef.current.screen === screen && pendingFieldsRef.current === fingerprint;
      if (!samePending) {
        const payload = await saveProfileFields(fields, expectedUpdatedAt);
        setExpectedUpdatedAt(payload.profile?.updatedAt ?? null);
        setComplete(payload.onboarding?.status === "complete");
        pendingFieldsRef.current = fingerprint;
      }
      await confirmScreen(screen);
      return true;
    } catch (caught) {
      const conflict = caught instanceof Error && "code" in caught && caught.code === "PROFILE_VERSION_CONFLICT";
      setError(conflict
        ? t({ zh: "资料已在另一处更新。请刷新并核对后再保存。", en: "Your profile changed elsewhere. Refresh and review it before saving.", ja: "別の画面でプロフィールが更新されました。再読み込みして内容を確認してください。" })
        : caught instanceof Error && caught.message
          ? t({ zh: `保存失败：${caught.message}`, en: `Save failed: ${caught.message}`, ja: `保存できませんでした：${caught.message}` })
          : t(ONBOARDING_COPY.flow020));
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function onNext() {
    if (saving) return;
    if (view === "profile") {
      if (!profileValid) return;
      const ok = await save(1, {
        birthDate: basic.birthDate || null,
        displayName: name,
        organization: basic.company.trim(),
        primaryIndustryId: basic.primaryIndustryId as IndustryIdCode,
        role: basic.title.trim(),
        secondaryIndustryId: basic.secondaryIndustryId as SecondaryIndustryIdCode,
      });
      if (ok) go("goals");
      return;
    }
    if (view === "goals") {
      if (!goalText.trim() && !goalChoices.length) return;
      const relationshipGoal = composeProfileOnboardingGoal(goalChoices, goalText, lang);
      const ok = await save(2, { relationshipGoal });
      if (ok) {
        setSavedGoal(relationshipGoal);
        go("persona");
      }
      return;
    }
    if (view === "persona") {
      const ok = await save(3, { offering: offer, seeking: seek, topics });
      if (ok) go("intro");
      return;
    }
    if (view === "intro") {
      if (!introValid || introStatus === "generating") return;
      const ok = await save(4, { bio: bio.trim(), headline: headline.trim() });
      if (ok) {
        setSavedIntro(Boolean(bio.trim() || headline.trim()));
        go("import");
      }
    }
  }

  function onBack() {
    if (stepIndex <= 0) go("welcome");
    else go(ONBOARDING_STEPS[stepIndex - 1]!);
  }

  // ── AI 介绍：进入这一步且还没有介绍时自动起草；用户可重新生成、可直接改 ──
  // kind: auto = 进入本步自动生成；retry = 失败后重试；这两种不计次。regenerate = 「换一版」，成功才计次，上限 2 次。
  async function generateIntro(kind: "auto" | "retry" | "regenerate") {
    if (introStatus === "generating") return;
    if (kind === "regenerate" && introRegenerations >= INTRO_REGENERATE_LIMIT) return;
    const previous = { bio, headline, status: introStatus };
    setIntroStatus("generating");
    setIntroErrorCode(null);
    try {
      if (kind === "regenerate" || (kind === "retry" && !introActionKeyRef.current)) introActionKeyRef.current = crypto.randomUUID();
      introActionKeyRef.current ??= `web:onboarding:intro:first:${actorKey}:${expectedUpdatedAt ?? "new"}`;
      const draft = await generateIntroDraft(lang, introActionKeyRef.current);
      introActionKeyRef.current = null;
      setHeadline(draft.headline);
      setBio(draft.bio);
      setIntroStatus("ready");
      if (kind === "regenerate") setIntroRegenerations(count => count + 1);
    } catch (caught) {
      if (caught instanceof Error && "code" in caught && caught.code) introActionKeyRef.current = null;
      const code = caught instanceof Error && "code" in caught ? caught.code : null;
      if (kind === "regenerate" && (previous.bio.trim() || previous.headline.trim())) {
        // 换一版失败：保留上一版，不扣次数。
        setIntroStatus(previous.status === "error" ? "ready" : previous.status);
        flash(t(ONBOARDING_COPY.flow021));
        return;
      }
      setIntroStatus("error");
      setIntroErrorCode(code === "INTRO_LIMIT_REACHED" || code === "SAMPLE_READ_ONLY" ? code : null);
    }
  }

  useEffect(() => {
    if (view === "intro" && loaded && introStatus === "idle" && !bio.trim() && !headline.trim()) {
      void generateIntro("auto");
    }
    // generateIntro 只依赖当前状态；按进入步骤触发。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, loaded]);

  async function onCardFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || scanning) return;
    setScanning(true);
    setError("");
    try {
      const card = await scanOwnBusinessCard(file);
      setBasic(current => ({
        ...current,
        company: card.company || current.company,
        name: card.name || current.name,
        title: card.title || current.title,
      }));
      flash(t(ONBOARDING_COPY.flow022));
    } catch {
      setError(t(ONBOARDING_COPY.flow023));
    } finally {
      setScanning(false);
    }
  }

  // ── 渲染 ──
  const previewProps = {
    complete,
    firstGoal: goalText.trim(),
    focus: goalText.trim(),
    initial,
    name,
    onEnter: () => leaveTo(next),
    onGo: (step: OnboardingStep) => go(step),
    progress,
    todayLabel: todayLabel(todayIso, t),
  };

  const nextDisabled = saving || !loaded
    || (view === "profile" && !profileValid)
    || (view === "goals" && !goalText.trim() && !goalChoices.length)
    || (view === "intro" && (!introValid || introStatus === "generating"));

  const nextLabel = saving ? t(ONBOARDING_COPY.flow024) : t(ONBOARDING_COPY.flow025);

  return (
    <>
      <style>{ONBOARDING_STYLES}</style>
      <header className={`ob-header${scrolled ? " ob-header-scrolled" : ""}`}>
        <div className="ob-header-inner">
          <button className="btn ob-logo" onClick={() => go("welcome")} type="button"><span className="ob-logo-mark" aria-hidden>O</span>Orbit</button>
          {isStep ? <nav className="ob-stage-nav" aria-label={t({ zh: "设置进度", en: "Setup progress", ja: "設定の進捗" })}>
            {ONBOARDING_STEPS.map((step, index) => <span aria-current={step === view ? "step" : undefined} className={`ob-stage-item${step === view ? " ob-stage-current" : ""}`} key={step}>
              <span className="ob-stage-number">{index + 1}</span><span>{t(STEP_NAV_TITLES[step])}</span>
            </span>)}
          </nav> : <nav className="ob-nav" aria-label={t(ONBOARDING_COPY.flow026)}>
            <button className={`btn ob-nav-link${view === "home" ? " ob-nav-on" : ""}`} onClick={() => go("home")} type="button">iOrbit</button>
            <button className="btn ob-nav-link" onClick={() => go("home")} type="button">{t(ONBOARDING_COPY.flow027)}</button>
            <button className={`btn ob-nav-link${view === "network" ? " ob-nav-on" : ""}`} onClick={() => go("network")} type="button">{t(ONBOARDING_COPY.flow028)}</button>
          </nav>}
          <div className="ob-header-right">
            <button className="btn ob-lang" onClick={() => setLanguage(language === "zh" ? "en" : language === "en" ? "ja" : "zh")} type="button">
              {t({ zh: "中文", en: "English", ja: "日本語" })} <span className="ob-caret" aria-hidden>⌄</span>
            </button>
            {isStep ? <button className="btn ob-header-skip" onClick={() => (complete ? leaveTo(next) : go("home"))} type="button">{t({ zh: "稍后设置", en: "Set up later", ja: "あとで設定する" })}</button> : null}
            <button aria-label={t(ONBOARDING_COPY.flow029)} className="btn ob-avatar-sm" onClick={() => go("profile")} type="button">{initial}</button>
          </div>
        </div>
      </header>

      <main className="ob-main" data-onboarding-view={view}>
        {loadError ? <div className="ob-notice ob-notice-error" role="alert">{loadError}</div> : null}

        {view === "welcome" ? (
          <Welcome onStart={() => go("profile")} onBrowse={() => go("home")} t={t} />
        ) : null}

        {isStep ? (
          <div className="ob-steps">
            <div className="ob-progress-row">
              <span className="ob-progress">
                <span>{t({ zh: `设置你的 Orbit · 第 ${stepIndex + 1} 步，共 ${ONBOARDING_STEPS.length} 步`, en: `Set up Orbit · Step ${stepIndex + 1} of ${ONBOARDING_STEPS.length}`, ja: `Orbitの設定 · ${stepIndex + 1} / ${ONBOARDING_STEPS.length}` })}</span>
                <span className="ob-bars" aria-hidden>
                  {ONBOARDING_STEPS.map((step, index) => <span className={`ob-bar${index <= stepIndex ? " ob-bar-on" : ""}`} key={step} />)}
                </span>
              </span>
              <button className="btn ob-link-plain" onClick={() => (complete ? leaveTo(next) : go("home"))} type="button">
                {complete ? t(ONBOARDING_COPY.flow030) : t(ONBOARDING_COPY.flow031)}
              </button>
            </div>

            <div className={`ob-grid${view === "import" ? " ob-grid-wide" : ""}`}>
              <section className="ob-card" aria-busy={!loaded || undefined}>
                {view === "profile" ? (
                  <ProfileStep
                    basic={basic}
                    cardScanAvailable={cardScanAvailable}
                    disabled={!loaded || saving}
                    fileRef={fileRef}
                    language={language}
                    onCardFile={onCardFile}
                    scanning={scanning}
                    setBasic={setBasic}
                    showBirthError={Boolean(basic.birthDate) && !birthValid}
                    t={t}
                    todayIso={todayIso}
                  />
                ) : null}
                {view === "goals" ? (
                  <GoalsStep
                    goals={goalChoices}
                    setGoals={setGoalChoices}
                    setGoalText={setGoalText}
                    t={t}
                    text={goalText}
                  />
                ) : null}
                {view === "persona" ? (
                  <PersonaStep offer={offer} suggestStatus={seekSuggest.status} suggested={seekOptionsFromLabels(seekSuggest.labels)} seek={seek} setOffer={setOffer} setSeek={setSeek} setTopics={setTopics} t={t} topics={topics} />
                ) : null}
                {view === "intro" ? (
                  <IntroStep
                    bio={bio}
                    bioCount={bioCount}
                    errorCode={introErrorCode}
                    headline={headline}
                    onRegenerate={() => void generateIntro(introStatus === "error" ? "retry" : "regenerate")}
                    regenerationsLeft={INTRO_REGENERATE_LIMIT - introRegenerations}
                    setBio={setBio}
                    setHeadline={setHeadline}
                    status={introStatus}
                    t={t}
                  />
                ) : null}
                {view === "import" ? (
                  <div className="ob-stack" data-screen-label={ONBOARDING_SCREEN_LABELS.import}>
                    <StepHead title={t(ONBOARDING_COPY.flow032)} sub={t(ONBOARDING_COPY.flow033)} />
                    <div className="ob-import-links">
                      {cardScanAvailable ? <a className="btn ob-btn-dark" href="/app/contacts/new/scan">{t(ONBOARDING_COPY.flow034)}</a> : null}
                      <a className="btn ob-btn-ghost" href="/app/contacts/new?method=csv">{t(ONBOARDING_COPY.flow035)}</a>
                      <p>{t(ONBOARDING_COPY.flow036)}</p>
                    </div>
                  </div>
                ) : null}

                {error ? <div className="ob-notice ob-notice-error" role="alert">{error}</div> : null}

                <div className="ob-footer">
                  <button className="btn ob-btn-ghost" disabled={saving} onClick={onBack} type="button">{t(ONBOARDING_COPY.flow037)}</button>
                  <span className="ob-footer-right">
                    {view === "import" ? (
                      <span className="ob-finish">
                        <button className="btn ob-btn-dark" disabled={saving} onClick={() => void finish()} type="button">
                          {t(ONBOARDING_COPY.flow038)}
                        </button>
                      </span>
                    ) : (
                      <button aria-busy={saving || undefined} className="btn ob-btn-dark" disabled={nextDisabled} onClick={() => void onNext()} type="button">{nextLabel}</button>
                    )}
                  </span>
                </div>
              </section>

              {view === "import" ? null : <UnderstandingAside
                basic={basic}
                goalText={goalText}
                headline={headline}
                horizon={effectiveHorizon}
                initial={initial}
                language={language}
                addedCount={0}
                offer={offer}
                savedGoal={savedGoal}
                seek={seek}
                t={t}
                view={view as OnboardingStep}
              />}
            </div>
          </div>
        ) : null}

        {view === "home" ? <OnboardingHomePreview {...previewProps} /> : null}
        {view === "network" ? <OnboardingNetworkPreview {...previewProps} /> : null}
      </main>

      {toast ? <div className="ob-toast" role="status">{toast}</div> : null}
    </>
  );
}

type T = (copy: Copy) => string;

function Welcome({ onBrowse, onStart, t }: { onBrowse: () => void; onStart: () => void; t: T }) {
  return (
    <section className="ob-welcome" data-screen-label={ONBOARDING_SCREEN_LABELS.welcome}>
      <div className="ob-col">
        <span className="ob-kicker">{t(ONBOARDING_COPY.flow039)}</span>
        <h1 className="ob-h1">{t(ONBOARDING_COPY.flow040)}<br />{t(ONBOARDING_COPY.flow041)}<br />{t(ONBOARDING_COPY.flow042)}</h1>
        <p className="ob-lead">{t(ONBOARDING_COPY.flow043)}</p>
        <div className="ob-steplist">
          {ONBOARDING_STEPS.map((step, index) => (
            <div className="ob-steplist-row" key={step}>
              <span className="ob-steplist-num">{String(index + 1).padStart(2, "0")}</span>
              <span className="ob-steplist-label">{t(STEP_TITLES[step])}</span>
              <span className="ob-steplist-time">{t(STEP_TIMES[step])}</span>
            </div>
          ))}
        </div>
        <div className="ob-actions">
          <button className="btn ob-btn-dark ob-btn-dark-lg" onClick={onStart} type="button">{t(ONBOARDING_COPY.flow044)}</button>
          <button className="btn ob-link-under" onClick={onBrowse} type="button">{t(ONBOARDING_COPY.flow045)}</button>
        </div>
      </div>
      <div className="ob-panel">
        <div className="ob-panel-card">
          <div className="ob-iorbit-head">
            <strong>{t(ONBOARDING_COPY.flow046)}</strong>
            <span className="ob-spark ob-spark-lg" aria-hidden>✦</span>
            <span className="ob-vbar" aria-hidden />
            <span className="ob-muted">{t(ONBOARDING_COPY.flow047)}</span>
          </div>
          <div className="ob-fakeask" aria-hidden>
            <span className="ob-fakeask-text">{t(ONBOARDING_COPY.flow048)}</span>
            <span className="ob-fakeask-send">↑</span>
          </div>
          <div className="ob-hr" />
          <span className="ob-gain-lead">{t(ONBOARDING_COPY.flow049)}</span>
          <div>
            <div className="ob-gain">
              <span className="ob-gain-icon" aria-hidden><small>{t(ONBOARDING_COPY.flow050)}</small><strong>✧</strong></span>
              <span className="ob-gain-body"><strong>{t(ONBOARDING_COPY.flow051)}</strong><span className="ob-skeleton" style={{ width: "70%" }} /></span>
              <span className="ob-pill">{t(ONBOARDING_COPY.flow052)}</span>
            </div>
            <div className="ob-gain">
              <span className="ob-gain-pair" aria-hidden><span>{ONBOARDING_PREVIEW_PEOPLE[0].ch}</span><span>{ONBOARDING_PREVIEW_PEOPLE[1].ch}</span></span>
              <span className="ob-gain-body"><strong>{t(ONBOARDING_COPY.flow053)}</strong><span className="ob-skeleton" style={{ width: "55%" }} /></span>
              <span className="ob-pill">{t(ONBOARDING_COPY.flow054)}</span>
            </div>
            <div className="ob-gain">
              <span className="ob-gain-icon ob-gain-quote" aria-hidden>“</span>
              <span className="ob-gain-body"><strong>{t(ONBOARDING_COPY.flow055)}</strong><span className="ob-skeleton" style={{ width: "62%" }} /></span>
              <span className="ob-pill">{t(ONBOARDING_COPY.flow056)}</span>
            </div>
          </div>
          <div className="ob-tip">
            <span className="ob-spark" aria-hidden>✦</span>
            <span>{t(ONBOARDING_COPY.flow057)}</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function Field({ children, label, required, t }: { children: ReactNode; label: Copy; required?: boolean; t: T }) {
  return (
    <label className="ob-field">
      <span className="ob-field-label">{t(label)}{required ? <span className="ob-required">{t(ONBOARDING_COPY.flow058)}</span> : null}</span>
      {children}
    </label>
  );
}

function StepHead({ sub, title }: { sub: string; title: string }) {
  return (
    <div className="ob-head">
      <h2 className="ob-h2">{title}</h2>
      <p className="ob-p">{sub}</p>
    </div>
  );
}

function ProfileStep({
  basic, cardScanAvailable, disabled, fileRef, language, onCardFile, scanning, setBasic, showBirthError, t, todayIso,
}: {
  basic: BasicDraft;
  cardScanAvailable: boolean;
  disabled: boolean;
  fileRef: RefObject<HTMLInputElement | null>;
  language: "zh" | "en" | "ja";
  onCardFile: (event: ChangeEvent<HTMLInputElement>) => void;
  scanning: boolean;
  setBasic: (update: (current: BasicDraft) => BasicDraft) => void;
  showBirthError: boolean;
  t: T;
  todayIso: string;
}) {
  const set = (key: keyof BasicDraft) => (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setBasic(current => ({ ...current, [key]: value }));
  };
  return (
    <div className="ob-stack" data-screen-label={ONBOARDING_SCREEN_LABELS.basics}>
      <StepHead title={t(ONBOARDING_COPY.flow059)} sub={t(ONBOARDING_COPY.flow060)} />
      {cardScanAvailable ? (
        <>
          <button className="btn ob-autofill" disabled={disabled || scanning} onClick={() => fileRef.current?.click()} type="button">
            <span className="ob-spark" aria-hidden>✦</span>
            {scanning ? t(ONBOARDING_COPY.flow061) : t(ONBOARDING_COPY.flow062)}
          </button>
          <input accept="image/*,.heic,.heif" className="ob-sr" onChange={onCardFile} ref={fileRef} tabIndex={-1} type="file" aria-hidden />
        </>
      ) : null}
      <div className="ob-fields">
        <Field label={ONBOARDING_COPY.flow063} required t={t}>
          <input className="ob-input" disabled={disabled} maxLength={60} onChange={set("name")} placeholder={t(ONBOARDING_COPY.flow064)} value={basic.name} />
        </Field>
        <Field label={ONBOARDING_COPY.flow065} t={t}>
          <input className="ob-input" disabled={disabled} maxLength={80} onChange={set("company")} placeholder={t(ONBOARDING_COPY.flow066)} value={basic.company} />
        </Field>
        <Field label={ONBOARDING_COPY.flow067} t={t}>
          <input className="ob-input" disabled={disabled} maxLength={80} onChange={set("title")} placeholder={t(ONBOARDING_COPY.flow068)} value={basic.title} />
        </Field>
        <Field label={{ zh: "生日（可选）", en: "Birthday (optional)", ja: "生年月日（任意）" }} t={t}>
          <input className="ob-input" disabled={disabled} max={todayIso} onChange={set("birthDate")} type="date" value={basic.birthDate} />
        </Field>
        <Field label={ONBOARDING_COPY.flow069} required t={t}>
          <select
            className="ob-input"
            disabled={disabled}
            onChange={event => {
              const value = event.target.value;
              setBasic(current => ({ ...current, primaryIndustryId: (value || "") as IndustryIdCode | "", secondaryIndustryId: "" }));
            }}
            value={basic.primaryIndustryId}
          >
            <option value="">{t(ONBOARDING_COPY.flow070)}</option>
            {INDUSTRY_CATALOG.map(item => <option key={item.id} value={item.id}>{industryLabel(item.id, language)}</option>)}
          </select>
        </Field>
        <Field label={ONBOARDING_COPY.flow071} required t={t}>
          <select
            className="ob-input"
            disabled={disabled || !basic.primaryIndustryId}
            onChange={event => {
              const value = event.target.value;
              setBasic(current => ({ ...current, secondaryIndustryId: (value || "") as SecondaryIndustryIdCode | "" }));
            }}
            value={basic.secondaryIndustryId}
          >
            <option value="">{basic.primaryIndustryId ? t(ONBOARDING_COPY.flow072) : t(ONBOARDING_COPY.flow073)}</option>
            {(basic.primaryIndustryId ? listSecondaryIndustries(basic.primaryIndustryId) : []).map(item => (
              <option key={item.id} value={item.id}>{secondaryIndustryLabel(item.id, language)}</option>
            ))}
          </select>
        </Field>
      </div>
      {showBirthError ? <div className="ob-notice ob-notice-warning">{t(ONBOARDING_COPY.flow074)}</div> : null}
      <span className="ob-label-note ob-privacy">{t(ONBOARDING_COPY.flow075)}</span>
    </div>
  );
}

function ChipGroup({
  customPlaceholder, limit, options, setValues, suggested, t, title, values,
}: {
  customPlaceholder: Copy;
  limit?: number;
  options: readonly Copy[];
  setValues: (update: (current: string[]) => string[]) => void;
  suggested?: readonly Copy[];
  t: T;
  title: ReactNode;
  values: readonly string[];
}) {
  const [custom, setCustom] = useState("");
  const full = limit !== undefined && values.length >= limit;
  const knownValues = new Set(options.flatMap(option => [option.zh, option.en, option.ja]));
  const customValues = values.filter(value => !knownValues.has(value));
  function add() {
    setValues(current => addCustomValue(current, custom, limit));
    setCustom("");
  }
  return (
    <div className="ob-group">
      <span className="ob-label">{title}{limit ? <span className="ob-label-note">{t({ zh: `${values.length}/${limit}`, en: `${values.length}/${limit}`, ja: `${values.length}/${limit}` })}</span> : null}</span>
      <div className="ob-chips">
        {options.map(option => {
          const selected = values.find(value => optionMatches(option, value));
          const isSuggested = Boolean(suggested?.some(item => item.zh === option.zh));
          return (
            <button
              aria-pressed={Boolean(selected)}
              className={`btn ob-chip${selected ? " ob-chip-on" : isSuggested ? " ob-chip-suggest" : ""}`}
              disabled={!selected && full}
              key={option.zh}
              onClick={() => setValues(current => (selected ? current.filter(value => value !== selected) : toggleValue(current, t(option), limit)))}
              type="button"
            >
              {isSuggested ? <span className="ob-chip-mark" aria-hidden>✦</span> : null}
              {t(option)}
            </button>
          );
        })}
        {customValues.map(value => (
          <button aria-pressed className="btn ob-chip ob-chip-on" key={value} onClick={() => setValues(current => current.filter(item => item !== value))} type="button">
            {value} <span aria-hidden>×</span>
          </button>
        ))}
        <span className="ob-chip-add">
          <input
            aria-label={t(customPlaceholder)}
            disabled={full}
            maxLength={24}
            onChange={event => setCustom(event.target.value)}
            onKeyDown={event => {
              if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                event.preventDefault();
                add();
              }
            }}
            placeholder={t(customPlaceholder)}
            value={custom}
          />
          <button className="btn ob-chip-add-btn" disabled={full || !custom.trim()} onClick={add} type="button">{t(ONBOARDING_COPY.flow076)}</button>
        </span>
      </div>
    </div>
  );
}

function GoalsStep({ goals, setGoals, setGoalText, t, text }: {
  goals: string[];
  setGoals: (value: string[]) => void;
  setGoalText: (value: string) => void;
  t: T;
  text: string;
}) {
  return (
    <div className="ob-stack" data-screen-label={ONBOARDING_SCREEN_LABELS.goals}>
      <StepHead title={t(ONBOARDING_COPY.flow077)} sub={t(ONBOARDING_COPY.flow078)} />
      <div className="ob-group"><span className="ob-label">{t(ONBOARDING_COPY.flow079)} <span className="ob-label-note">{goals.length} / 2</span></span>
        <div className="ob-chips">{PROFILE_ONBOARDING_GOALS.map((option) => {
          const selected = goals.find((value) => value === option.zh || value === option.en || value === option.ja);
          return <button aria-pressed={Boolean(selected)} className={`btn ob-chip${selected ? " ob-chip-on" : ""}`} disabled={!selected && goals.length >= 2} key={option.id}
            onClick={() => setGoals(selected ? goals.filter((value) => value !== selected) : [...goals, t(option)])} type="button">{selected ? `${goals.indexOf(selected) + 1}. ` : ""}{t(option)}</button>;
        })}</div>
      </div>
      <label className="ob-field"><span className="ob-field-label">{t(ONBOARDING_COPY.flow080)}</span>
        <textarea className="ob-input" maxLength={80} onChange={(event) => setGoalText(event.target.value)} rows={3} value={text} />
      </label>
      <p className="ob-label-note">{t(ONBOARDING_COPY.flow081)}</p>
    </div>
  );
}

function PersonaStep({
  offer, seek, setOffer, setSeek, setTopics, suggestStatus, suggested, t, topics,
}: {
  offer: string[];
  seek: string[];
  setOffer: (update: (current: string[]) => string[]) => void;
  setSeek: (update: (current: string[]) => string[]) => void;
  setTopics: (update: (current: string[]) => string[]) => void;
  suggestStatus: "idle" | "loading" | "ready" | "error";
  suggested: Copy[];
  t: T;
  topics: string[];
}) {
  // 建议项排在前面，便于一眼看到。
  const seekOptions = [...suggested, ...SEEK_OPTIONS.filter(option => !suggested.some(item => item.zh === option.zh))];
  return (
    <div className="ob-stack" data-screen-label={ONBOARDING_SCREEN_LABELS.persona}>
      <StepHead title={t(ONBOARDING_COPY.flow082)} sub={t(ONBOARDING_COPY.flow083)} />
      <ChipGroup
        customPlaceholder={ONBOARDING_COPY.flow084}
        limit={OFFER_LIMIT}
        options={OFFER_OPTIONS}
        setValues={setOffer}
        t={t}
        title={t(ONBOARDING_COPY.flow085)}
        values={offer}
      />
      <ChipGroup
        customPlaceholder={ONBOARDING_COPY.flow086}
        limit={SEEK_LIMIT}
        options={seekOptions}
        setValues={setSeek}
        suggested={suggested}
        t={t}
        title={<>{t(ONBOARDING_COPY.flow087)}{suggestStatus === "loading"
          ? <span className="ob-label-note ob-suggest-loading">{t(ONBOARDING_COPY.flow088)}</span>
          : suggested.length
            ? <span className="ob-label-note">{t(ONBOARDING_COPY.flow089)}</span>
            : suggestStatus === "error"
              ? <span className="ob-label-note">{t(ONBOARDING_COPY.flow090)}</span>
              : null}</>}
        values={seek}
      />
      <ChipGroup
        customPlaceholder={ONBOARDING_COPY.flow091}
        limit={TOPIC_LIMIT}
        options={TOPIC_OPTIONS}
        setValues={setTopics}
        t={t}
        title={<>{t(ONBOARDING_COPY.flow092)}<span className="ob-label-note">{t(ONBOARDING_COPY.flow093)}</span></>}
        values={topics}
      />
    </div>
  );
}

function IntroStep({
  bio, bioCount, errorCode, headline, onRegenerate, regenerationsLeft, setBio, setHeadline, status, t,
}: {
  bio: string;
  bioCount: { count: number; limit: number; over: boolean };
  errorCode: "INTRO_LIMIT_REACHED" | "SAMPLE_READ_ONLY" | null;
  headline: string;
  onRegenerate: () => void;
  regenerationsLeft: number;
  setBio: (value: string) => void;
  setHeadline: (value: string) => void;
  status: IntroStatus;
  t: T;
}) {
  const generating = status === "generating";
  return (
    <div className="ob-stack" data-screen-label={ONBOARDING_SCREEN_LABELS.intro}>
      <StepHead title={t(ONBOARDING_COPY.flow094)} sub={t(ONBOARDING_COPY.flow095)} />
      <div className="ob-ai-box" aria-live="polite">
        <div className="ob-ai-head">
          <span className="ob-ai-status">
            <span className="ob-spark" aria-hidden>✦</span>
            {generating
              ? t(ONBOARDING_COPY.flow096)
              : status === "error"
                ? t(ONBOARDING_COPY.flow097)
                : t(ONBOARDING_COPY.flow098)}
          </span>
          {status === "error" ? (
            errorCode === "INTRO_LIMIT_REACHED" || errorCode === "SAMPLE_READ_ONLY" ? null
              : <button className="btn ob-btn-soft" onClick={onRegenerate} type="button">{t({ zh: "重试", en: "Retry", ja: "再試行" })}</button>
          ) : (
            <button className="btn ob-btn-soft" disabled={generating || regenerationsLeft <= 0} onClick={onRegenerate} type="button">
              {regenerationsLeft > 0
                ? t({ zh: `↻ 换一版 · 还剩 ${regenerationsLeft} 次`, en: `↻ Try another · ${regenerationsLeft} left`, ja: `↻ 別の案を作る · 残り${regenerationsLeft}回` })
                : t(ONBOARDING_COPY.flow099)}
            </button>
          )}
        </div>
        {status === "error" ? (
          <div className="ob-notice ob-notice-warning">
            {errorCode === "INTRO_LIMIT_REACHED"
              ? t({ zh: "介绍草稿的 3 次生成额度已用完。请直接在下面写几句。", en: "All three introduction drafts have been used. Write a few lines below instead.", ja: "自己紹介の生成は3回までです。下に直接入力してください。" })
              : errorCode === "SAMPLE_READ_ONLY"
                ? t({ zh: "示例资料不能生成介绍。请在真实资料中填写。", en: "Sample data is read only. Write your introduction in your own profile.", ja: "サンプルデータは編集できません。自分のプロフィールで入力してください。" })
                : t({ zh: "可以点「重试」再生成一次，或直接在下面写几句。", en: "Retry, or write a couple of lines below.", ja: "再試行するか、下に直接入力してください。" })}
          </div>
        ) : null}
        {generating ? (
          <div className="ob-ai-loading" aria-hidden>
            <span className="ob-skeleton" style={{ width: "58%" }} />
            <span className="ob-skeleton" style={{ width: "92%" }} />
            <span className="ob-skeleton" style={{ width: "76%" }} />
          </div>
        ) : (
          <>
            <label className="ob-field">
              <span className="ob-field-label">{t(ONBOARDING_COPY.flow100)}</span>
              <input className="ob-input" maxLength={HEADLINE_LIMIT} onChange={event => setHeadline(event.target.value)} placeholder={t(ONBOARDING_COPY.flow101)} value={headline} />
            </label>
            <label className="ob-field">
              <span className="ob-field-label">{t(ONBOARDING_COPY.flow102)}</span>
              <textarea className="ob-input" onChange={event => setBio(event.target.value)} rows={3} value={bio} />
              <span className={`ob-count${bioCount.over ? " ob-count-over" : ""}`}>{bioCount.count}/{bioCount.limit}</span>
            </label>
          </>
        )}
      </div>
      <div className="ob-tip ob-tip-sm">
        <span className="ob-spark" aria-hidden>✦</span>
        <span>{t(ONBOARDING_COPY.flow103)}</span>
      </div>
    </div>
  );
}

function UnderstandingAside({
  addedCount, basic, goalText, headline, horizon, initial, language, offer, savedGoal, seek, t, view,
}: {
  addedCount: number;
  basic: BasicDraft;
  goalText: string;
  headline: string;
  horizon: GoalHorizon | "";
  initial: string;
  language: "zh" | "en" | "ja";
  offer: string[];
  savedGoal: string;
  seek: string[];
  t: T;
  view: OnboardingStep;
}) {
  const name = basic.name.trim();
  const industry = basic.secondaryIndustryId
    ? secondaryIndustryLabel(basic.secondaryIndustryId, language)
    : basic.primaryIndustryId ? industryLabel(basic.primaryIndustryId, language) : "";
  const line = [basic.title.trim(), basic.company.trim(), industry].filter(Boolean);
  const separator = t({ zh: "、", en: ", ", ja: "、" });
  const goal = goalText.trim();
  return (
    <aside className="ob-aside" aria-label={t(ONBOARDING_COPY.flow104)}>
      <span className="ob-aside-title">
        <span className="ob-aside-heading"><span className="ob-spark" aria-hidden>✦</span><strong>{t(ONBOARDING_COPY.flow105)}</strong></span>
        <span className="ob-aside-sub">{t(ONBOARDING_COPY.flow106)}</span>
      </span>
      <span className="ob-aside-person">
        <span className="ob-avatar" aria-hidden>{initial}</span>
        <span className="ob-aside-who">
          <strong className={name ? "" : "ob-aside-empty"}>{name || t(ONBOARDING_COPY.flow107)}</strong>
          <span className={`ob-aside-line${line.length ? "" : " ob-aside-empty"}`}>{line.length ? line.join(" · ") : t(ONBOARDING_COPY.flow108)}</span>
          {headline.trim() ? <span className="ob-aside-headline">{headline.trim()}</span> : null}
        </span>
      </span>
      <span className="ob-aside-sec">
        <span className="ob-aside-label">{t(ONBOARDING_COPY.flow109)}</span>
        {goal ? <span className="ob-aside-val ob-aside-focus">“{goal}”{horizon ? ` · ${t(horizonOption(horizon).label)}` : ""}</span>
          : savedGoal.trim()
            ? <span className="ob-aside-val">{savedGoal.trim()}</span>
            : <span className="ob-aside-val ob-aside-empty">{t(ONBOARDING_COPY.flow110)}</span>}
      </span>
      <span className="ob-aside-two">
        <span className="ob-aside-sec"><span className="ob-aside-label">{t(ONBOARDING_COPY.flow111)}</span><span className={`ob-aside-val${offer.length ? "" : " ob-aside-empty"}`}>{offer.length ? offer.join(separator) : t(ONBOARDING_COPY.flow112)}</span></span>
        <span className="ob-aside-sec"><span className="ob-aside-label">{t(ONBOARDING_COPY.flow113)}</span><span className={`ob-aside-val${seek.length ? "" : " ob-aside-empty"}`}>{seek.length ? seek.join(separator) : t(ONBOARDING_COPY.flow114)}</span></span>
      </span>
      <span className="ob-aside-foot">
        <span className="ob-aside-label">{t(ONBOARDING_COPY.flow115)}</span>
        <span className="ob-aside-headline">{addedCount ? t({ zh: `已带入 ${addedCount} 位`, en: `${addedCount} added`, ja: `${addedCount}人を追加` }) : view === "import" ? t(ONBOARDING_COPY.flow116) : t(ONBOARDING_COPY.flow117)}</span>
      </span>
      {goal ? (
        <span className="ob-tip ob-tip-sm">
          <span className="ob-spark" aria-hidden>✦</span>
          <span>{t({ zh: `iOrbit 会优先为你留意与「${goal}」相关的活动和人。`, en: `iOrbit will prioritise events and people related to “${goal}”.`, ja: `iOrbitが「${goal}」に合うイベントや人を探します。` })}</span>
        </span>
      ) : null}
    </aside>
  );
}
