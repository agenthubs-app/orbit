import type { OrbitLanguage } from "../orbit-language-core";
import type {
  AppTodayRouteViewModel,
  TodaySectionKey,
} from "./compose-app-today-from-agent-ledger/today-route-view-model";

const TODAY_SECTION_TITLES: Record<
  OrbitLanguage,
  Record<TodaySectionKey, string>
> = {
  en: {
    decide: "Needs your decision",
    prepared: "Prepared by Orbit",
    recent: "Recent activity",
  },
  ja: {
    decide: "判断が必要",
    prepared: "Orbit が準備済み",
    recent: "最近の動き",
  },
  zh: {
    decide: "需要你决定",
    prepared: "ORBIT 已准备",
    recent: "最近动态",
  },
};

const NATURAL_ACTION_TITLES: Record<
  OrbitLanguage,
  Readonly<Record<string, string>>
> = {
  en: {
    "保存到 Agent Memory": "Save to Agent Memory",
    "保存消息草稿": "Save message draft",
    "创建提醒": "Create reminder",
    "创建跟进任务": "Create follow-up task",
    "同步到 Google Calendar": "Sync to Google Calendar",
    "同步到 Microsoft Calendar": "Sync to Microsoft Calendar",
  },
  ja: {
    "保存到 Agent Memory": "Agent Memory に保存",
    "保存消息草稿": "メッセージ下書きを保存",
    "创建提醒": "リマインダーを作成",
    "创建跟进任务": "フォローアップタスクを作成",
    "同步到 Google Calendar": "Google カレンダーに同期",
    "同步到 Microsoft Calendar": "Microsoft カレンダーに同期",
  },
  zh: {},
};

// The prototype dictionary does not contain the Today ledger headings. Present
// them by stable section key so terminal failures, cancellations, rejections,
// completions, and undos share a truthful "activity" label in every language.
export function presentTodaySectionTitles(
  model: AppTodayRouteViewModel,
  language: OrbitLanguage,
): AppTodayRouteViewModel {
  const titles = TODAY_SECTION_TITLES[language];
  const actionTitles = NATURAL_ACTION_TITLES[language];
  const presentEntry = (
    entry: NonNullable<AppTodayRouteViewModel["selectedEntry"]>,
  ) => ({
    ...entry,
    title: actionTitles[entry.title] ?? entry.title,
  });

  return {
    ...model,
    sections: model.sections.map((section) => ({
      ...section,
      entries: section.entries.map(presentEntry),
      title: titles[section.key],
    })),
    selectedEntry: model.selectedEntry
      ? presentEntry(model.selectedEntry)
      : null,
  };
}
