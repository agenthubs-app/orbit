/** The six profile choices are distinct from the six plan kinds. */
export const PROFILE_ONBOARDING_GOALS = [
  { id: "funding", zh: "寻找投资", en: "Raise funding", ja: "資金調達", planKind: "fundraising" },
  { id: "customers", zh: "获取客户", en: "Win customers", ja: "新規顧客開拓", planKind: "sales" },
  { id: "hiring", zh: "招聘人才", en: "Hire talent", ja: "採用", planKind: "hiring" },
  { id: "partners", zh: "寻找合作伙伴", en: "Find partners", ja: "提携先探し", planKind: "partnership" },
  { id: "awareness", zh: "提升品牌曝光", en: "Build brand awareness", ja: "認知拡大", planKind: null },
  { id: "research", zh: "学习行业趋势", en: "Learn industry trends", ja: "情報収集", planKind: null },
] as const;

export type ProfileGoalLanguage = "zh" | "en" | "ja";
export type ProfileGoalPlanKind = "fundraising" | "sales" | "hiring" | "partnership";

export function profileGoalChoice(value: string) {
  return PROFILE_ONBOARDING_GOALS.find((item) => item.zh === value || item.en === value || item.ja === value) ?? null;
}

/** Unknown and old free text stays intact; only the six known labels are split. */
export function parseProfileOnboardingGoal(text: string): { choices: string[]; focus: string; raw: string } {
  const raw = text.trim();
  if (!raw) return { choices: [], focus: "", raw };
  const split = raw.match(/^([^]*?)(?:：|: )([^]*)$/u);
  const head = split ? split[1]! : raw;
  const candidates = head.split(/、|, /u).map((item) => item.trim()).filter(Boolean);
  if (candidates.length > 0 && candidates.length <= 2 && candidates.every((item) => profileGoalChoice(item))) {
    return { choices: candidates, focus: split ? split[2]!.trim() : "", raw };
  }
  return { choices: [], focus: raw, raw };
}

export function composeProfileOnboardingGoal(choices: readonly string[], focus: string, language: ProfileGoalLanguage): string {
  if (choices.length > 2) throw new RangeError("Profile onboarding accepts at most two goals.");
  const values = choices.map((choice) => choice.trim()).filter(Boolean);
  const text = focus.trim();
  const head = values.join(language === "en" ? ", " : "、");
  return head && text ? `${head}${language === "en" ? ": " : "："}${text}` : head || text;
}

export function firstProfileGoalForPlan(saved: string): { text: string; suggestedKind: ProfileGoalPlanKind | null } {
  const parsed = parseProfileOnboardingGoal(saved);
  if (!parsed.choices.length) return { text: parsed.raw, suggestedKind: null };
  const choice = parsed.choices[0]!;
  const known = profileGoalChoice(choice);
  return {
    text: parsed.focus ? `${choice}：${parsed.focus}` : choice,
    suggestedKind: known?.planKind ?? null,
  };
}
