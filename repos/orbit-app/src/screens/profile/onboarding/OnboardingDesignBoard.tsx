/** Dev builds only: boards A1–A7 with their own sample data, for the pixel gate (compare-redesign-app). Reads and writes nothing. */
import { useEffect, useRef } from "react";
import type { ScrollView, TextInput, View } from "react-native";

import { useOrbitLocale } from "../../../i18n/OrbitLocaleContext";
import { EMPTY_BASIC, GOAL_LIMIT, GOAL_OPTIONS, ONBOARDING_STEPS, type OnboardingMissingField } from "../../../view-models/profile-onboarding";
import { KitButton, MissLine, OnboardingFrame, OnboardingProgress, OnboardingTopBar, OnceNotice } from "./OnboardingParts";
import { GoalsStep, IntroStep, ProfileStep, type Marks } from "./OnboardingSteps";
import samples from "./onboarding-design-samples.json";

const BOARDS = ["A1", "A2", "A3", "A4", "A5", "A6", "A7"] as const;
type Board = (typeof BOARDS)[number];
export const isOnboardingBoard = (value: unknown): value is Board => BOARDS.includes(value as Board);

const nothing = () => undefined;
const CARD: Marks = { name: "card", company: "card", title: "card", email: "card", phone: "card", primaryIndustryId: "ai", secondaryIndustryId: "ai" };
/** A5 is A4 scrolled until the second heading sits 250 under the top of the page (`data-off`): 456 on the board. */
const A5_SCROLL = 456;

export function OnboardingDesignBoard({ board }: { board: Board }) {
  const { t } = useOrbitLocale();
  const scroll = useRef<ScrollView | null>(null);
  const inputs = { name: useRef<TextInput | null>(null), primary: useRef<View | null>(null), secondary: useRef<View | null>(null) };
  const bio = useRef<TextInput | null>(null);
  const index = Number(board[1]) <= 3 ? 0 : board === "A7" ? 2 : 1;
  const step = ONBOARDING_STEPS[index]!;
  const error = board === "A3" || board === "A6";
  const goals = error ? [] : GOAL_OPTIONS.slice(0, 2).map(option => option.ja);
  useEffect(() => {
    if (board !== "A5") return;
    const timer = setTimeout(() => scroll.current?.scrollTo({ y: A5_SCROLL, animated: false }), 1500);
    return () => clearTimeout(timer);
  }, [board]);
  const missing = error ? t("onboarding.v3.missing", index === 0
    ? { count: 2, fields: [t("onboarding.v3.name"), t("onboarding.v3.primaryIndustry")].join(t("onboarding.v3.missingSeparator")) }
    : { count: 1, fields: t("onboarding.v3.missGoalsName") }) : null;
  const name = { profile: t("onboarding.v3.step.profile"), goals: t("onboarding.v3.step.goals"), intro: t("onboarding.v3.step.intro") }[step];
  return (
    <OnboardingFrame scrollRef={scroll} footer={<>
      {missing ? <MissLine text={missing} /> : null}
      <KitButton block label={t(step === "intro" ? "onboarding.v3.start" : "onboarding.v3.next")} onPress={nothing} variant="primary" trailing={step === "goals" && goals.length ? t("onboarding.v3.nextGoals", { count: goals.length, limit: GOAL_LIMIT }) : undefined} />
    </>}>
      <OnboardingTopBar onBack={index ? nothing : undefined} onLogout={nothing} />
      <OnboardingProgress eta={t("onboarding.v3.eta")} index={index} label={t("onboarding.v3.step", { step: index + 1, total: 3, name })} total={3} />
      <OnceNotice scan={index === 0} />
      {step === "profile" ? (
        <ProfileStep basic={board === "A2" ? { ...EMPTY_BASIC, ...samples.basic } : EMPTY_BASIC} birthLabel={null} disabled={false} errors={new Set<OnboardingMissingField>(board === "A3" ? ["name", "primaryIndustry"] : [])} inputs={inputs} marks={board === "A2" ? CARD : {}}
          onBirth={nothing} onClearBirth={nothing} onFieldLayout={nothing} onPick={nothing} onScan={nothing} onText={nothing} scan={board === "A2" ? { kind: "done", card: 5, ai: 2 } : { kind: "idle" }} showEmail={board === "A2"} showPhone={board === "A2"}
          {...(board === "A2" ? { industry: { primary: samples.industry, secondary: samples.detail } } : {})} />
      ) : step === "goals" ? (
        <GoalsStep disabled={false} error={error} focus={error ? "" : samples.focus} goals={goals} marks={{ offer: "ai", topics: "ai" }} offer={samples.offer.values} onFocus={nothing} onGoal={nothing} onGoalsLayout={nothing} onGroup={nothing}
          rest={{ offer: samples.offer.rest, seek: error ? samples.seek.none : samples.seek.rest, topics: samples.topics.rest }} seek={error ? [] : samples.seek.values} seekSuggestions={error ? [] : samples.seek.ai} topics={samples.topics.values} />
      ) : (
        <IntroStep bio={samples.intro} bioCount={{ count: samples.intro.length, limit: 200, over: false }} disabled={false} editing={false} error={null} goals={2} input={bio} message={null} offer={3} onBio={nothing} onCardLayout={nothing} onEdit={nothing} onRegenerate={nothing} onTone={nothing}
          regenerationsLeft={2} status="ready" tone="native" tones={[{ key: "native", label: t("onboarding.v3.toneNative") }, { key: "soft", label: t("onboarding.v3.toneSoft") }, { key: "en", label: t("onboarding.v3.toneEnglish") }]} topics={3} />
      )}
    </OnboardingFrame>
  );
}
