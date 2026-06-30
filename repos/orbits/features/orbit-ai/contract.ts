// Orbit AI command contract 是早期 Orbit AI 命令面板的轻量 UI contract。
// 它不同于 live conversation service：这里只返回页面链接、阶段卡片和静态 assistant message。
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

// CommandInput 由 UI 传入语言、当前 panel 和用户 prompt。
export interface OrbitAiCommandInput {
  language?: string | null;
  panel?: string | null;
  prompt?: string | null;
}

// CommandLink/StageItem/OrbitContact 是命令面板的展示 DTO。
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

// CommandPayload 是唯一成功返回形状，sideEffectsExecuted=false 表示没有真实动作。
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
