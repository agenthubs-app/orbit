import type { PlanV2SummaryResponse } from "../../../../../shared/contract/plan-v2";
import type { SecretaryPreviewDTO } from "../../../../../shared/contract/secretary-preview";
import type { TodoPageContract } from "../../../../../shared/contract/todo-page";
import { visibleSecretaryItems } from "./secretary-model";

export interface HomeRailSuggestion { key: string; title: string; href: string; source: "secretary" | "today" | "plan" | "schedule" }
export interface HomeRailSources {
  secretary?: SecretaryPreviewDTO | null;
  todo?: TodoPageContract | null;
  plan?: PlanV2SummaryResponse | null;
  schedule?: readonly { id: string; title: string; startsAt: string; state: string }[] | null;
}

/** Only executable, distinct targets contribute to the 1024 header count. */
export function homeRailSuggestions(sources: HomeRailSources): HomeRailSuggestion[] {
  const choices: HomeRailSuggestion[] = [];
  if (sources.secretary) for (const item of visibleSecretaryItems(sources.secretary)) choices.push({ key: item.key, title: item.notification.title,
    href: item.notification.target.href!, source: "secretary" });
  const move = sources.todo?.nextMoves.items[0];
  if (move) choices.push({ key: `move:${move.key}`, title: move.titlePreview,
    href: move.taskId ? `/app/tasks?tab=todo&task=${encodeURIComponent(move.taskId)}` : "/app/tasks?tab=todo", source: "today" });
  const chance = sources.plan?.current?.todayChance;
  if (chance?.href) choices.push({ key: `plan:${sources.plan!.current!.planId}`, title: chance.label, href: chance.href, source: "plan" });
  const next = sources.schedule?.filter(item => item.state === "upcoming" && Number.isFinite(Date.parse(item.startsAt)))
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))[0];
  if (next) choices.push({ key: `schedule:${next.id}`, title: next.title, href: "/app/tasks?tab=calendar", source: "schedule" });
  const seen = new Set<string>();
  return choices.filter(item => item.title.trim() && item.href.startsWith("/") && !item.href.startsWith("//")
    && !seen.has(item.href) && (seen.add(item.href), true)).slice(0, 3);
}
