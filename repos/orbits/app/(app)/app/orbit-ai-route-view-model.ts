import type {
  OrbitAiCommandLink,
  OrbitAiLanguage,
  OrbitAiLanguageOption,
  OrbitAiOrbitContact,
  OrbitAiPanel,
  OrbitAiStageItem,
} from "../../../features/orbit-ai/contract";
import { createOrbitAiCommandService } from "../../../features/orbit-ai/service-factory";

// Orbit AI route view-model 是旧命令中心的页面适配层。
// 它把 features/orbit-ai 的 command payload 转成 React 组件更容易消费的 UI 字段。
export type OrbitAiCommandSearchParams = Record<
  string,
  string | string[] | undefined
>;

export type AppOrbitAiPanel = OrbitAiPanel;
export type AppOrbitAiLanguage = OrbitAiLanguage;

export interface AppOrbitAiCommandLinkViewModel
  extends Pick<OrbitAiCommandLink, "href" | "label" | "panel"> {}

export interface AppOrbitAiLanguageOptionViewModel
  extends Pick<OrbitAiLanguageOption, "active" | "href" | "label" | "language"> {}

export interface AppOrbitAiOrbitContactViewModel
  extends Pick<OrbitAiOrbitContact, "initials" | "label" | "orbit"> {}

export interface AppOrbitAiStageItemViewModel
  extends Pick<
    OrbitAiStageItem,
    "actionLabel" | "body" | "href" | "label" | "title"
  > {}

export interface AppOrbitAiCommandViewModel {
  assistantMessage: string;
  commandLinks: readonly AppOrbitAiCommandLinkViewModel[];
  evidenceIds: readonly string[];
  isChinesePrimary: boolean;
  language: AppOrbitAiLanguage;
  languageOptions: readonly AppOrbitAiLanguageOptionViewModel[];
  orbitContacts: readonly AppOrbitAiOrbitContactViewModel[];
  panel: AppOrbitAiPanel;
  primaryStageHref: string;
  primaryStageLabel: string;
  prompt: string;
  stageItems: readonly AppOrbitAiStageItemViewModel[];
  stageSubtitle: string;
  stageTitle: string;
}

// Next.js searchParams 可能是 string 或 string[]；页面只取第一个值作为命令输入。
function readSearchParam(
  searchParams: OrbitAiCommandSearchParams | undefined,
  key: string,
): string | null {
  const value = searchParams?.[key];

  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

// 加载命令中心视图模型：这里只调用 command service，不执行 live conversation 或外部动作。
export async function loadOrbitAiCommandViewModel(
  searchParams?: OrbitAiCommandSearchParams,
): Promise<AppOrbitAiCommandViewModel> {
  const service = createOrbitAiCommandService();
  const result = await service.getCommandCenter({
    language: readSearchParam(searchParams, "lang"),
    panel: readSearchParam(searchParams, "panel"),
    prompt: readSearchParam(searchParams, "prompt"),
  });
  const data = result.data;
  const primaryStageItem = data.stageItems[0];

  return {
    assistantMessage: data.assistantMessage,
    commandLinks: data.commandLinks.map((link) => ({
      href: link.href,
      label: link.label,
      panel: link.panel,
    })),
    evidenceIds: data.evidenceIds,
    isChinesePrimary: data.language === "zh",
    language: data.language,
    languageOptions: data.languageOptions.map((option) => ({
      active: option.active,
      href: option.href,
      label: option.label,
      language: option.language,
    })),
    orbitContacts: data.orbitContacts.map((contact) => ({
      initials: contact.initials,
      label: contact.label,
      orbit: contact.orbit,
    })),
    panel: data.panel,
    primaryStageHref: primaryStageItem?.href ?? data.stageCtaHref,
    primaryStageLabel: primaryStageItem?.actionLabel ?? data.stageCtaLabel,
    prompt: data.prompt,
    stageItems: data.stageItems.map((item) => ({
      actionLabel: item.actionLabel,
      body: item.body,
      href: item.href,
      label: item.label,
      title: item.title,
    })),
    stageSubtitle: data.stageSubtitle,
    stageTitle: data.stageTitle,
  };
}
