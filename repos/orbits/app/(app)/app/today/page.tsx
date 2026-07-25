/**
 * Today 工作台 route adapter — T1 骨架合并（design doc §1-§2）。
 *
 * 三个来源（账本 / 关系安排 / 跟进日程）并行加载，任一失败只降级它自己的区块
 * （见 today-merged-view-model.ts）。左栏是时间脊柱（月历+当日|本月+时间轴，
 * 抽自旧日历页）；右栏是行动流：需要你决定 → 可复核安排（抽自关系安排页）→
 * ORBIT 已准备/最近完成（默认折叠）。
 */
import { AccountTopNav } from "../orbit-account-shell";
import { getOrbitServerLanguage, localizeOrbitTree } from "../orbit-language-server";
import type { OrbitLanguage } from "../orbit-language-core";
import { OrbitReferenceStyles } from "../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../orbit-visual-freeze-runtime";
import {
  loadAppTodayMergedViewModel,
  type AppTodayMergedSearchParams,
  type AppTodayMergedViewModel,
} from "./compose-app-today-from-agent-ledger/today-merged-view-model";
import { OrbitRealToday } from "./orbit-real-today";
import { OrbitTodayArrangements } from "./orbit-today-arrangements";
import { OrbitTodayDecisionPanel } from "./orbit-today-decision-panel";
import { OrbitTodayHeaderActions } from "./orbit-today-header-actions";
import { OrbitTodayTimeSpine } from "./orbit-today-time-spine";

function greetingHeadline(today: AppTodayMergedViewModel["today"]): string {
  if (today.state === "failure") return "今天的账本暂时读不出来。";
  if (today.decideCount === 0) return "今晚没有需要你决定的事。";
  return `今晚有 ${today.decideCount} 件事需要你决定。`;
}

function TimeSpineErrorCard({
  followups,
}: {
  followups: AppTodayMergedViewModel["followups"];
}) {
  const copy =
    followups.state === "route-state"
      ? followups.routeState.copy
      : { description: "重新加载今天的工作台，或稍后再试。", guardrail: "", title: "时间脊柱暂时无法加载" };

  return (
    <div className="card" data-orbit-today-time-spine-error style={{ display: "flex", flexDirection: "column", gap: 8, padding: 22 }}>
      <div className="eyebrow">日程</div>
      <h2 style={{ fontSize: 18, margin: "8px 0 0" }}>{copy.title}</h2>
      <p style={{ color: "var(--text-2)", fontSize: 14, margin: 0 }}>{copy.description}</p>
    </div>
  );
}

function ArrangementsErrorCard({
  schedule,
}: {
  schedule: AppTodayMergedViewModel["schedule"];
}) {
  const copy =
    schedule.state === "route-state"
      ? schedule.routeState.copy
      : { description: "重新加载今天的工作台，或稍后再试。", title: "可复核安排暂时无法加载" };

  return (
    <div className="card" data-orbit-today-arrangements-error style={{ display: "flex", flexDirection: "column", gap: 8, padding: 22 }}>
      <div className="eyebrow">可复核安排</div>
      <h2 style={{ fontSize: 18, margin: "8px 0 0" }}>{copy.title}</h2>
      <p style={{ color: "var(--text-2)", fontSize: 14, margin: 0 }}>{copy.description}</p>
    </div>
  );
}

export const dynamic = "force-dynamic";

// renderToStaticMarkup(await Page()) in tests calls this outside a real HTTP
// request, where next/headers' headers() throws instead of returning empty
// headers (same fallback schedule/page.tsx already needs for the same
// reason).
async function getTodayPageLanguage(): Promise<OrbitLanguage> {
  try {
    return await getOrbitServerLanguage();
  } catch (error) {
    if (error instanceof Error && error.message.includes("outside a request scope")) {
      return "zh";
    }

    throw error;
  }
}

export default async function AppTodayPage({
  searchParams,
}: {
  searchParams?: Promise<AppTodayMergedSearchParams>;
} = {}) {
  const merged = await loadAppTodayMergedViewModel(await searchParams);
  const language = await getTodayPageLanguage();
  const localizedToday = localizeOrbitTree(merged.today, language);
  const localizedSelectedEntry = localizeOrbitTree(merged.today.selectedEntry, language);
  const localizedSchedule = localizeOrbitTree(merged.schedule, language);
  const localizedTimeSpine = merged.timeSpine
    ? localizeOrbitTree(merged.timeSpine, language)
    : null;
  const headerConnections = localizedTimeSpine ? localizedTimeSpine.connections : [];

  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      <main data-orbit-real-page="today" style={{ background: "var(--bg)", color: "var(--text)", minHeight: "100dvh" }}>
        <AccountTopNav active="today" />
        <div data-orbit-route="app-today-route" style={{ margin: "0 auto", maxWidth: 1180, padding: "28px 24px 96px" }}>
          <style>{`
            .orbit-today-columns { align-items: start; display: grid; gap: 28px; grid-template-columns: minmax(0, 7fr) minmax(0, 5fr); }
            @media (max-width: 760px) { .orbit-today-columns { grid-template-columns: minmax(0, 1fr); } }
          `}</style>

          <header
            data-orbit-today-header
            style={{
              alignItems: "flex-end",
              display: "flex",
              gap: 16,
              justifyContent: "space-between",
              marginBottom: 24,
            }}
          >
            <div>
              <div className="eyebrow">Today</div>
              <h1 style={{ fontSize: 28, lineHeight: 1.25, margin: "10px 0 8px" }}>
                {greetingHeadline(merged.today)}
              </h1>
              {merged.today.state !== "failure" ? (
                <p style={{ color: "var(--text-2)", fontSize: 14, margin: 0 }}>
                  其余的 Orbit 已经准备好了 —— 确认即可完成，所有操作都可撤销。
                </p>
              ) : null}
            </div>
            <OrbitTodayHeaderActions connections={headerConnections} />
          </header>

          <div className="orbit-today-columns">
            <div data-orbit-today-spine-column>
              {localizedTimeSpine ? (
                <OrbitTodayTimeSpine
                  initialSelected={merged.calendar.selected}
                  initialView={merged.calendar.view}
                  viewModel={localizedTimeSpine}
                />
              ) : (
                <TimeSpineErrorCard followups={merged.followups} />
              )}
            </div>

            <div data-orbit-today-action-column style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                <OrbitRealToday onlyKeys={["decide"]} viewModel={localizedToday} />
                <OrbitTodayDecisionPanel entry={localizedSelectedEntry} />
              </div>

              {localizedSchedule.state === "success" ? (
                <OrbitTodayArrangements
                  arrangements={localizedSchedule.arrangements}
                  dimmedIds={merged.dimmedArrangementIds}
                  evidenceCount={localizedSchedule.evidenceIds.length}
                />
              ) : (
                <ArrangementsErrorCard schedule={localizedSchedule} />
              )}

              <OrbitRealToday
                onlyKeys={["prepared", "recent"]}
                suppressStateBoundary
                viewModel={localizedToday}
              />
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
