export const ORBIT_AI_PANELS = [
  "home",
  "events",
  "people",
  "followups",
  "schedule",
  "agent",
  "dashboard",
] as const;

export type OrbitAiPanel = (typeof ORBIT_AI_PANELS)[number];

export const ORBIT_AI_LANGUAGES = ["zh", "en"] as const;

export type OrbitAiLanguage = (typeof ORBIT_AI_LANGUAGES)[number];

export interface OrbitAiCommandInput {
  language?: string | null;
  panel?: string | null;
  prompt?: string | null;
}

export interface OrbitAiCommandLink {
  href: string;
  label: string;
  panel: OrbitAiPanel;
}

export interface OrbitAiStageItem {
  actionLabel: string;
  body: string;
  href: string;
  label: string;
  title: string;
}

export interface OrbitAiOrbitContact {
  initials: string;
  label: string;
  orbit: 1 | 2 | 3;
}

export interface OrbitAiLanguageOption {
  active: boolean;
  href: string;
  label: string;
  language: OrbitAiLanguage;
}

export interface OrbitAiCommandPayload {
  assistantMessage: string;
  commandLinks: readonly OrbitAiCommandLink[];
  evidenceIds: readonly string[];
  language: OrbitAiLanguage;
  languageOptions: readonly OrbitAiLanguageOption[];
  orbitContacts: readonly OrbitAiOrbitContact[];
  panel: OrbitAiPanel;
  prompt: string;
  stageCtaHref: string;
  stageCtaLabel: string;
  stageItems: readonly OrbitAiStageItem[];
  stageSubtitle: string;
  stageTitle: string;
  sideEffectsExecuted: false;
}

export interface OrbitAiCommandSuccess {
  success: true;
  data: OrbitAiCommandPayload;
}

export type OrbitAiCommandResult = OrbitAiCommandSuccess;
