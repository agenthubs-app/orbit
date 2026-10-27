/**
 * 新用户引导（b1 A3 Web #16–#20）。首次登录资料未完成时由门禁带到这里；没有壳、没有欢迎页。
 *
 * 五屏：基本情報 → 目標 → 強み・ニーズ → 自己紹介（AI 草稿） → 名刺の取り込み。
 * 每屏点「次へ」经 PUT /api/profile 保存并复读核验，再推进 actor 级进度（/api/profile/onboarding-progress）；
 * 基本情報一存资料门禁即解除。「あとで設定する」记 deferred 后去 next，首页再以「おかえりなさい」（#21）请回。
 * 左卡填写、右栏是「相手から見えるあなた」等说明；未提交的输入写本地草稿（「自動保存済み」）。
 */
"use client";

import { useEffect, useId, useRef, useState, type ChangeEvent, type DragEvent, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";

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
import { appendWebGuideReturnTo } from "../../../../../features/guide/return-to";
import { forgetBatchReturnTo } from "../../contacts/card-batch-return";
import { useOrbitLanguage } from "../../orbit-language-context";
import { visibleCharacterCount } from "../../profile/profile-save-model";
import { Icon, MacTile, Orbit2026Scope, SampleTag, WhyBody, WhyButton } from "../ui";
import type { AvatarTone } from "../ui/Basics";
import {
  fetchProfile,
  fetchOnboardingProgress,
  generateIntroDraft,
  saveProfileFields,
  updateOnboardingProgress,
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
  toggleValue,
  writeOnboardingDraft,
  type Copy,
  type OnboardingStep,
  type OnboardingView,
} from "./onboarding-model";
import { OnboardingStepper, rememberOnboardingFlow, rememberedOnboardingFlow } from "./OnboardingGuide";
import { ONBOARDING_COPY, ONBOARDING_SCREEN_LABELS } from "../copy/onboarding";
import styles from "./OnboardingFlow.module.css";

export interface OnboardingFlowProps {
  actorKey: string;
  cardScanAvailable: boolean;
  next: string;
  todayIso: string;
}

type IntroStatus = "idle" | "generating" | "ready" | "error";
type IntroTone = "native" | "en";
type T = (copy: Copy) => string;

interface BasicDraft {
  birthDate: string;
  company: string;
  name: string;
  primaryIndustryId: IndustryIdCode | "";
  secondaryIndustryId: SecondaryIndustryIdCode | "";
  title: string;
}

const EMPTY_BASIC: BasicDraft = { birthDate: "", company: "", name: "", primaryIndustryId: "", secondaryIndustryId: "", title: "" };
const IMPORT_RETURN = "/app/profile/onboarding?screen=5";

// b1 #17: the six goal tiles (emoji tile + who it is about).
const GOAL_TILES: Record<string, { emoji: string; tone: AvatarTone; sub: Copy }> = {
  funding: { emoji: "💰", tone: "pink", sub: { ja: "投資家・金融機関", zh: "投资人・金融机构", en: "Investors · lenders" } },
  customers: { emoji: "🏭", tone: "blue", sub: { ja: "決裁者・購買担当", zh: "决策者・采购负责人", en: "Decision makers · buyers" } },
  hiring: { emoji: "🧑‍💼", tone: "teal", sub: { ja: "候補者・紹介者", zh: "候选人・推荐人", en: "Candidates · referrers" } },
  partners: { emoji: "🤝", tone: "apricot", sub: { ja: "協業・販路", zh: "合作・渠道", en: "Alliances · channels" } },
  awareness: { emoji: "📣", tone: "lav", sub: { ja: "登壇・メディア", zh: "演讲・媒体", en: "Talks · media" } },
  research: { emoji: "📚", tone: "blue", sub: { ja: "業界の知見", zh: "行业见解", en: "Industry insight" } },
};

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

function basicFromDraft(draft: NonNullable<NonNullable<ReturnType<typeof readOnboardingDraft>>["fields"]>["basic"]): BasicDraft | null {
  if (!draft) return null;
  return {
    ...draft,
    primaryIndustryId: isIndustryIdCode(draft.primaryIndustryId) ? draft.primaryIndustryId : "",
    secondaryIndustryId: draft.secondaryIndustryId as SecondaryIndustryIdCode | "",
  };
}

export function OnboardingFlow({ actorKey, cardScanAvailable, next, todayIso }: OnboardingFlowProps) {
  const { language, t: siteText } = useOrbitLanguage();
  const t: T = (copy) => siteText(copy as { ja: string; zh: string; en: string });
  // Start on the screen the link names (`?screen=5` back from card import) or the flow this tab last read,
  // so the header and stepper do not show step 1 and then jump once the read lands.
  const screenParam = Number(useSearchParams()?.get("screen") ?? "");
  const [start] = useState(() => {
    const remembered = rememberedOnboardingFlow();
    const screen = screenParam >= 1 && screenParam <= ONBOARDING_STEPS.length ? screenParam : remembered?.currentScreen ?? 1;
    return { view: ONBOARDING_STEPS[screen - 1]!, confirmed: remembered?.lastConfirmedScreen ?? Math.max(0, screen - 1) };
  });
  const [view, setView] = useState<OnboardingView>(start.view);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [expectedUpdatedAt, setExpectedUpdatedAt] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(start.confirmed);
  const [basic, setBasic] = useState<BasicDraft>(EMPTY_BASIC);
  const [fromCard, setFromCard] = useState<ReadonlySet<keyof BasicDraft>>(new Set());
  const [goalText, setGoalText] = useState("");
  const [goalChoices, setGoalChoices] = useState<string[]>([]);
  const [offer, setOffer] = useState<string[]>([]);
  const [seek, setSeek] = useState<string[]>([]);
  const [topics, setTopics] = useState<string[]>([]);
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
  const progressRef = useRef<ProfileOnboardingProgressContract | null>(null);
  const initMutationRef = useRef<string | null>(null);
  const pendingConfirmRef = useRef<ProfileOnboardingProgressCommandContract | null>(null);
  const pendingFieldsRef = useRef<string | null>(null);
  const finishMutationRef = useRef<string | null>(null);
  const deferCommandRef = useRef<ProfileOnboardingProgressCommandContract | null>(null);
  const introActionKeyRef = useRef<string | null>(null);
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

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
        const draft = readOnboardingDraft(actorKey);
        const fields = draft?.fields;
        setBasic((done < 1 && basicFromDraft(fields?.basic)) || basicFromPayload(payload));
        setExpectedUpdatedAt(profile?.updatedAt ?? null);
        setOffer(done < 3 && fields?.offer ? fields.offer : [...(profile?.offering ?? [])]);
        setSeek(done < 3 && fields?.seek ? fields.seek : [...(profile?.seeking ?? [])]);
        setTopics(done < 3 && fields?.topics ? fields.topics : [...(profile?.topics ?? [])]);
        setBio(done < 4 && fields?.bio !== undefined ? fields.bio : profile?.bio ?? "");
        setHeadline(profile?.headline ?? "");
        if (draft) {
          setGoalText(draft.goalText);
          setGoalChoices(draft.goalChoices ?? []);
          setIntroRegenerations(draft.introRegenerations);
          if (!flow) setView(draft.view);
        }
        if (done >= 2 || !draft?.goalText.trim()) {
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
    writeOnboardingDraft(actorKey, { goalText, goalChoices, horizon: "", introRegenerations, view, fields: { basic, offer, seek, topics, bio } });
  }, [actorKey, goalText, goalChoices, introRegenerations, loaded, view, basic, offer, seek, topics, bio]);

  function go(nextView: OnboardingView) {
    setError("");
    setView(nextView);
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  }

  async function deferAndLeave() {
    if (saving || !loaded) return;
    setSaving(true);
    setLoadError("");
    try {
      const flow = await ensureProgress();
      if (!flow.deferred) {
        deferCommandRef.current ??= { action: "defer", expectedRevision: flow.revision, mutationId: crypto.randomUUID() };
        const updated = await updateOnboardingProgress(deferCommandRef.current);
        if (!updated.deferred) throw new Error("Onboarding defer was not confirmed.");
        progressRef.current = updated;
        deferCommandRef.current = null;
      } else {
        const readback = await fetchOnboardingProgress();
        if (!readback?.deferred) throw new Error("Onboarding defer was not confirmed.");
        progressRef.current = readback;
      }
      window.location.assign(next);
    } catch {
      setLoadError(t({ zh: "暂时无法保存进度，请重试。", en: "Could not save your progress. Please retry.", ja: "進捗を保存できませんでした。もう一度お試しください。" }));
    } finally {
      setSaving(false);
    }
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
      forgetBatchReturnTo("/app/profile/onboarding?screen=5");
      window.location.assign(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t({ zh: "无法完成设置，请重试。", en: "Could not finish onboarding. Please retry.", ja: "設定を完了できませんでした。再試行してください。" }));
    } finally {
      setSaving(false);
    }
  }

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
    } finally {
      setConfirmed(progressRef.current?.lastConfirmedScreen ?? 0);
      rememberOnboardingFlow(progressRef.current);
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
      const ok = await save(2, { relationshipGoal: composeProfileOnboardingGoal(goalChoices, goalText, language) });
      if (ok) go("persona");
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
        setEditingIntro(false);
        go("import");
      }
    }
  }

  function onBack() {
    if (stepIndex > 0) go(ONBOARDING_STEPS[stepIndex - 1]!);
  }

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

  async function scanCard(file: File | undefined) {
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
      setFromCard(new Set([card.name ? "name" : null, card.company ? "company" : null, card.title ? "title" : null].filter(Boolean) as (keyof BasicDraft)[]));
    } catch {
      setError(t(ONBOARDING_COPY.flow023));
    } finally {
      setScanning(false);
    }
  }

  // ── 渲染 ──
  const nextDisabled = saving || !loaded
    || (view === "profile" && !profileValid)
    || (view === "goals" && !goalText.trim() && !goalChoices.length)
    || (view === "intro" && (!introValid || introStatus === "generating"));
  const later = t({ zh: "稍后设置", en: "Set up later", ja: "あとで設定する" });

  return (
    <Orbit2026Scope language={language} as="main" className={styles.page}>
      <header className={styles.head}>
        <span className={styles.brand}><span className={styles.logo} aria-hidden>O</span><b>Orbit</b></span>
        <OnboardingStepper current={stepIndex + 1} confirmed={confirmed} className={styles.stepper} />
        <button className={`btn ${styles.later}`} disabled={saving} onClick={() => void deferAndLeave()} type="button">{later}</button>
      </header>

      <div className={styles.body} data-onboarding-view={view}>
        {loadError ? <div className={styles.notice} role="alert">{loadError}</div> : null}
        <div className={styles.grid}>
          <section className={styles.card} aria-busy={!loaded || undefined}>
            {view === "profile" ? <ProfileStep basic={basic} cardScanAvailable={cardScanAvailable} disabled={!loaded || saving} fileRef={fileRef} fromCard={fromCard}
              language={language} onCardFile={(event) => { const file = event.target.files?.[0]; event.target.value = ""; void scanCard(file); }} onCardDrop={(file) => void scanCard(file)}
              scanning={scanning} setBasic={setBasic} showBirthError={Boolean(basic.birthDate) && !birthValid} t={t} todayIso={todayIso} /> : null}
            {view === "goals" ? <GoalsStep goals={goalChoices} setGoals={setGoalChoices} setGoalText={setGoalText} t={t} text={goalText} /> : null}
            {view === "persona" ? <PersonaStep offer={offer} seek={seek} setOffer={setOffer} setSeek={setSeek} setTopics={setTopics} t={t} topics={topics} /> : null}
            {view === "intro" ? <IntroStep bio={bio} bioCount={bioCount} editing={editingIntro} errorCode={introErrorCode} goals={goalChoices.length || (goalText.trim() ? 1 : 0)}
              offer={offer.length} topics={topics.length} onEdit={() => setEditingIntro(value => !value)}
              onRegenerate={() => void generateIntro(introStatus === "error" ? "retry" : "regenerate")} onTone={switchTone}
              regenerationsLeft={INTRO_REGENERATE_LIMIT - introRegenerations} setBio={setBio} status={introStatus} t={t} tone={introTone} /> : null}
            {view === "import" ? <ImportStep cardScanAvailable={cardScanAvailable} t={t} /> : null}

            {error ? <div className={styles.notice} role="alert">{error}</div> : null}

            <div className={styles.foot}>
              {stepIndex > 0 ? <button className={`btn ${styles.back}`} disabled={saving} onClick={onBack} type="button"><Icon name="left" size={16} />{t({ zh: "返回", en: "Back", ja: "戻る" })}</button> : null}
              <span className={styles.saved}><Icon name="check" size={16} />{t({ zh: "已自动保存", en: "Saved automatically", ja: "自動保存済み" })}</span>
              <span className={styles.spacer} />
              {view === "import" ? <>
                <button className={`btn ${styles.ghost}`} disabled={saving} onClick={() => void finish()} type="button">{t({ zh: "跳过，先看示例", en: "Skip and explore the sample", ja: "スキップしてサンプルで見る" })}</button>
                <button className={`btn ${styles.primary}`} disabled={saving} onClick={() => void finish()} type="button">{t({ zh: "导入后继续", en: "Import and continue", ja: "取り込んで次へ" })}</button>
              </> : <button aria-busy={saving || undefined} className={`btn ${styles.primary}`} disabled={nextDisabled} onClick={() => void onNext()} type="button">
                {saving ? t(ONBOARDING_COPY.flow024) : view === "intro" ? t({ zh: "保存这段介绍", en: "Save this introduction", ja: "この内容で保存" }) : t({ zh: "下一步", en: "Next", ja: "次へ" })}<Icon name="right" size={16} />
              </button>}
            </div>
          </section>

          <aside className={styles.aside}>
            {view === "profile" ? <ProfileAside basic={basic} initial={initial} language={language} offer={offer} seek={seek} bio={bio} t={t} /> : null}
            {view === "goals" ? <GoalsAside choices={goalChoices} text={goalText} t={t} /> : null}
            {view === "persona" ? <PersonaAside initial={initial} offer={offer} t={t} /> : null}
            {view === "intro" ? <IntroAside bio={bio} t={t} /> : null}
            {view === "import" ? <ImportAside t={t} /> : null}
          </aside>
        </div>
      </div>
    </Orbit2026Scope>
  );
}

function StepHead({ sub, title, side }: { sub: string; title: string; side?: ReactNode }) {
  const head = <div><h2 className={styles.title}>{title}</h2><p className={styles.sub}>{sub}</p></div>;
  return side ? <div className={styles.headRow}>{head}{side}</div> : head;
}

function Field({ children, label, card, t }: { children: ReactNode; label: Copy; card?: boolean; t: T }) {
  return (
    <label className={styles.field}>
      <span className={styles.fieldLabel}>{t(label)}{card ? <span className={styles.chipLav}>{t({ ja: "名刺から", zh: "来自名片", en: "From card" })}</span> : null}</span>
      {children}
    </label>
  );
}

function ProfileStep({
  basic, cardScanAvailable, disabled, fileRef, fromCard, language, onCardDrop, onCardFile, scanning, setBasic, showBirthError, t, todayIso,
}: {
  basic: BasicDraft;
  cardScanAvailable: boolean;
  disabled: boolean;
  fileRef: { current: HTMLInputElement | null };
  fromCard: ReadonlySet<keyof BasicDraft>;
  language: "zh" | "en" | "ja";
  onCardDrop: (file: File | undefined) => void;
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
  const drop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!disabled && !scanning) onCardDrop(event.dataTransfer.files?.[0]);
  };
  return (
    <div data-screen-label={ONBOARDING_SCREEN_LABELS.basics}>
      <StepHead title={t({ ja: "まずは、あなたのことを", zh: "先从你开始", en: "Let's start with you" })}
        sub={t({ ja: "相手のプロフィールにも表示される、基本の情報です。", zh: "这些基本信息也会显示在对方看到的资料里。", en: "The basics others see on your profile." })} />
      {cardScanAvailable ? (
        <div className={styles.autofill} onDragOver={event => event.preventDefault()} onDrop={drop}>
          <span className={styles.autofillTile} aria-hidden>📇</span>
          <div className={styles.grow}>
            <b>{scanning ? t(ONBOARDING_COPY.flow061) : t({ ja: "自分の名刺の画像をドロップして自動入力", zh: "拖入自己的名片图片，自动填写", en: "Drop your own business card to fill this in" })}</b>
            <div className={styles.lbl}>{t({ ja: "氏名・会社・役職・連絡先を読み取ります", zh: "读取姓名、公司、职位和联系方式", en: "Reads your name, company, title and contact details" })}</div>
          </div>
          <button className={`btn ${styles.sm}`} disabled={disabled || scanning} onClick={() => fileRef.current?.click()} type="button"><Icon name="image" size={16} />{t({ ja: "画像を選ぶ", zh: "选择图片", en: "Choose image" })}</button>
          <input accept="image/*,.heic,.heif" className={styles.srOnly} onChange={onCardFile} ref={fileRef} tabIndex={-1} type="file" aria-hidden />
        </div>
      ) : null}
      <div className={styles.grid2}>
        <Field card={fromCard.has("name")} label={{ ja: "氏名", zh: "姓名", en: "Name" }} t={t}>
          <input className={styles.input} disabled={disabled} maxLength={60} onChange={set("name")} placeholder={t(ONBOARDING_COPY.flow064)} value={basic.name} />
        </Field>
        <Field card={fromCard.has("company")} label={{ ja: "会社", zh: "公司", en: "Company" }} t={t}>
          <input className={styles.input} disabled={disabled} maxLength={80} onChange={set("company")} placeholder={t(ONBOARDING_COPY.flow066)} value={basic.company} />
        </Field>
        <Field card={fromCard.has("title")} label={{ ja: "役職", zh: "职位", en: "Title" }} t={t}>
          <input className={styles.input} disabled={disabled} maxLength={80} onChange={set("title")} placeholder={t(ONBOARDING_COPY.flow068)} value={basic.title} />
        </Field>
        <Field label={{ zh: "生日（可选）", en: "Birthday (optional)", ja: "生年月日（任意）" }} t={t}>
          <input className={styles.input} disabled={disabled} max={todayIso} onChange={set("birthDate")} type="date" value={basic.birthDate} />
        </Field>
        <Field label={{ ja: "業界", zh: "行业", en: "Industry" }} t={t}>
          <span className={styles.selectWrap}><select className={styles.input} disabled={disabled} value={basic.primaryIndustryId}
            onChange={event => { const value = event.target.value; setBasic(current => ({ ...current, primaryIndustryId: (value || "") as IndustryIdCode | "", secondaryIndustryId: "" })); }}>
            <option value="">{t(ONBOARDING_COPY.flow070)}</option>
            {INDUSTRY_CATALOG.map(item => <option key={item.id} value={item.id}>{industryLabel(item.id, language)}</option>)}
          </select><Icon name="down" size={16} /></span>
        </Field>
        <Field label={{ ja: "業界の詳細", zh: "细分行业", en: "Industry detail" }} t={t}>
          <span className={styles.selectWrap}><select className={styles.input} disabled={disabled || !basic.primaryIndustryId} value={basic.secondaryIndustryId}
            onChange={event => { const value = event.target.value; setBasic(current => ({ ...current, secondaryIndustryId: (value || "") as SecondaryIndustryIdCode | "" })); }}>
            <option value="">{basic.primaryIndustryId ? t(ONBOARDING_COPY.flow072) : t(ONBOARDING_COPY.flow073)}</option>
            {(basic.primaryIndustryId ? listSecondaryIndustries(basic.primaryIndustryId) : []).map(item => <option key={item.id} value={item.id}>{secondaryIndustryLabel(item.id, language)}</option>)}
          </select><Icon name="down" size={16} /></span>
        </Field>
      </div>
      {showBirthError ? <div className={styles.notice}>{t(ONBOARDING_COPY.flow074)}</div> : null}
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
    <div data-screen-label={ONBOARDING_SCREEN_LABELS.goals}>
      <StepHead title={t({ ja: "いちばん達成したいことは？", zh: "你最想达成什么？", en: "What do you most want to achieve?" })}
        sub={t({ ja: "2個まで。選んだ順に優先します。", zh: "最多 2 个，按选择顺序排优先级。", en: "Pick up to 2, in order of priority." })} />
      <div className={styles.goals}>{PROFILE_ONBOARDING_GOALS.map((option) => {
        const selected = goals.find((value) => value === option.zh || value === option.en || value === option.ja);
        const tile = GOAL_TILES[option.id]!;
        return <button aria-pressed={Boolean(selected)} className={`btn ${styles.goal} ${selected ? styles.on : ""}`} data-goal={option.id} disabled={!selected && goals.length >= 2} key={option.id}
          onClick={() => setGoals(selected ? goals.filter((value) => value !== selected) : [...goals, t(option)])} type="button">
          {selected ? <span className={styles.ord}>{goals.indexOf(selected) + 1}</span> : null}
          <MacTile emoji={tile.emoji} tone={tile.tone} size="sm" />{t(option)}<small>{t(tile.sub)}</small>
        </button>;
      })}</div>
      <label className={`${styles.field} ${styles.goalLine}`}>
        <span className={styles.fieldLabel}>{t({ ja: "ひとことで（任意）", zh: "一句话说明（可选）", en: "In one line (optional)" })}</span>
        <input className={styles.input} data-goal-line="" maxLength={80} onChange={(event) => setGoalText(event.target.value)} value={text}
          placeholder={t({ ja: "例：シリーズAで3億円を調達", zh: "例：完成 A 轮融资", en: "e.g. Close a Series A" })} />
        <span className={styles.msg}>{t({ ja: "期限は決めません。目標から「誰と話すとよいか」を分析します。", zh: "不设期限。我们会根据目标分析「该和谁聊」。", en: "No deadline. We use your goal to work out who to talk to." })}</span>
      </label>
    </div>
  );
}

/** kit .togs: selected first, then the remaining options up to the board's count, then ＋ 追加 (an inline field with the full list). */
function TagGroup({ emoji, tone, title, why, limit, options, shown, setValues, t, values }: {
  emoji: string;
  tone: AvatarTone;
  title: Copy;
  why?: Copy;
  limit: number;
  options: readonly Copy[];
  shown: number;
  setValues: (update: (current: string[]) => string[]) => void;
  t: T;
  values: readonly string[];
}) {
  const [adding, setAdding] = useState(false);
  const [custom, setCustom] = useState("");
  const [whyOpen, setWhyOpen] = useState(false);
  const id = useId();
  const full = values.length >= limit;
  const rest = options.filter(option => !values.some(value => optionMatches(option, value))).slice(0, Math.max(0, shown - values.length));
  const add = () => {
    const option = options.find(item => optionMatches(item, custom.trim()));
    setValues(current => addCustomValue(current, option ? t(option) : custom, limit));
    setCustom("");
    setAdding(false);
  };
  return (
    <div className={styles.group} data-tag-group={title.en}>
      <div className={styles.groupHead}><MacTile emoji={emoji} tone={tone} size="sm" />{t(title)}{why ? <WhyButton open={whyOpen} onToggle={() => setWhyOpen(open => !open)} controls={`${id}-why`} /> : null}</div>
      <div className={styles.togs}>
        {values.map(value => <button aria-pressed className={`btn ${styles.tog} ${styles.on}`} key={value} onClick={() => setValues(current => current.filter(item => item !== value))} type="button"><Icon name="check" size={16} />{value}</button>)}
        {rest.map(option => <button aria-pressed={false} className={`btn ${styles.tog}`} disabled={full} key={option.en} onClick={() => setValues(current => toggleValue(current, t(option), limit))} type="button">{t(option)}</button>)}
        {adding ? <span className={`${styles.tog} ${styles.adding}`}>
          <input aria-label={t(title)} autoFocus list={`${id}-options`} maxLength={24} onBlur={() => { if (!custom.trim()) setAdding(false); }} onChange={event => setCustom(event.target.value)}
            onKeyDown={event => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); add(); } if (event.key === "Escape") setAdding(false); }} value={custom} />
          <datalist id={`${id}-options`}>{options.filter(option => !values.some(value => optionMatches(option, value))).map(option => <option key={option.en} value={t(option)} />)}</datalist>
        </span> : <button className={`btn ${styles.tog} ${styles.add}`} disabled={full} onClick={() => setAdding(true)} type="button"><Icon name="plus" size={16} />{t({ ja: "追加", zh: "添加", en: "Add" })}</button>}
      </div>
      {why ? <WhyBody id={`${id}-why`} open={whyOpen}>{t(why)}</WhyBody> : null}
    </div>
  );
}

function PersonaStep({ offer, seek, setOffer, setSeek, setTopics, t, topics }: {
  offer: string[];
  seek: string[];
  setOffer: (update: (current: string[]) => string[]) => void;
  setSeek: (update: (current: string[]) => string[]) => void;
  setTopics: (update: (current: string[]) => string[]) => void;
  t: T;
  topics: string[];
}) {
  return (
    <div data-screen-label={ONBOARDING_SCREEN_LABELS.persona}>
      <StepHead title={t({ ja: "あなたの「強み」と「求めていること」", zh: "你的「优势」与「需求」", en: "Your strengths and what you're looking for" })}
        sub={t({ ja: "人と人を結ぶ手がかりになります。", zh: "这是把人和人连起来的线索。", en: "These are the clues that connect people." })} />
      <div className={styles.groups}>
        <TagGroup emoji="🎁" tone="teal" title={{ ja: "提供できること", zh: "能提供的", en: "What you offer" }} limit={OFFER_LIMIT} options={OFFER_OPTIONS} shown={5} setValues={setOffer} t={t} values={offer} />
        <TagGroup emoji="🔎" tone="pink" title={{ ja: "求めていること", zh: "正在寻找的", en: "What you're looking for" }} limit={SEEK_LIMIT} options={SEEK_OPTIONS} shown={5} setValues={setSeek} t={t} values={seek}
          why={{ ja: "選んだ内容は、イベント前に「強みとニーズが重なる人」を探すのに使います。", zh: "你选的内容会在活动前用来找「优势与需求重合的人」。", en: "We use these before events to find people whose needs and strengths match yours." }} />
        <TagGroup emoji="☕" tone="apricot" title={{ ja: "話せる話題", zh: "能聊的话题", en: "Topics you enjoy" }} limit={TOPIC_LIMIT} options={TOPIC_OPTIONS} shown={6} setValues={setTopics} t={t} values={topics} />
      </div>
    </div>
  );
}

function IntroStep({
  bio, bioCount, editing, errorCode, goals, offer, onEdit, onRegenerate, onTone, regenerationsLeft, setBio, status, t, tone, topics,
}: {
  bio: string;
  bioCount: { count: number; limit: number; over: boolean };
  editing: boolean;
  errorCode: "INTRO_LIMIT_REACHED" | "SAMPLE_READ_ONLY" | null;
  goals: number;
  offer: number;
  onEdit: () => void;
  onRegenerate: () => void;
  onTone: (tone: IntroTone) => void;
  regenerationsLeft: number;
  setBio: (value: string) => void;
  status: IntroStatus;
  t: T;
  tone: IntroTone;
  topics: number;
}) {
  const [whyOpen, setWhyOpen] = useState(false);
  const id = useId();
  const generating = status === "generating";
  const seg = <div className={styles.seg} role="radiogroup" aria-label={t({ ja: "文体", zh: "语气", en: "Style" })}>
    {([["native", t({ ja: "ビジネス", zh: "商务", en: "Business" })], ["en", "English"]] as const).map(([key, label]) =>
      <button aria-checked={tone === key} className={`btn ${tone === key ? styles.on : ""}`} disabled={generating || (tone !== key && status === "error")} key={key} onClick={() => onTone(key)} role="radio" type="button">{label}</button>)}
  </div>;
  return (
    <div data-screen-label={ONBOARDING_SCREEN_LABELS.intro}>
      <StepHead side={seg}
        title={generating ? t({ ja: "自己紹介文をつくっています…", zh: "正在写自我介绍…", en: "Drafting your introduction…" }) : t({ ja: "自己紹介文をつくりました", zh: "已为你写好自我介绍", en: "We drafted your introduction" })}
        sub={t({ ja: "イベントのプロフィールや、メール下書きの冒頭に使います。", zh: "用于活动资料和邮件草稿的开头。", en: "Used on your event profile and at the top of email drafts." })} />
      {status === "error" ? <div className={styles.notice} role="alert">
        {errorCode === "INTRO_LIMIT_REACHED"
          ? t({ zh: "介绍草稿的 3 次生成额度已用完。请直接在下面写几句。", en: "All three introduction drafts have been used. Write a few lines below instead.", ja: "自己紹介の生成は3回までです。下に直接入力してください。" })
          : errorCode === "SAMPLE_READ_ONLY"
            ? t({ zh: "示例资料不能生成介绍。请在真实资料中填写。", en: "Sample data is read only. Write your introduction in your own profile.", ja: "サンプルデータは編集できません。自分のプロフィールで入力してください。" })
            : t({ zh: "可以点「重试」再生成一次，或直接在下面写几句。", en: "Retry, or write a couple of lines below.", ja: "再試行するか、下に直接入力してください。" })}
      </div> : null}
      <div className={styles.introBox} aria-live="polite">
        {generating ? <div className={styles.bones} aria-hidden><i style={{ width: "92%" }} /><i style={{ width: "86%" }} /><i style={{ width: "64%" }} /></div>
          : editing || status === "error" ? <textarea aria-label={t(ONBOARDING_COPY.flow102)} className={styles.introEdit} onChange={event => setBio(event.target.value)} rows={5} value={bio} />
            : <p className={styles.introText}>{bio}</p>}
        {generating ? null : <div className={styles.introMeta}>
          <span className={`${styles.lbl} ${bioCount.over ? styles.over : ""}`}>{bioCount.over
            ? t({ ja: `${bioCount.count} / ${bioCount.limit}文字`, zh: `${bioCount.count} / ${bioCount.limit} 字`, en: `${bioCount.count} / ${bioCount.limit} characters` })
            : t({ ja: `${bioCount.count}文字`, zh: `${bioCount.count} 字`, en: `${bioCount.count} characters` })}</span>
          <span className={styles.whyEnd}><WhyButton open={whyOpen} onToggle={() => setWhyOpen(open => !open)} controls={`${id}-why`} /></span>
        </div>}
        <WhyBody id={`${id}-why`} open={whyOpen && !generating} onSurface>{t({
          ja: `使った情報：基本情報 · 目標${goals}つ · 提供できること${offer}つ · 話題${topics}つ。`,
          zh: `用到的信息：基本信息 · 目标 ${goals} 个 · 能提供的 ${offer} 项 · 话题 ${topics} 个。`,
          en: `Based on: your basics · ${goals} goals · ${offer} offers · ${topics} topics.`,
        })}</WhyBody>
      </div>
      <div className={styles.introActions}>
        {status === "error" && errorCode ? null : <button className={`btn ${styles.btn}`} disabled={generating || (status !== "error" && regenerationsLeft <= 0)} onClick={onRegenerate} type="button">
          <Icon name="refresh" size={16} />{status === "error" ? t({ zh: "重试", en: "Retry", ja: "再試行" }) : t({ ja: "別の案をつくる", zh: "换一版", en: "Try another" })}
          {status === "error" ? null : <span className={styles.left}>{t({ ja: `残り ${regenerationsLeft}回`, zh: `还剩 ${regenerationsLeft} 次`, en: `${regenerationsLeft} left` })}</span>}
        </button>}
        {status === "error" ? null : <button aria-pressed={editing} className={`btn ${styles.btn}`} disabled={generating} onClick={onEdit} type="button"><Icon name="pen" size={16} />{editing ? t({ ja: "編集を終える", zh: "完成编辑", en: "Done editing" }) : t({ ja: "直接編集", zh: "直接编辑", en: "Edit" })}</button>}
        <span className={`${styles.lbl} ${styles.pushEnd}`}>{t({ ja: "自動で公開・送信されることはありません", zh: "不会自动公开或发送", en: "Nothing is published or sent automatically" })}</span>
      </div>
    </div>
  );
}

function ImportStep({ cardScanAvailable, t }: { cardScanAvailable: boolean; t: T }) {
  const scan = appendWebGuideReturnTo("/app/contacts/new/scan", IMPORT_RETURN);
  const csv = appendWebGuideReturnTo("/app/contacts/new/import?method=csv", IMPORT_RETURN);
  const vcard = appendWebGuideReturnTo("/app/contacts/new/import?method=contacts", IMPORT_RETURN);
  return (
    <div data-screen-label={ONBOARDING_SCREEN_LABELS.import}>
      <StepHead title={t({ ja: "手元の名刺を取り込みましょう", zh: "导入手头的名片", en: "Bring in the cards you have" })}
        sub={t({ ja: "10枚以上あると、最初のプランがぐっと具体的になります。", zh: "有 10 张以上，第一份计划会具体很多。", en: "With 10 or more, your first plan gets much more specific." })} />
      {cardScanAvailable ? <div className={styles.drop}>
        <span className={styles.dropEmoji} aria-hidden>📇</span>
        <b>{t({ ja: "名刺の画像をここから取り込む", zh: "从这里导入名片图片", en: "Bring in card photos here" })}</b>
        <div className={styles.lbl}>{t({ ja: "JPG・PNG・HEIC · 最大100枚 · 表と裏はペアにできます", zh: "JPG・PNG・HEIC · 最多 100 张 · 正反面可以配对", en: "JPG · PNG · HEIC · up to 100 · pair fronts and backs" })}</div>
        <a className={`btn ${styles.pick}`} href={scan}>{t({ ja: "ファイルを選ぶ", zh: "选择文件", en: "Choose files" })}</a>
      </div> : null}
      <div className={styles.grid3}>
        <div className={styles.method}><MacTile emoji="📱" tone="blue" size="sm" /><div><b>{t({ ja: "スマホで連続撮影", zh: "用手机连拍", en: "Shoot on your phone" })}</b><div className={styles.lbl}>{t({ ja: "アプリから自動で同期", zh: "从 App 自动同步", en: "Synced from the app" })}</div></div></div>
        <a className={styles.method} href={csv}><MacTile emoji="🗂️" tone="pink" size="sm" /><div><b>CSV · Eight</b><div className={styles.lbl}>{t({ ja: "列の対応づけを自動で", zh: "自动匹配列", en: "Columns matched automatically" })}</div></div></a>
        <a className={styles.method} href={vcard}><MacTile emoji="👤" tone="teal" size="sm" /><div><b>vCard</b><div className={styles.lbl}>{t({ ja: "iPhone・Google 連絡先", zh: "iPhone・Google 通讯录", en: "iPhone · Google contacts" })}</div></div></a>
      </div>
    </div>
  );
}

function AsideLabel({ children }: { children: ReactNode }) {
  return <div className={styles.asideLabel}>{children}</div>;
}

function GhostRow({ children }: { children: ReactNode }) {
  return <div className={styles.ghostRow}><i aria-hidden />{children}</div>;
}

function ProfileAside({ basic, bio, initial, language, offer, seek, t }: { basic: BasicDraft; bio: string; initial: string; language: "zh" | "en" | "ja"; offer: string[]; seek: string[]; t: T }) {
  const name = basic.name.trim();
  const line = [basic.company.trim(), basic.title.trim()].filter(Boolean).join(" · ");
  const industry = basic.primaryIndustryId
    ? [industryLabel(basic.primaryIndustryId, language), basic.secondaryIndustryId ? secondaryIndustryLabel(basic.secondaryIndustryId, language) : ""].filter(Boolean).join(" › ")
    : "";
  return <>
    <AsideLabel>{t({ ja: "相手から見えるあなた", zh: "对方看到的你", en: "How others see you" })}</AsideLabel>
    <div className={styles.asideCard}>
      <div className={styles.person}>
        <span className={styles.avatarLg} aria-hidden>{initial}</span>
        <div><div className={`${styles.personName} ${name ? "" : styles.muted}`}>{name || t({ ja: "あなたの名前", zh: "你的名字", en: "Your name" })}</div>{line ? <div className={styles.sub}>{line}</div> : null}</div>
      </div>
      {industry ? <div className={styles.chips}><span className={styles.chipBlue}>{industry}</span></div> : null}
      {bio.trim() ? <p className={styles.previewText}>{bio.trim()}</p> : <GhostRow>{t({ ja: "自己紹介（ステップ4で作成）", zh: "自我介绍（第 4 步生成）", en: "Introduction (made in step 4)" })}</GhostRow>}
      {offer.length || seek.length ? <p className={styles.previewText}>{[...offer, ...seek].join(" · ")}</p> : <GhostRow>{t({ ja: "提供できること · 求めていること", zh: "能提供的 · 正在寻找的", en: "What you offer · What you seek" })}</GhostRow>}
    </div>
    <div className={`${styles.asideCard} ${styles.flat}`}>
      <div className={styles.row}><MacTile emoji="🔒" tone="lav" size="sm" /><div className={styles.sub}>{t({ ja: "生年月日と連絡先は相手に公開されません。", zh: "生日和联系方式不会公开给对方。", en: "Your birthday and contact details stay private." })}</div></div>
    </div>
  </>;
}

function GoalsAside({ choices, text, t }: { choices: string[]; text: string; t: T }) {
  const first = text.trim() || choices[0] || "";
  const second = text.trim() ? choices[0] && choices[1] ? choices[1] : "" : choices[1] ?? "";
  return <>
    <AsideLabel>{t({ ja: "この目標から作られるもの", zh: "这个目标会生成", en: "What this goal builds" })} <SampleTag /></AsideLabel>
    <div className={`${styles.asideCard} ${styles.faded}`}>
      <div className={styles.row}>
        <span className={styles.ring} aria-hidden><svg viewBox="0 0 90 90" width="90" height="90"><circle cx="45" cy="45" r="40" /><circle className={styles.ringArc} cx="45" cy="45" r="40" /></svg><b>0</b></span>
        <div>
          <div className={styles.lbl}>{t({ ja: "プラン スコア", zh: "计划得分", en: "Plan score" })}</div>
          <b>{first || t({ ja: "目標を選ぶと表示されます", zh: "选好目标后显示", en: "Shown once you pick a goal" })}</b>
          {second ? <div className={`${styles.lbl} ${styles.plus}`}>＋ {second}</div> : null}
        </div>
      </div>
      <GhostRow>{t({ ja: "話すべき人のタイプ（ステップ別）", zh: "该聊的人的类型（按步骤）", en: "People to talk to (by step)" })}</GhostRow>
      <GhostRow>{t({ ja: "行くべきイベント", zh: "该去的活动", en: "Events worth attending" })}</GhostRow>
      <GhostRow>{t({ ja: "今日 +10 のチャンス", zh: "今日 +10 的机会", en: "Today's +10 chances" })}</GhostRow>
    </div>
  </>;
}

function PersonaAside({ initial, offer, t }: { initial: string; offer: string[]; t: T }) {
  const strength = offer[0] ?? t(OFFER_OPTIONS[0]!);
  return <>
    <AsideLabel>{t({ ja: "こうして結びつきます", zh: "这样把人连起来", en: "How people connect" })} <SampleTag /></AsideLabel>
    <div className={`${styles.asideCard} ${styles.faded}`}>
      <div className={styles.row}><span className={styles.avatarSm} aria-hidden>{initial}</span><span className={styles.chipTeal}>{strength}</span></div>
      <div className={styles.link} aria-hidden />
      <div className={styles.row}><span className={`${styles.avatarSm} ${styles.avatarApricot}`} aria-hidden>{t({ ja: "渡", zh: "渡", en: "W" })}</span>
        <span className={styles.chipPink}>{t({ ja: `${strength}を相談したい`, zh: `想请教${strength}`, en: `Wants advice: ${strength}` })}</span></div>
      <div className={`${styles.sub} ${styles.linkNote}`}>{t({ ja: "相手のニーズとあなたの強みが重なる人を、イベント前に教えます。", zh: "活动前，告诉你需求与你的优势重合的人。", en: "Before events, we point out people whose needs match your strengths." })}</div>
    </div>
  </>;
}

function IntroAside({ bio, t }: { bio: string; t: T }) {
  const text = bio.trim();
  const opening = text.split(/(?<=[。．.!?！？])/u)[0]?.trim() ?? "";
  return <>
    <AsideLabel>{t({ ja: "使われる場所", zh: "用在哪里", en: "Where it's used" })}</AsideLabel>
    <div className={styles.asideCard}>
      <div className={styles.row}><MacTile emoji="🎟️" tone="blue" size="sm" /><b className={styles.small}>{t({ ja: "イベントのプロフィール", zh: "活动资料", en: "Event profile" })}</b></div>
      <div className={`${styles.sub} ${styles.clamp}`}>{text || "—"}</div>
    </div>
    <div className={styles.asideCard}>
      <div className={styles.row}><MacTile emoji="✉️" tone="pink" size="sm" /><b className={styles.small}>{t({ ja: "メール下書きの冒頭", zh: "邮件草稿开头", en: "Email draft opening" })}</b></div>
      <div className={`${styles.sub} ${styles.useText}`}>{opening ? t({ ja: `「突然のご連絡失礼いたします。${opening}…」`, zh: `「冒昧打扰。${opening}…」`, en: `“Sorry to reach out out of the blue. ${opening}…”` }) : "—"}</div>
      <div className={`${styles.lbl} ${styles.useText}`}>{t({ ja: "メール・メッセージは下書きまで。送信はあなたが行います。", zh: "邮件和消息只到草稿，由你来发送。", en: "Emails and messages stop at drafts; you send them." })}</div>
    </div>
  </>;
}

function ImportAside({ t }: { t: T }) {
  return <>
    <AsideLabel>{t({ ja: "取り込むと見えるもの", zh: "导入后能看到", en: "What importing unlocks" })} <SampleTag /></AsideLabel>
    <div className={`${styles.asideCard} ${styles.faded}`}>
      <div className={styles.lbl}>{t({ ja: "つながり", zh: "人脉", en: "Connections" })}</div>
      <div className={styles.big}>24<small>{t({ ja: "人", zh: "人", en: "people" })}</small></div>
      <GhostRow>{t({ ja: "プランに合いそうな人 3名", zh: "符合计划的人 3 位", en: "3 people who fit your plan" })}</GhostRow>
      <GhostRow>{t({ ja: "重複の統合 1件", zh: "合并重复 1 处", en: "1 duplicate merged" })}</GhostRow>
    </div>
    <div className={`${styles.asideCard} ${styles.flat}`}>
      <div className={styles.sub}>{t({ ja: "今は取り込まずに進むと、サンプルの人脈で使い方を確認できます。あとからいつでも追加できます。", zh: "现在不导入也可以继续，先用示例人脉看看怎么用，之后随时可以添加。", en: "Skip for now to try Orbit with a sample network; add your own cards any time." })}</div>
    </div>
  </>;
}
