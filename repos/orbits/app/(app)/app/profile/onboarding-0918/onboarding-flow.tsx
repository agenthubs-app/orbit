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
import { visibleCharacterCount } from "../profile-save-model";
import {
  fetchProfile,
  generateIntroDraft,
  saveProfileFields,
  confirmContactCard,
  fetchSeekSuggestions,
  OnboardingRequestError,
  scanContactCard,
  scanOwnBusinessCard,
  type ProfileFields,
  type ScannedCard,
} from "./onboarding-client";
import {
  BIO_LIMIT,
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
  clearOnboardingDraft,
  composeRelationshipGoal,
  optionMatches,
  parseRelationshipGoal,
  readOnboardingDraft,
  seekOptionsFromLabels,
  toggleValue,
  writeOnboardingDraft,
  type Copy,
  type OnboardingStep,
  type OnboardingView,
} from "./onboarding-model";
import { OnboardingHomePreview, OnboardingNetworkPreview, type PreviewProgress } from "./onboarding-previews";
import { ONBOARDING_STYLES } from "./onboarding-styles";

export interface OnboardingFlowProps {
  actorKey: string;
  cardScanAvailable: boolean;
  next: string;
  todayIso: string;
}

type IntroStatus = "idle" | "generating" | "ready" | "error";

type CardStage =
  | { kind: "idle"; message?: string }
  | { kind: "scanning" }
  | { kind: "review"; card: ScannedCard; acknowledged: boolean; message: string }
  | { kind: "saving"; card: ScannedCard };

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
  { zh: "星期日", en: "Sunday" }, { zh: "星期一", en: "Monday" }, { zh: "星期二", en: "Tuesday" }, { zh: "星期三", en: "Wednesday" },
  { zh: "星期四", en: "Thursday" }, { zh: "星期五", en: "Friday" }, { zh: "星期六", en: "Saturday" },
];

const STEP_TITLES: Record<OnboardingStep, Copy> = {
  profile: { zh: "告诉我们你是谁", en: "Tell us who you are" },
  goals: { zh: "你最近想推进什么", en: "What you want to move forward" },
  persona: { zh: "你能提供什么、在找什么", en: "What you offer and what you seek" },
  intro: { zh: "iOrbit 帮你写好自我介绍", en: "iOrbit drafts your introduction" },
  import: { zh: "带入已有人脉", en: "Bring in your network" },
};

const STEP_TIMES: Record<OnboardingStep, Copy> = {
  profile: { zh: "30 秒", en: "30 sec" },
  goals: { zh: "30 秒", en: "30 sec" },
  persona: { zh: "30 秒", en: "30 sec" },
  intro: { zh: "AI 生成", en: "AI draft" },
  import: { zh: "可跳过", en: "Optional" },
};

function todayLabel(iso: string, t: (copy: Copy) => string): string {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return "";
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  const monthsEn = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return t({ zh: `${year}年${month}月${day}日 · ${weekday.zh}`, en: `${weekday.en}, ${monthsEn[month - 1]} ${day}, ${year}` });
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
  const { language, setLanguage, t } = useOrbitLanguage();
  const lang = language === "zh" ? "zh" : "en";
  const [view, setView] = useState<OnboardingView>("welcome");
  const [scrolled, setScrolled] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [expectedUpdatedAt, setExpectedUpdatedAt] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);
  const [basic, setBasic] = useState<BasicDraft>(EMPTY_BASIC);
  const [goals, setGoals] = useState<string[]>([]);
  const [focus, setFocus] = useState("");
  const [horizon, setHorizon] = useState("");
  const [savedGoal, setSavedGoal] = useState("");
  const [offer, setOffer] = useState<string[]>([]);
  const [seek, setSeek] = useState<string[]>([]);
  const [topics, setTopics] = useState<string[]>([]);
  const [bio, setBio] = useState("");
  const [headline, setHeadline] = useState("");
  const [savedIntro, setSavedIntro] = useState(false);
  const [introStatus, setIntroStatus] = useState<IntroStatus>("idle");
  const [introError, setIntroError] = useState("");
  const [introRegenerations, setIntroRegenerations] = useState(0);
  const [cardStage, setCardStage] = useState<CardStage>({ kind: "idle" });
  const [addedContacts, setAddedContacts] = useState<string[]>([]);
  // 「我在寻找」✦ 建议由 AI 按已保存的目标与资料挑选；forGoal 记录它对应哪一版目标，目标变了才重新请求。
  const [seekSuggest, setSeekSuggest] = useState<{ forGoal: string; labels: string[]; status: "idle" | "loading" | "ready" | "error" }>({ forGoal: "", labels: [], status: "idle" });
  const contactFileRef = useRef<HTMLInputElement | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(false);
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const stepIndex = ONBOARDING_STEPS.indexOf(view as OnboardingStep);
  const isStep = stepIndex >= 0;
  const name = basic.name.trim();
  const initial = name ? Array.from(name)[0]!.toUpperCase() : t({ zh: "你", en: "Y" });
  const effectiveHorizon = horizon || t(HORIZONS[1]!);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  // 读取已保存资料 + 本地草稿（目标 chip / 时间范围 / 当前步骤）。
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const payload = await fetchProfile();
        if (!active) return;
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
          setGoals(draft.goals);
          setFocus(draft.focus);
          setHorizon(draft.horizon);
          setIntroRegenerations(draft.introRegenerations);
          setView(draft.view);
        } else if (profile?.relationshipGoal?.trim()) {
          // 本地草稿没了（换设备/清缓存）：从已保存的目标文本还原 chip 与那一句话。
          const restored = parseRelationshipGoal(profile.relationshipGoal);
          setGoals([...restored.goals]);
          setFocus(restored.focus);
          setHorizon(restored.horizon);
        }
        setLoaded(true);
      } catch {
        if (!active) return;
        setLoadError(t({ zh: "资料读取失败，请刷新页面重试。", en: "Could not load your profile. Refresh to try again." }));
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
    writeOnboardingDraft(actorKey, { focus, goals, horizon, introRegenerations, view });
  }, [actorKey, focus, goals, horizon, introRegenerations, loaded, view]);

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

  function finish() {
    clearOnboardingDraft(actorKey);
    window.location.assign(next);
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
  const birthValid = isValidProfileBirthDate(basic.birthDate, todayIso);
  const profileValid = Boolean(name) && industryValid && birthValid;
  const bioCount = visibleCharacterCount(bio.trim());
  const introValid = bioCount <= BIO_LIMIT && visibleCharacterCount(headline.trim()) <= HEADLINE_LIMIT;

  async function save(fields: ProfileFields): Promise<boolean> {
    setSaving(true);
    setError("");
    try {
      const payload = await saveProfileFields(fields, expectedUpdatedAt);
      setExpectedUpdatedAt(payload.profile?.updatedAt ?? null);
      setComplete(payload.onboarding?.status === "complete");
      return true;
    } catch (caught) {
      setError(caught instanceof Error && caught.message
        ? t({ zh: `保存失败：${caught.message}`, en: `Save failed: ${caught.message}` })
        : t({ zh: "保存失败，请重试。", en: "Save failed. Please try again." }));
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function onNext() {
    if (saving) return;
    if (view === "profile") {
      if (!profileValid) return;
      const ok = await save({
        birthDate: basic.birthDate,
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
      if (!goals.length) return;
      const relationshipGoal = composeRelationshipGoal({ focus, goals, horizon: effectiveHorizon }, lang);
      const ok = await save({ relationshipGoal });
      if (ok) {
        setSavedGoal(relationshipGoal);
        go("persona");
      }
      return;
    }
    if (view === "persona") {
      const ok = await save({ offering: offer, seeking: seek, topics });
      if (ok) go("intro");
      return;
    }
    if (view === "intro") {
      if (!introValid || introStatus === "generating") return;
      const ok = await save({ bio: bio.trim(), headline: headline.trim() });
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
  // kind: auto = 进入本步自动生成；retry = 失败后重试；这两种不计次。regenerate = 「换一版」，成功才计次，上限 3 次。
  async function generateIntro(kind: "auto" | "retry" | "regenerate") {
    if (introStatus === "generating") return;
    if (kind === "regenerate" && introRegenerations >= INTRO_REGENERATE_LIMIT) return;
    const previous = { bio, headline, status: introStatus };
    setIntroStatus("generating");
    setIntroError("");
    try {
      const draft = await generateIntroDraft(lang);
      setHeadline(draft.headline);
      setBio(draft.bio);
      setIntroStatus("ready");
      if (kind === "regenerate") setIntroRegenerations(count => count + 1);
    } catch (caught) {
      const message = caught instanceof Error && caught.message ? caught.message : "";
      if (kind === "regenerate" && (previous.bio.trim() || previous.headline.trim())) {
        // 换一版失败：保留上一版，不扣次数。
        setIntroStatus(previous.status === "error" ? "ready" : previous.status);
        flash(t({ zh: "这次没换成功，保留了上一版，可以再试一次", en: "Couldn't get a new version — kept the previous one" }));
        return;
      }
      setIntroStatus("error");
      setIntroError(message);
    }
  }

  useEffect(() => {
    if (view === "intro" && loaded && introStatus === "idle" && !bio.trim() && !headline.trim()) {
      void generateIntro("auto");
    }
    // generateIntro 只依赖当前状态；按进入步骤触发。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, loaded]);

  // ── 引导内扫描名片：识别 → 核对 → 确认后才建联系人；全程不离开引导页 ──
  async function onContactFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || cardStage.kind === "scanning" || cardStage.kind === "saving") return;
    setCardStage({ kind: "scanning" });
    try {
      const card = await scanContactCard(file);
      setCardStage({ kind: "review", card, acknowledged: card.issues.length === 0, message: "" });
    } catch {
      setCardStage({ kind: "idle", message: t({ zh: "这张名片没有识别出来，请换一张清晰、单张的照片再试。", en: "Couldn't read this card. Try a clear photo of a single card." }) });
    }
  }

  async function confirmCard() {
    if (cardStage.kind !== "review" || !cardStage.card.name.trim() || !cardStage.acknowledged) return;
    const card = cardStage.card;
    setCardStage({ kind: "saving", card });
    try {
      await confirmContactCard({ ...card, name: card.name.trim() });
      setAddedContacts(current => [...current, card.name.trim()]);
      setCardStage({ kind: "idle" });
      flash(t({ zh: `已添加 ${card.name.trim()}`, en: `Added ${card.name.trim()}` }));
    } catch (caught) {
      const duplicate = caught instanceof OnboardingRequestError && caught.code === "DUPLICATE_REVIEW";
      setCardStage({
        kind: "review",
        card,
        acknowledged: true,
        message: duplicate
          ? t({ zh: "人脉里可能已有这个人，这张先不添加。之后可以在人脉页处理重复项。", en: "This person may already be in your network — skipped. Resolve duplicates later in Network." })
          : t({ zh: "保存失败，请重试。", en: "Save failed. Please try again." }),
      });
    }
  }

  useEffect(() => {
    const goal = savedGoal.trim();
    if (view !== "persona" || !loaded || !goal || seekSuggest.forGoal === goal) return;
    let active = true;
    setSeekSuggest({ forGoal: goal, labels: [], status: "loading" });
    void fetchSeekSuggestions(SEEK_OPTIONS.map(option => t(option)), lang)
      .then(labels => active && setSeekSuggest({ forGoal: goal, labels, status: "ready" }))
      .catch(() => active && setSeekSuggest({ forGoal: goal, labels: [], status: "error" }));
    return () => {
      active = false;
    };
    // t / lang 随语言切换整页刷新，不需要作为依赖。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, loaded, savedGoal]);

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
      flash(t({ zh: "已从名片识别，可继续修改", en: "Filled from your card — edit as needed" }));
    } catch {
      setError(t({ zh: "名片没有识别出来，请换一张清晰的照片，或直接手动填写。", en: "Couldn't read the card. Try a clearer photo or fill in by hand." }));
    } finally {
      setScanning(false);
    }
  }

  // ── 渲染 ──
  const previewProps = {
    complete,
    firstGoal: goals[0] ?? "",
    focus,
    initial,
    name,
    onEnter: () => leaveTo(next),
    onGo: (step: OnboardingStep) => go(step),
    progress,
    todayLabel: todayLabel(todayIso, t),
  };

  const nextDisabled = saving || !loaded
    || (view === "profile" && !profileValid)
    || (view === "goals" && goals.length === 0)
    || (view === "intro" && (!introValid || introStatus === "generating"));

  const nextLabel = saving ? t({ zh: "保存中…", en: "Saving…" }) : t({ zh: "继续", en: "Continue" });

  return (
    <>
      {/* 与顶栏同源的 Noto Serif SC / Noto Sans SC；本页不挂 OrbitTopNav，自己带上（React 会去重）。 */}
      <link
        href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@700;900&family=Noto+Sans+SC:wght@400;500;700&display=swap"
        rel="stylesheet"
      />
      <style>{ONBOARDING_STYLES}</style>
      <header className={`ob-header${scrolled ? " ob-header-scrolled" : ""}`}>
        <div className="ob-header-inner">
          <button className="btn ob-logo" onClick={() => go("welcome")} type="button">Orbit</button>
          <nav className="ob-nav" aria-label={t({ zh: "预览", en: "Preview" })}>
            <button className={`btn ob-nav-link${view === "home" ? " ob-nav-on" : ""}`} onClick={() => go("home")} type="button">iOrbit</button>
            <button className="btn ob-nav-link" onClick={() => go("home")} type="button">{t({ zh: "活动", en: "Events" })}</button>
            <button className={`btn ob-nav-link${view === "network" ? " ob-nav-on" : ""}`} onClick={() => go("network")} type="button">{t({ zh: "人脉", en: "Network" })}</button>
          </nav>
          <div className="ob-header-right">
            <button className="btn ob-lang" onClick={() => setLanguage(language === "zh" ? "en" : "zh")} type="button">
              {language === "zh" ? "中文" : "English"} <span className="ob-caret" aria-hidden>⌄</span>
            </button>
            <button aria-label={t({ zh: "关于你", en: "About you" })} className="btn ob-avatar-sm" onClick={() => go("profile")} type="button">{initial}</button>
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
                <span>{t({ zh: `设置你的 Orbit · 第 ${stepIndex + 1} 步，共 ${ONBOARDING_STEPS.length} 步`, en: `Set up Orbit · Step ${stepIndex + 1} of ${ONBOARDING_STEPS.length}` })}</span>
                <span className="ob-bars" aria-hidden>
                  {ONBOARDING_STEPS.map((step, index) => <span className={`ob-bar${index <= stepIndex ? " ob-bar-on" : ""}`} key={step} />)}
                </span>
              </span>
              <button className="btn ob-link-plain" onClick={() => (complete ? leaveTo(next) : go("home"))} type="button">
                {complete ? t({ zh: "跳过，稍后在个人中心设置", en: "Skip, finish later in your profile" }) : t({ zh: "先看看 iOrbit", en: "Look around first" })}
              </button>
            </div>

            <div className="ob-grid">
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
                    focus={focus}
                    goals={goals}
                    horizon={effectiveHorizon}
                    setFocus={setFocus}
                    setGoals={setGoals}
                    setHorizon={setHorizon}
                    t={t}
                  />
                ) : null}
                {view === "persona" ? (
                  <PersonaStep offer={offer} suggestStatus={seekSuggest.status} suggested={seekOptionsFromLabels(seekSuggest.labels)} seek={seek} setOffer={setOffer} setSeek={setSeek} setTopics={setTopics} t={t} topics={topics} />
                ) : null}
                {view === "intro" ? (
                  <IntroStep
                    bio={bio}
                    bioCount={bioCount}
                    error={introError}
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
                  <ImportStep
                    added={addedContacts}
                    available={cardScanAvailable}
                    fileRef={contactFileRef}
                    onCancelCard={() => setCardStage({ kind: "idle" })}
                    onConfirmCard={() => void confirmCard()}
                    onFile={onContactFile}
                    setCardStage={setCardStage}
                    stage={cardStage}
                    t={t}
                  />
                ) : null}

                {error ? <div className="ob-notice ob-notice-error" role="alert">{error}</div> : null}

                <div className="ob-footer">
                  <button className="btn ob-btn-ghost" disabled={saving} onClick={onBack} type="button">{t({ zh: "← 上一步", en: "← Back" })}</button>
                  <span className="ob-footer-right">
                    {view === "import" ? (
                      <button className="btn ob-btn-dark" disabled={cardStage.kind === "scanning" || cardStage.kind === "saving"} onClick={finish} type="button">
                        {addedContacts.length ? t({ zh: "完成设置，进入 Orbit", en: "Finish and enter Orbit" }) : t({ zh: "暂时跳过，完成设置", en: "Skip for now and finish" })}
                      </button>
                    ) : (
                      <button aria-busy={saving || undefined} className="btn ob-btn-dark" disabled={nextDisabled} onClick={() => void onNext()} type="button">{nextLabel}</button>
                    )}
                  </span>
                </div>
              </section>

              <UnderstandingAside
                basic={basic}
                focus={focus}
                goals={goals}
                headline={headline}
                horizon={effectiveHorizon}
                initial={initial}
                language={language}
                addedCount={addedContacts.length}
                offer={offer}
                savedGoal={savedGoal}
                seek={seek}
                t={t}
                view={view as OnboardingStep}
              />
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
    <section className="ob-welcome" data-screen-label="01 欢迎">
      <div className="ob-col">
        <span className="ob-kicker">{t({ zh: "账号已创建", en: "Account created" })}</span>
        <h1 className="ob-h1">{t({ zh: "欢迎来到 Orbit。", en: "Welcome to Orbit." })}<br />{t({ zh: "先让 iOrbit", en: "Let iOrbit" })}<br />{t({ zh: "认识你。", en: "get to know you." })}</h1>
        <p className="ob-lead">{t({ zh: "大约 2 分钟。即使你现在一个联系人都没有，iOrbit 也能告诉你该去哪场活动、先认识谁、从什么话题开始。", en: "About 2 minutes. Even with zero contacts, iOrbit can tell you which events to attend, who to meet first and what to talk about." })}</p>
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
          <button className="btn ob-btn-dark ob-btn-dark-lg" onClick={onStart} type="button">{t({ zh: "开始设置", en: "Get started" })}</button>
          <button className="btn ob-link-under" onClick={onBrowse} type="button">{t({ zh: "先随便看看", en: "Just look around" })}</button>
        </div>
      </div>
      <div className="ob-panel">
        <div className="ob-panel-card">
          <div className="ob-iorbit-head">
            <strong>{t({ zh: "iOrbit 智能", en: "iOrbit" })}</strong>
            <span className="ob-spark ob-spark-lg" aria-hidden>✦</span>
            <span className="ob-vbar" aria-hidden />
            <span className="ob-muted">{t({ zh: "正在等你介绍自己", en: "Waiting for you to introduce yourself" })}</span>
          </div>
          <div className="ob-fakeask" aria-hidden>
            <span className="ob-fakeask-text">{t({ zh: "我刚来东京，想找到第一批合作伙伴……", en: "I just moved to Tokyo and want to find my first partners…" })}</span>
            <span className="ob-fakeask-send">↑</span>
          </div>
          <div className="ob-hr" />
          <span className="ob-gain-lead">{t({ zh: "设置完成后，你会立刻得到", en: "Once set up, you immediately get" })}</span>
          <div>
            <div className="ob-gain">
              <span className="ob-gain-icon" aria-hidden><small>{t({ zh: "活动", en: "Event" })}</small><strong>✧</strong></span>
              <span className="ob-gain-body"><strong>{t({ zh: "适合你的近期活动", en: "Upcoming events that fit you" })}</strong><span className="ob-skeleton" style={{ width: "70%" }} /></span>
              <span className="ob-pill">{t({ zh: "第 2 步后", en: "After step 2" })}</span>
            </div>
            <div className="ob-gain">
              <span className="ob-gain-pair" aria-hidden><span>佐</span><span>陈</span></span>
              <span className="ob-gain-body"><strong>{t({ zh: "值得先认识的人", en: "People worth meeting first" })}</strong><span className="ob-skeleton" style={{ width: "55%" }} /></span>
              <span className="ob-pill">{t({ zh: "第 3 步后", en: "After step 3" })}</span>
            </div>
            <div className="ob-gain">
              <span className="ob-gain-icon ob-gain-quote" aria-hidden>“</span>
              <span className="ob-gain-body"><strong>{t({ zh: "一段拿得出手的自我介绍", en: "A self-introduction ready to use" })}</strong><span className="ob-skeleton" style={{ width: "62%" }} /></span>
              <span className="ob-pill">{t({ zh: "第 4 步后", en: "After step 4" })}</span>
            </div>
          </div>
          <div className="ob-tip">
            <span className="ob-spark" aria-hidden>✦</span>
            <span>{t({ zh: "不需要任何联系人。你的目标就是 iOrbit 的第一条线索。", en: "No contacts needed. Your goal is iOrbit's first lead." })}</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function Field({ children, label, required, t }: { children: ReactNode; label: Copy; required?: boolean; t: T }) {
  return (
    <label className="ob-field">
      <span className="ob-field-label">{t(label)}{required ? <span className="ob-required">{t({ zh: "必填", en: "Required" })}</span> : null}</span>
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
    <div className="ob-stack" data-screen-label="02 关于你">
      <StepHead title={t({ zh: "你是谁？", en: "Who are you?" })} sub={t({ zh: "这是别人在活动中看到你的第一眼，也是 iOrbit 为你匹配人的起点。", en: "This is the first thing people see at events, and where iOrbit starts matching you." })} />
      {cardScanAvailable ? (
        <>
          <button className="btn ob-autofill" disabled={disabled || scanning} onClick={() => fileRef.current?.click()} type="button">
            <span className="ob-spark" aria-hidden>✦</span>
            {scanning ? t({ zh: "正在识别名片…", en: "Reading your card…" }) : t({ zh: "拍摄或上传自己的名片，自动填写", en: "Photograph or upload your own card to fill this in" })}
          </button>
          <input accept="image/*,.heic,.heif" className="ob-sr" onChange={onCardFile} ref={fileRef} tabIndex={-1} type="file" aria-hidden />
        </>
      ) : null}
      <div className="ob-fields">
        <Field label={{ zh: "姓名", en: "Name" }} required t={t}>
          <input className="ob-input" disabled={disabled} maxLength={60} onChange={set("name")} placeholder={t({ zh: "你希望别人怎么称呼你", en: "How should people call you?" })} value={basic.name} />
        </Field>
        <Field label={{ zh: "一级行业", en: "Primary industry" }} required t={t}>
          <select
            className="ob-input"
            disabled={disabled}
            onChange={event => {
              const value = event.target.value;
              setBasic(current => ({ ...current, primaryIndustryId: (value || "") as IndustryIdCode | "", secondaryIndustryId: "" }));
            }}
            value={basic.primaryIndustryId}
          >
            <option value="">{t({ zh: "请选择", en: "Select" })}</option>
            {INDUSTRY_CATALOG.map(item => <option key={item.id} value={item.id}>{industryLabel(item.id, language)}</option>)}
          </select>
        </Field>
        <Field label={{ zh: "二级行业", en: "Secondary industry" }} required t={t}>
          <select
            className="ob-input"
            disabled={disabled || !basic.primaryIndustryId}
            onChange={event => {
              const value = event.target.value;
              setBasic(current => ({ ...current, secondaryIndustryId: (value || "") as SecondaryIndustryIdCode | "" }));
            }}
            value={basic.secondaryIndustryId}
          >
            <option value="">{basic.primaryIndustryId ? t({ zh: "请选择", en: "Select" }) : t({ zh: "先选择一级行业", en: "Choose a primary industry first" })}</option>
            {(basic.primaryIndustryId ? listSecondaryIndustries(basic.primaryIndustryId) : []).map(item => (
              <option key={item.id} value={item.id}>{secondaryIndustryLabel(item.id, language)}</option>
            ))}
          </select>
        </Field>
        <Field label={{ zh: "职位", en: "Title" }} t={t}>
          <input className="ob-input" disabled={disabled} maxLength={80} onChange={set("title")} placeholder={t({ zh: "例如：产品负责人", en: "e.g. Head of Product" })} value={basic.title} />
        </Field>
        <Field label={{ zh: "公司", en: "Company" }} t={t}>
          <input className="ob-input" disabled={disabled} maxLength={80} onChange={set("company")} placeholder={t({ zh: "例如：Orbit", en: "e.g. Orbit" })} value={basic.company} />
        </Field>
        <Field label={{ zh: "生日", en: "Birthday" }} required t={t}>
          <input className="ob-input" disabled={disabled} max={todayIso} onChange={set("birthDate")} type="date" value={basic.birthDate} />
        </Field>
      </div>
      {showBirthError ? <div className="ob-notice ob-notice-warning">{t({ zh: "请填写有效的生日（不能晚于今天）。", en: "Enter a valid birthday (not later than today)." })}</div> : null}
      <span className="ob-label-note ob-privacy">{t({ zh: "生日仅自己可见，用于活动报名核验，不会展示给其他人。", en: "Your birthday is private — used only for event registration checks, never shown to others." })}</span>
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
  const knownValues = new Set(options.flatMap(option => [option.zh, option.en]));
  const customValues = values.filter(value => !knownValues.has(value));
  function add() {
    setValues(current => addCustomValue(current, custom, limit));
    setCustom("");
  }
  return (
    <div className="ob-group">
      <span className="ob-label">{title}{limit ? <span className="ob-label-note">{t({ zh: `${values.length}/${limit}`, en: `${values.length}/${limit}` })}</span> : null}</span>
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
          <button className="btn ob-chip-add-btn" disabled={full || !custom.trim()} onClick={add} type="button">{t({ zh: "添加", en: "Add" })}</button>
        </span>
      </div>
    </div>
  );
}

function GoalsStep({
  focus, goals, horizon, setFocus, setGoals, setHorizon, t,
}: {
  focus: string;
  goals: string[];
  horizon: string;
  setFocus: (value: string) => void;
  setGoals: (update: (current: string[]) => string[]) => void;
  setHorizon: (value: string) => void;
  t: T;
}) {
  const full = goals.length >= GOAL_LIMIT;
  const known = new Set(GOAL_GROUPS.flatMap(group => group.options.flatMap(option => [option.zh, option.en])));
  const customGoals = goals.filter(goal => !known.has(goal));
  const [custom, setCustom] = useState("");
  function add() {
    setGoals(current => addCustomValue(current, custom, GOAL_LIMIT));
    setCustom("");
  }
  return (
    <div className="ob-stack" data-screen-label="03 目标">
      <StepHead title={t({ zh: "你最近想推进什么？", en: "What do you want to move forward?" })} sub={t({ zh: "没有联系人时，目标就是 iOrbit 最重要的线索——它决定推荐哪些活动、哪些人。", en: "With no contacts yet, your goal is iOrbit's most important lead — it decides which events and people to recommend." })} />
      <div className="ob-group">
        <span className="ob-label">{t({ zh: "选择 1–3 个方向", en: "Pick 1–3 directions" })}<span className="ob-label-note">{goals.length}/{GOAL_LIMIT}</span></span>
        {GOAL_GROUPS.map(group => (
          <div className="ob-group ob-group-tight" key={group.title.zh}>
            <span className="ob-group-title">{t(group.title)}</span>
            <div className="ob-chips">
              {group.options.map(option => {
                const selected = goals.find(goal => optionMatches(option, goal));
                return (
                  <button
                    aria-pressed={Boolean(selected)}
                    className={`btn ob-chip${selected ? " ob-chip-on" : ""}`}
                    disabled={!selected && full}
                    key={option.zh}
                    onClick={() => setGoals(current => (selected ? current.filter(goal => goal !== selected) : toggleValue(current, t(option), GOAL_LIMIT)))}
                    type="button"
                  >
                    {t(option)}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        <div className="ob-chips">
          {customGoals.map(goal => (
            <button aria-pressed className="btn ob-chip ob-chip-on" key={goal} onClick={() => setGoals(current => current.filter(item => item !== goal))} type="button">{goal} <span aria-hidden>×</span></button>
          ))}
          <span className="ob-chip-add">
            <input
              aria-label={t({ zh: "其他目标", en: "Another goal" })}
              disabled={full}
              maxLength={24}
              onChange={event => setCustom(event.target.value)}
              onKeyDown={event => {
                if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  add();
                }
              }}
              placeholder={t({ zh: "其他目标", en: "Another goal" })}
              value={custom}
            />
            <button className="btn ob-chip-add-btn" disabled={full || !custom.trim()} onClick={add} type="button">{t({ zh: "添加", en: "Add" })}</button>
          </span>
        </div>
      </div>
      <label className="ob-field">
        <span className="ob-field-label">{t({ zh: "用一句话说说具体的事（可选）", en: "Describe it in one sentence (optional)" })}</span>
        <textarea
          className="ob-input"
          maxLength={FOCUS_LIMIT}
          onChange={event => setFocus(event.target.value)}
          placeholder={t({ zh: "例如：把我们的 AI 会议纪要产品推到日本市场，先找到 5 家愿意试用的企业。", en: "e.g. Bring our AI meeting-notes product to Japan and find 5 companies willing to pilot it." })}
          rows={3}
          value={focus}
        />
        <span className="ob-count">{Array.from(focus).length}/{FOCUS_LIMIT}</span>
      </label>
      <div className="ob-group">
        <span className="ob-label">{t({ zh: "时间范围", en: "Time frame" })}</span>
        <div className="ob-seg" role="radiogroup" aria-label={t({ zh: "时间范围", en: "Time frame" })}>
          {HORIZONS.map(option => {
            const on = optionMatches(option, horizon);
            return <button aria-checked={on} className={`btn ob-seg-btn${on ? " ob-seg-on" : ""}`} key={option.zh} onClick={() => setHorizon(t(option))} role="radio" type="button">{t(option)}</button>;
          })}
        </div>
      </div>
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
    <div className="ob-stack" data-screen-label="04 商务画像">
      <StepHead title={t({ zh: "你能提供什么，在找什么？", en: "What can you offer, and what are you looking for?" })} sub={t({ zh: "好的关系是双向的。这两组词决定谁会被推荐给你，你又会被推荐给谁。", en: "Good relationships go both ways. These tags decide who is recommended to you, and to whom you are recommended." })} />
      <ChipGroup
        customPlaceholder={{ zh: "自定义", en: "Custom" }}
        limit={OFFER_LIMIT}
        options={OFFER_OPTIONS}
        setValues={setOffer}
        t={t}
        title={t({ zh: "我能提供", en: "I can offer" })}
        values={offer}
      />
      <ChipGroup
        customPlaceholder={{ zh: "自定义", en: "Custom" }}
        limit={SEEK_LIMIT}
        options={seekOptions}
        setValues={setSeek}
        suggested={suggested}
        t={t}
        title={<>{t({ zh: "我在寻找", en: "I'm looking for" })}{suggestStatus === "loading"
          ? <span className="ob-label-note ob-suggest-loading">{t({ zh: "✦ iOrbit 正在根据你的目标挑选…", en: "✦ iOrbit is picking from your goals…" })}</span>
          : suggested.length
            ? <span className="ob-label-note">{t({ zh: "✦ iOrbit 根据你的目标建议", en: "✦ Suggested by iOrbit from your goals" })}</span>
            : suggestStatus === "error"
              ? <span className="ob-label-note">{t({ zh: "暂时没拿到建议，按需自己选即可", en: "No suggestions right now — pick what fits" })}</span>
              : null}</>}
        values={seek}
      />
      <ChipGroup
        customPlaceholder={{ zh: "自定义话题", en: "Custom topic" }}
        limit={TOPIC_LIMIT}
        options={TOPIC_OPTIONS}
        setValues={setTopics}
        t={t}
        title={<>{t({ zh: "想聊的话题", en: "Topics to talk about" })}<span className="ob-label-note">{t({ zh: "可选", en: "Optional" })}</span></>}
        values={topics}
      />
    </div>
  );
}

function IntroStep({
  bio, bioCount, error, headline, onRegenerate, regenerationsLeft, setBio, setHeadline, status, t,
}: {
  bio: string;
  bioCount: number;
  error: string;
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
    <div className="ob-stack" data-screen-label="05 AI 介绍">
      <StepHead title={t({ zh: "iOrbit 帮你写好了介绍", en: "iOrbit wrote your introduction" })} sub={t({ zh: "根据你刚才填写的身份、目标和画像生成。满意就直接用，也可以改几个字。", en: "Drafted from the identity, goals and persona you just entered. Use it as is or tweak a few words." })} />
      <div className="ob-ai-box" aria-live="polite">
        <div className="ob-ai-head">
          <span className="ob-ai-status">
            <span className="ob-spark" aria-hidden>✦</span>
            {generating
              ? t({ zh: "iOrbit 正在根据你的资料起草…", en: "iOrbit is drafting from your profile…" })
              : status === "error"
                ? t({ zh: "这次没有生成成功", en: "This draft didn't come through" })
                : t({ zh: "AI 草稿 · 可直接修改", en: "AI draft · edit freely" })}
          </span>
          {status === "error" ? (
            <button className="btn ob-btn-soft" onClick={onRegenerate} type="button">{t({ zh: "重试", en: "Retry" })}</button>
          ) : (
            <button className="btn ob-btn-soft" disabled={generating || regenerationsLeft <= 0} onClick={onRegenerate} type="button">
              {regenerationsLeft > 0
                ? t({ zh: `↻ 换一版 · 还剩 ${regenerationsLeft} 次`, en: `↻ Try another · ${regenerationsLeft} left` })
                : t({ zh: "换一版次数已用完", en: "No more versions" })}
            </button>
          )}
        </div>
        {status === "error" ? (
          <div className="ob-notice ob-notice-warning">
            {t({ zh: "可以点「重试」再生成一次，或直接在下面写几句。", en: "Retry, or write a couple of lines below." })}
            {error ? <span className="ob-faint"> ({error})</span> : null}
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
              <span className="ob-field-label">{t({ zh: "一句话介绍", en: "One-line intro" })}</span>
              <input className="ob-input" maxLength={HEADLINE_LIMIT} onChange={event => setHeadline(event.target.value)} placeholder={t({ zh: "例如：帮助中国品牌落地日本市场", en: "e.g. Helping Chinese brands launch in Japan" })} value={headline} />
            </label>
            <label className="ob-field">
              <span className="ob-field-label">{t({ zh: "关于我", en: "About me" })}</span>
              <textarea className="ob-input" onChange={event => setBio(event.target.value)} rows={3} value={bio} />
              <span className={`ob-count${bioCount > BIO_LIMIT ? " ob-count-over" : ""}`}>{bioCount}/{BIO_LIMIT}</span>
            </label>
          </>
        )}
      </div>
      <div className="ob-tip ob-tip-sm">
        <span className="ob-spark" aria-hidden>✦</span>
        <span>{t({ zh: "只会保存到你的个人资料，不会发给任何人。之后可以在个人中心随时修改。", en: "Saved to your profile only — never sent to anyone. You can change it any time in your profile." })}</span>
      </div>
    </div>
  );
}

function ImportStep({
  added, available, fileRef, onCancelCard, onConfirmCard, onFile, setCardStage, stage, t,
}: {
  added: string[];
  available: boolean;
  fileRef: RefObject<HTMLInputElement | null>;
  onCancelCard: () => void;
  onConfirmCard: () => void;
  onFile: (event: ChangeEvent<HTMLInputElement>) => void;
  setCardStage: (stage: CardStage) => void;
  stage: CardStage;
  t: T;
}) {
  const busy = stage.kind === "scanning" || stage.kind === "saving";
  const review = stage.kind === "review" || stage.kind === "saving" ? stage : null;
  function edit(key: "company" | "email" | "name" | "phone" | "title") {
    return (event: ChangeEvent<HTMLInputElement>) => {
      if (stage.kind !== "review") return;
      setCardStage({ ...stage, card: { ...stage.card, [key]: event.target.value } });
    };
  }
  return (
    <div className="ob-stack" data-screen-label="06 带入人脉">
      <StepHead title={t({ zh: "带入你已有的人脉", en: "Bring in the people you already know" })} sub={t({ zh: "不带入也完全可以——Orbit 会通过活动帮你从零建立。拍几张手边的名片，iOrbit 就能开始判断谁值得现在联系。", en: "Totally optional — Orbit helps you build from zero through events. Snap a few cards and iOrbit can start judging who's worth contacting now." })} />

      {!available ? (
        <div className="ob-source ob-source-off">
          <span className="ob-source-glyph" aria-hidden>▭</span>
          <span className="ob-source-body">
            <strong>{t({ zh: "扫描名片", en: "Scan business cards" })}</strong>
            <span>{t({ zh: "名片识别暂未开放，之后可在人脉页使用", en: "Card recognition isn't available yet — use it later from Network" })}</span>
          </span>
        </div>
      ) : review ? (
        <div className="ob-card-review" aria-busy={stage.kind === "saving" || undefined}>
          <span className="ob-label">{t({ zh: "核对识别结果，确认后才会添加", en: "Check the result — nothing is added until you confirm" })}</span>
          <div className="ob-fields">
            <label className="ob-field">
              <span className="ob-field-label">{t({ zh: "姓名", en: "Name" })}<span className="ob-required">{t({ zh: "必填", en: "Required" })}</span></span>
              <input className="ob-input" disabled={stage.kind === "saving"} onChange={edit("name")} value={review.card.name} />
            </label>
            <label className="ob-field">
              <span className="ob-field-label">{t({ zh: "公司", en: "Company" })}</span>
              <input className="ob-input" disabled={stage.kind === "saving"} onChange={edit("company")} value={review.card.company} />
            </label>
            <label className="ob-field">
              <span className="ob-field-label">{t({ zh: "职位", en: "Title" })}</span>
              <input className="ob-input" disabled={stage.kind === "saving"} onChange={edit("title")} value={review.card.title} />
            </label>
            <label className="ob-field">
              <span className="ob-field-label">{t({ zh: "邮箱", en: "Email" })}</span>
              <input className="ob-input" disabled={stage.kind === "saving"} onChange={edit("email")} type="email" value={review.card.email} />
            </label>
            <label className="ob-field">
              <span className="ob-field-label">{t({ zh: "电话", en: "Phone" })}</span>
              <input className="ob-input" disabled={stage.kind === "saving"} onChange={edit("phone")} value={review.card.phone} />
            </label>
          </div>
          {review.card.issues.length ? (
            <div className="ob-notice ob-notice-warning ob-issues">
              <span>{t({ zh: "识别时有几处需要你留意：", en: "A few things to double-check:" })}</span>
              <ul>{review.card.issues.map(issue => <li key={issue.code + issue.field}>{issue.message}</li>)}</ul>
              <label className="ob-ack">
                <input checked={stage.kind === "review" ? stage.acknowledged : true} disabled={stage.kind === "saving"} onChange={event => stage.kind === "review" && setCardStage({ ...stage, acknowledged: event.target.checked })} type="checkbox" />
                {t({ zh: "我已核对以上内容", en: "I've checked these" })}
              </label>
            </div>
          ) : null}
          {stage.kind === "review" && stage.message ? <div className="ob-notice ob-notice-error" role="alert">{stage.message}</div> : null}
          <div className="ob-card-actions">
            <button className="btn ob-btn-ghost" disabled={stage.kind === "saving"} onClick={onCancelCard} type="button">{t({ zh: "不添加这张", en: "Discard this card" })}</button>
            <button
              className="btn ob-btn-dark ob-btn-dark-md"
              disabled={stage.kind === "saving" || !review.card.name.trim() || (stage.kind === "review" && !stage.acknowledged)}
              onClick={onConfirmCard}
              type="button"
            >
              {stage.kind === "saving" ? t({ zh: "添加中…", en: "Adding…" }) : t({ zh: "确认添加", en: "Add contact" })}
            </button>
          </div>
        </div>
      ) : (
        <button className="btn ob-scan-drop" disabled={busy} onClick={() => fileRef.current?.click()} type="button">
          <span className="ob-source-glyph" aria-hidden>▭</span>
          <span className="ob-source-body">
            <strong>{stage.kind === "scanning" ? t({ zh: "正在识别名片…", en: "Reading the card…" }) : added.length ? t({ zh: "再扫一张名片", en: "Scan another card" }) : t({ zh: "拍摄或上传一张名片", en: "Photograph or upload a business card" })}</strong>
            <span>{t({ zh: "一次一张，识别后由你核对确认", en: "One card at a time; you confirm each result" })}</span>
          </span>
        </button>
      )}
      <input accept="image/*,.heic,.heif" aria-hidden className="ob-sr" onChange={onFile} ref={fileRef} tabIndex={-1} type="file" />
      {stage.kind === "idle" && stage.message ? <div className="ob-notice ob-notice-warning" role="alert">{stage.message}</div> : null}

      {added.length ? (
        <div className="ob-added">
          <span className="ob-label">{t({ zh: `已添加 ${added.length} 位`, en: `${added.length} added` })}</span>
          <span className="ob-mini-chips">{added.map((name, index) => <span className="ob-mini-chip" key={`${name}-${index}`}>{name}</span>)}</span>
        </div>
      ) : null}

      <div className="ob-tip ob-tip-sm">
        <span className="ob-spark" aria-hidden>⛨</span>
        <span>{t({ zh: "识别结果需要你确认后才会保存为联系人。名片较多时，之后可在人脉页批量导入。Orbit 不会以你的名义给任何人发消息。", en: "Recognised cards become contacts only after you confirm. For many cards, bulk-import later from Network. Orbit never messages anyone on your behalf." })}</span>
      </div>
    </div>
  );
}

function UnderstandingAside({
  addedCount, basic, focus, goals, headline, horizon, initial, language, offer, savedGoal, seek, t, view,
}: {
  addedCount: number;
  basic: BasicDraft;
  focus: string;
  goals: string[];
  headline: string;
  horizon: string;
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
  const separator = t({ zh: "、", en: ", " });
  return (
    <aside className="ob-aside" aria-label={t({ zh: "iOrbit 对你的理解", en: "How iOrbit sees you" })}>
      <span className="ob-aside-title">
        <span className="ob-aside-heading"><span className="ob-spark" aria-hidden>✦</span><strong>{t({ zh: "iOrbit 对你的理解", en: "How iOrbit sees you" })}</strong></span>
        <span className="ob-aside-sub">{t({ zh: "随你填写实时更新", en: "Updates as you type" })}</span>
      </span>
      <span className="ob-aside-person">
        <span className="ob-avatar" aria-hidden>{initial}</span>
        <span className="ob-aside-who">
          <strong className={name ? "" : "ob-aside-empty"}>{name || t({ zh: "你的名字", en: "Your name" })}</strong>
          <span className={`ob-aside-line${line.length ? "" : " ob-aside-empty"}`}>{line.length ? line.join(" · ") : t({ zh: "职位 · 公司 · 行业", en: "Title · Company · Industry" })}</span>
          {headline.trim() ? <span className="ob-aside-headline">{headline.trim()}</span> : null}
        </span>
      </span>
      <span className="ob-aside-sec">
        <span className="ob-aside-label">{t({ zh: "当前目标", en: "Current goal" })}</span>
        {goals.length ? (
          <span className="ob-mini-chips">{goals.map(goal => <span className="ob-mini-chip" key={goal}>{goal}</span>)}</span>
        ) : savedGoal.trim()
          ? <span className="ob-aside-val">{savedGoal.trim()}</span>
          : <span className="ob-aside-val ob-aside-empty">{t({ zh: "待填写", en: "Not set" })}</span>}
        {focus.trim() ? <span className="ob-aside-val ob-aside-focus">“{focus.trim()}” · {horizon}</span> : null}
      </span>
      <span className="ob-aside-two">
        <span className="ob-aside-sec"><span className="ob-aside-label">{t({ zh: "能提供", en: "Offers" })}</span><span className={`ob-aside-val${offer.length ? "" : " ob-aside-empty"}`}>{offer.length ? offer.join(separator) : t({ zh: "待填写", en: "Not set" })}</span></span>
        <span className="ob-aside-sec"><span className="ob-aside-label">{t({ zh: "在寻找", en: "Seeking" })}</span><span className={`ob-aside-val${seek.length ? "" : " ob-aside-empty"}`}>{seek.length ? seek.join(separator) : t({ zh: "待填写", en: "Not set" })}</span></span>
      </span>
      <span className="ob-aside-foot">
        <span className="ob-aside-label">{t({ zh: "人脉", en: "Network" })}</span>
        <span className="ob-aside-headline">{addedCount ? t({ zh: `已带入 ${addedCount} 位`, en: `${addedCount} added` }) : view === "import" ? t({ zh: "可通过扫描名片带入", en: "Bring in by scanning cards" }) : t({ zh: "尚未带入", en: "Not imported yet" })}</span>
      </span>
      {goals.length ? (
        <span className="ob-tip ob-tip-sm">
          <span className="ob-spark" aria-hidden>✦</span>
          <span>{t({ zh: `iOrbit 会优先为你留意与「${goals[0]}」相关的活动和人。`, en: `iOrbit will prioritise events and people related to “${goals[0]}”.` })}</span>
        </span>
      ) : null}
    </aside>
  );
}
