/** Dev builds only: boards A1–A7 with their own sample data, for the pixel gate (compare-redesign-app). Reads and writes nothing. */
import { useEffect, useRef } from "react";
import { View, type ScrollView, type TextInput } from "react-native";

import { useOrbitLocale } from "../../../i18n/OrbitLocaleContext";
import { EmailVerificationContext } from "../../../email-verification/EmailVerificationContext";
import { EMPTY_BASIC, GOAL_LIMIT, GOAL_OPTIONS, ONBOARDING_STEPS, type OnboardingMissingField } from "../../../view-models/profile-onboarding";
import { BottomSheet } from "../../../components/ui";
import { INDUSTRY_CATALOG } from "../../../api/domain/industries";
import { KitButton, MissLine, OnboardingFrame, OnboardingProgress, OnboardingTopBar, OnceNotice, PickList } from "./OnboardingParts";
import { GoalsStep, IntroStep, ProfileStep, type Marks } from "./OnboardingSteps";
import samples from "./onboarding-design-samples.json";

const BOARDS = ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A1b", "A2b", "C11", "C12", "C13", "C14", "R10", "R11", "R12"] as const;
type Board = (typeof BOARDS)[number];
export const isOnboardingBoard = (value: unknown): value is Board => BOARDS.includes(value as Board);

const nothing = () => undefined;
const CARD: Marks = { name: "card", company: "card", title: "card", email: "card", phone: "card", homeMarket: "card", seniorityLevel: "ai", primaryIndustryId: "ai", secondaryIndustryId: "ai" };
/** A5 is A4 scrolled until the second heading sits 250 under the top of the page (`data-off`): 534.09375 on the board at UX-1 sizes. */
/** A1b / A2b: step ① below its first screen. */
const SECOND_SCREEN = 400;
const A5_SCROLL = 534.09375;

export function OnboardingDesignBoard({ board, notice = false }: { board: Board; notice?: boolean }) {
  // The signed-in account's own reminder stays off the A boards.
  return notice ? <OnboardingBoard board={board} /> : <EmailVerificationContext.Provider value={null}><OnboardingBoard board={board} /></EmailVerificationContext.Provider>;
}

function OnboardingBoard({ board }: { board: Board }) {
  if (board.startsWith("C") || board.startsWith("R")) return <RedoBoard board={board} key={board} />;
  return <ThreeStepBoard board={board} />;
}

/**
 * ui-redo-proposal.html：UR-C11–C14（引导 ① 联系方式，滚到联系方式处）与 UR-R10–R12（迁移账号补资料）。示例数据照画板。
 */
function RedoBoard({ board }: { board: Board }) {
  const { t, language } = useOrbitLocale();
  const scroll = useRef<ScrollView | null>(null);
  const inputs = { name: useRef<TextInput | null>(null), primary: useRef<View | null>(null), secondary: useRef<View | null>(null) };
  const repair = board.startsWith("R");
  useEffect(() => {
    if (repair) return;
    const timer = setTimeout(() => scroll.current?.scrollToEnd({ animated: false }), 2500);
    return () => clearTimeout(timer);
  }, [repair]);
  if (repair) {
    const saving = board === "R12";
    const basic = { ...EMPTY_BASIC, name: samples.repairName, ...(saving ? { primaryIndustryId: "finance_investment" as const, secondaryIndustryId: "finance_investment.venture_capital" as const } : {}) };
    const options = INDUSTRY_CATALOG.map(item => ({ id: item.id as string, label: item.labels[language] }));
    return (
      <>
        <OnboardingFrame scrollRef={scroll} footer={<KitButton block disabled={saving} label={t(saving ? "onboarding.v3.repairSaving" : "onboarding.v3.repairSave")} onPress={nothing} size="xl" variant="primary" />}>
          <OnboardingTopBar onLogout={nothing} title={t("onboarding.v3.repairBar")} />
          <View style={saving ? { opacity: 0.55 } : undefined}>
            <ProfileStep basic={basic} birthLabel={null} disabled={saving} errors={new Set()} inputs={inputs} marks={{}} onBirth={nothing} onClearBirth={nothing} onFieldLayout={nothing} onPick={nothing} onScan={nothing} onText={nothing}
              repair={{ birthDate: false, carriedName: samples.repairName }} scan={{ kind: "idle" }} />
          </View>
        </OnboardingFrame>
        <BottomSheet accessibilityLabel={t("onboarding.v3.pickIndustry")} onClose={nothing} scrollEnabled={false} visible={board === "R11"}>
          <PickList count={options.length} onClose={nothing} onPick={nothing} options={options} selected="finance_investment" title={t("onboarding.v3.pickIndustry")} />
        </BottomSheet>
      </>
    );
  }
  const card = board === "C12";
  const fmt = board === "C14";
  const miss = board === "C13";
  const basic = { ...EMPTY_BASIC, ...(card ? samples.basic : fmt ? { email: "sato@minatolink" } : {}) };
  const summary = miss ? t("onboarding.v3.missing", { count: 1, fields: t("onboarding.v3.contactName") }) : fmt ? t("onboarding.v3.checkEmailFormat") : null;
  return (
    <OnboardingFrame scrollRef={scroll} footer={<>
      {summary ? <MissLine text={summary} /> : null}
      <KitButton block label={t("onboarding.v3.next")} onPress={nothing} size="xl" variant="primary" />
    </>}>
      <OnboardingTopBar onLogout={nothing} />
      <OnboardingProgress eta={t("onboarding.v3.eta")} index={0} label={t("onboarding.v3.step", { step: 1, total: 3, name: t("onboarding.v3.step.profile") })} total={3} />
      <OnceNotice scan />
      <ProfileStep basic={basic} birthLabel={null} disabled={false} errors={new Set<OnboardingMissingField>(miss || fmt ? ["contact"] : [])} inputs={inputs} marks={card ? CARD : {}}
        onBirth={nothing} onClearBirth={nothing} onFieldLayout={nothing} onPick={nothing} onScan={nothing} onText={nothing} scan={card ? { kind: "done", card: 6, ai: 3 } : { kind: "idle" }}
        {...(card ? { industry: { primary: samples.industry, secondary: samples.detail } } : {})} />
    </OnboardingFrame>
  );
}

function ThreeStepBoard({ board }: { board: Board }) {
  const { t } = useOrbitLocale();
  const scroll = useRef<ScrollView | null>(null);
  const inputs = { name: useRef<TextInput | null>(null), primary: useRef<View | null>(null), secondary: useRef<View | null>(null) };
  const bio = useRef<TextInput | null>(null);
  const index = Number(board[1]) <= 3 ? 0 : board === "A7" ? 2 : 1;
  const step = ONBOARDING_STEPS[index]!;
  const error = board === "A3" || board === "A6";
  const goals = error ? [] : GOAL_OPTIONS.slice(0, 2).map(option => option.ja);
  const scanned = board === "A2" || board === "A2b";
  useEffect(() => {
    const y = board === "A5" ? A5_SCROLL : board.endsWith("b") ? SECOND_SCREEN : null;
    if (y === null) return;
    const timer = setTimeout(() => scroll.current?.scrollTo({ y, animated: false }), 1500);
    return () => clearTimeout(timer);
  }, [board]);
  const missing = error ? t("onboarding.v3.missing", index === 0
    ? { count: 2, fields: [t("onboarding.v3.name"), t("onboarding.v3.primaryIndustry")].join(t("onboarding.v3.missingSeparator")) }
    : { count: 1, fields: t("onboarding.v3.missGoalsName") }) : null;
  const name = { profile: t("onboarding.v3.step.profile"), goals: t("onboarding.v3.step.goals"), intro: t("onboarding.v3.step.intro") }[step];
  return (
    <OnboardingFrame scrollRef={scroll} footer={<>
      {missing ? <MissLine text={missing} /> : null}
      <KitButton block label={t(step === "intro" ? "onboarding.v3.start" : "onboarding.v3.next")} onPress={nothing} size="xl" variant="primary" trailing={step === "goals" && goals.length ? t("onboarding.v3.nextGoals", { count: goals.length, limit: GOAL_LIMIT }) : undefined} />
    </>}>
      <OnboardingTopBar onBack={index ? nothing : undefined} onLogout={nothing} />
      <OnboardingProgress eta={t("onboarding.v3.eta")} index={index} label={t("onboarding.v3.step", { step: index + 1, total: 3, name })} total={3} />
      <OnceNotice scan={index === 0} />
      {step === "profile" ? (
        <ProfileStep basic={scanned ? { ...EMPTY_BASIC, ...samples.basic, seniorityLevel: "c_level" } : EMPTY_BASIC} birthLabel={null} disabled={false} errors={new Set<OnboardingMissingField>(board === "A3" ? ["name", "primaryIndustry"] : [])} inputs={inputs} marks={scanned ? CARD : {}}
          onBirth={nothing} onClearBirth={nothing} onFieldLayout={nothing} onPick={nothing} onScan={nothing} onText={nothing} scan={scanned ? { kind: "done", card: 6, ai: 3 } : { kind: "idle" }}
          {...(scanned ? { industry: { primary: samples.industry, secondary: samples.detail } } : {})} />
      ) : step === "goals" ? (
        <GoalsStep disabled={false} error={error} focus={error ? "" : samples.focus} goals={goals} marks={{ offer: "ai", topics: "ai" }} offer={samples.offer.values} onFocus={nothing} onGoal={nothing} onGoalsLayout={nothing} onGroup={nothing}
          rest={{ offer: samples.offer.rest, seek: error ? samples.seek.none : samples.seek.rest, topics: samples.topics.rest }} seek={error ? [] : samples.seek.values} seekSuggestions={error ? [] : samples.seek.ai} topics={samples.topics.values} />
      ) : (
        <IntroStep bio={samples.intro} bioCount={{ count: samples.intro.length, limit: 200, over: false }} disabled={false} editing={false} error={null} goals={2} input={bio} message={null} offer={3} onBio={nothing} onCardLayout={nothing} onEdit={nothing} onRegenerate={nothing} onTone={nothing}
          regenerationsLeft={2} status="ready" tone="native" topics={3} />
      )}
    </OnboardingFrame>
  );
}
