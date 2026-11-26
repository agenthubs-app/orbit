import AsyncStorage from "@react-native-async-storage/async-storage";

import { normalizeOrbitApiBaseUrl } from "../api/base-url";
import { isSeniorityLevelValue } from "../api/compute/seniority-group";
import { isDefaultReturnHref, returnHref } from "../view-models/return-href";
import { EMPTY_BASIC, ONBOARDING_STEPS, type BasicDraft, type OnboardingStep } from "../view-models/profile-onboarding";

const RETURN_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/** Where a field's value came from; the mark is dropped as soon as the person edits it. */
export type OnboardingMark = "card" | "ai";
export type OnboardingMarkedField = "name" | "company" | "title" | "email" | "phone" | "lineId" | "wechatId" | "homeMarket" | "seniorityLevel" | "primaryIndustryId" | "secondaryIndustryId" | "offer" | "topics";

/** What was typed but not yet confirmed by 「次へ」, so leaving or killing the App loses nothing. */
export interface OnboardingDraft {
  step: OnboardingStep;
  /** The profile version the values were typed on (null: no profile yet). */
  updatedAt: string | null;
  basic: BasicDraft;
  goals: string[];
  focus: string;
  offer: string[];
  seek: string[];
  topics: string[];
  bio: string;
  headline: string;
  marks: Partial<Record<OnboardingMarkedField, OnboardingMark>>;
  /** How much the last scan filled in: off the card, and inferred. */
  scan: { card: number; ai: number } | null;
}

export type OnboardingVerdict = "required" | "clear";

interface Adapter { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void>; removeItem(key: string): Promise<void> }
interface Scope { actorId: string; baseUrl: string }

const key = (name: string, { actorId, baseUrl }: Scope) => `orbit:onboarding-${name}:v1:${encodeURIComponent(normalizeOrbitApiBaseUrl(baseUrl))}:${encodeURIComponent(actorId)}`;
export const onboardingDraftKey = (scope: Scope) => key("draft", scope);
export const onboardingReturnKey = (scope: Scope) => key("return", scope);
export const onboardingVerdictKey = (scope: Scope) => key("verdict", scope);

/** Step names of the five-step flow land on the step that now holds their fields. */
const FIVE_STEP_NAMES: Readonly<Record<string, OnboardingStep>> = { persona: "goals", import: "intro" };
const text = (value: unknown): string => (typeof value === "string" ? value : "");
const list = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);

export function parseOnboardingDraft(raw: string | null): OnboardingDraft | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const name = text(value.step);
    const step = ONBOARDING_STEPS.find(item => item === name) ?? FIVE_STEP_NAMES[name];
    if (!step) return null;
    const basic = (value.basic && typeof value.basic === "object" ? value.basic : {}) as Record<string, unknown>;
    const scan = value.scan as { card?: unknown; ai?: unknown } | null | undefined;
    const marks = (value.marks && typeof value.marks === "object" ? value.marks : {}) as OnboardingDraft["marks"];
    return {
      step, updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : null,
      basic: { ...Object.fromEntries(Object.keys(EMPTY_BASIC).map(field => [field, text(basic[field])])) as unknown as BasicDraft, seniorityLevel: isSeniorityLevelValue(basic.seniorityLevel) ? basic.seniorityLevel : "" },
      goals: list(value.goals), focus: text(value.focus), offer: list(value.offer), seek: list(value.seek), topics: list(value.topics),
      bio: text(value.bio), headline: text(value.headline), marks,
      scan: scan && typeof scan.card === "number" && typeof scan.ai === "number" ? { card: scan.card, ai: scan.ai } : null,
    };
  } catch {
    return null;
  }
}

export function createProfileOnboardingStorage(adapter: Adapter = AsyncStorage) {
  // One write after another, so an older draft never lands on top of a newer one.
  let queue: Promise<void> = Promise.resolve();
  const enqueue = (operation: () => Promise<void>): Promise<void> => (queue = queue.then(operation, operation).catch(() => undefined));
  return {
    readDraft: async (scope: Scope): Promise<OnboardingDraft | null> => parseOnboardingDraft(await adapter.getItem(onboardingDraftKey(scope)).catch(() => null)),
    writeDraft: (scope: Scope, draft: OnboardingDraft): Promise<void> => enqueue(() => adapter.setItem(onboardingDraftKey(scope), JSON.stringify(draft))),
    clearDraft: (scope: Scope): Promise<void> => enqueue(() => adapter.removeItem(onboardingDraftKey(scope))),
    /** The page onboarding goes back to once finished, kept per account so that killing the App half way does not lose it (30 days). */
    readReturn: async (scope: Scope): Promise<string | null> => {
      try {
        const value = JSON.parse((await adapter.getItem(onboardingReturnKey(scope))) ?? "null") as { href?: unknown; at?: unknown } | null;
        return value && typeof value.href === "string" && typeof value.at === "number" && Date.now() - value.at < RETURN_MAX_AGE_MS ? returnHref(value.href) : null;
      } catch {
        return null;
      }
    },
    /** The default page is not worth remembering: it never replaces one that is. */
    writeReturn: (scope: Scope, href: string): Promise<void> => isDefaultReturnHref(href) ? Promise.resolve() : enqueue(() => adapter.setItem(onboardingReturnKey(scope), JSON.stringify({ href, at: Date.now() }))),
    clearReturn: (scope: Scope): Promise<void> => enqueue(() => adapter.removeItem(onboardingReturnKey(scope))),
    readVerdict: async (scope: Scope): Promise<OnboardingVerdict | null> => {
      const raw = await adapter.getItem(onboardingVerdictKey(scope)).catch(() => null);
      return raw === "required" || raw === "clear" ? raw : null;
    },
    writeVerdict: (scope: Scope, verdict: OnboardingVerdict): Promise<void> => enqueue(() => adapter.setItem(onboardingVerdictKey(scope), verdict)),
  };
}

export const profileOnboardingStorage = createProfileOnboardingStorage();
