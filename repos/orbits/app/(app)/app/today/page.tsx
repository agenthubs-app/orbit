/**
 * Today 工作台 route adapter — T1 骨架合并 + T2 决策卡原位展开
 * （design doc §1-§2, §5, §7）。
 *
 * 三个来源（账本 / 关系安排 / 跟进日程）并行加载，任一失败只降级它自己的区块
 * （见 today-merged-view-model.ts）。左栏是时间脊柱（月历+当日|本月+时间轴，
 * 抽自旧日历页）；右栏是行动流：需要你决定（原位展开的决策卡）→ 可复核安排
 * （抽自关系安排页）→ ORBIT 已准备/最近完成（默认折叠）。
 *
 * T2 把右栏"决策卡列表 + 常驻详情面板"两块拆分布局，改成一块 accordion 列表
 * ——详情面板 `OrbitTodayDecisionPanel` 不再作为独立栏渲染，它的内容现在内嵌
 * 在展开的决策卡里（orbit-real-today.tsx 的 `DecisionEntryCard`）。这里只需
 * 要把 `?entry=` 的原始值（不是 view-model 里默认选中第一条的
 * `selectedEntry`——没有 `?entry=` 时必须没有任何卡片是展开的，见 T2 需求 1）
 * 和 `?date=`/`?view=` 一起传给 `OrbitRealToday`。
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
import { OrbitTodayHeaderActions } from "./orbit-today-header-actions";
import { OrbitTodayTimeSpine } from "./orbit-today-time-spine";

function readRawParam(
  searchParams: AppTodayMergedSearchParams | undefined,
  key: string,
): string | undefined {
  const value = searchParams?.[key];

  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0];

  return undefined;
}

function greetingHeadline(today: AppTodayMergedViewModel["today"]): string {
  if (today.state === "failure") return "今天的账本暂时读不出来。";
  if (today.decideCount === 0) return "今晚没有需要你决定的事。";
  return `今晚有 ${today.decideCount} 件事需要你决定。`;
}

function RouteStateRecoveryActions({
  recoveryActions,
}: {
  recoveryActions: readonly { href: string; label: string }[];
}) {
  if (recoveryActions.length === 0) return null;

  return (
    <div aria-label="恢复操作" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {recoveryActions.map((action) => (
        <a className="btn btn-ghost btn-sm" href={action.href} key={action.href}>
          {action.label}
        </a>
      ))}
    </div>
  );
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
  const recoveryActions =
    followups.state === "route-state" ? followups.routeState.recoveryActions : [];

  return (
    <div className="card" data-orbit-today-time-spine-error style={{ display: "flex", flexDirection: "column", gap: 8, padding: 22 }}>
      <div className="eyebrow">日程</div>
      <h2 style={{ fontSize: 18, margin: "8px 0 0" }}>{copy.title}</h2>
      <p style={{ color: "var(--text-2)", fontSize: 14, margin: 0 }}>{copy.description}</p>
      {copy.guardrail ? (
        <p style={{ color: "var(--text-3)", fontSize: 13, margin: 0 }}>{copy.guardrail}</p>
      ) : null}
      <RouteStateRecoveryActions recoveryActions={recoveryActions} />
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
      : { description: "重新加载今天的工作台，或稍后再试。", guardrail: "", title: "可复核安排暂时无法加载" };
  const recoveryActions =
    schedule.state === "route-state" ? schedule.routeState.recoveryActions : [];

  return (
    <div className="card" data-orbit-today-arrangements-error style={{ display: "flex", flexDirection: "column", gap: 8, padding: 22 }}>
      <div className="eyebrow">可复核安排</div>
      <h2 style={{ fontSize: 18, margin: "8px 0 0" }}>{copy.title}</h2>
      <p style={{ color: "var(--text-2)", fontSize: 14, margin: 0 }}>{copy.description}</p>
      {copy.guardrail ? (
        <p style={{ color: "var(--text-3)", fontSize: 13, margin: 0 }}>{copy.guardrail}</p>
      ) : null}
      <RouteStateRecoveryActions recoveryActions={recoveryActions} />
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
  const resolvedSearchParams = await searchParams;
  const merged = await loadAppTodayMergedViewModel(resolvedSearchParams);
  const language = await getTodayPageLanguage();
  const localizedToday = localizeOrbitTree(merged.today, language);
  const localizedSchedule = localizeOrbitTree(merged.schedule, language);
  const localizedTimeSpine = merged.timeSpine
    ? localizeOrbitTree(merged.timeSpine, language)
    : null;
  const headerConnections = localizedTimeSpine ? localizedTimeSpine.connections : [];

  // The raw `?entry=` param, not `merged.today.selectedEntry` — that
  // view-model field defaults to the first decide entry even when no
  // `?entry=` is present (kept for the legacy route-view-model contract/
  // tests), but the accordion must show zero expanded cards until the user
  // (or a deep link) explicitly asks for one.
  const expandedEntryId = readRawParam(resolvedSearchParams, "entry") ?? null;
  const preserveParams: Readonly<Record<string, string>> = {
    ...(readRawParam(resolvedSearchParams, "date")
      ? { date: readRawParam(resolvedSearchParams, "date")! }
      : {}),
    ...(readRawParam(resolvedSearchParams, "view")
      ? { view: readRawParam(resolvedSearchParams, "view")! }
      : {}),
  };

  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      <main data-orbit-real-page="today" style={{ background: "var(--bg)", color: "var(--text)", minHeight: "100dvh" }}>
        <AccountTopNav active="today" />
        <div data-orbit-route="app-today-route" style={{ margin: "0 auto", maxWidth: 1180, padding: "28px 24px 96px" }}>
          <style>{`
            .orbit-today-columns {
              align-items: start;
              display: grid;
              gap: 28px;
              grid-template-areas: "spine decide" "spine arrangements" "spine collapsed";
              grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
              grid-template-rows: auto auto 1fr;
            }
            .orbit-today-columns > [data-orbit-today-spine-column] { grid-area: spine; }
            .orbit-today-columns > [data-orbit-today-decide-column] { grid-area: decide; }
            .orbit-today-columns > [data-orbit-today-arrangements-column] { grid-area: arrangements; }
            .orbit-today-columns > [data-orbit-today-collapsed-column] { grid-area: collapsed; }
            /* ≤760 单列，顺序=决策→时间轴→安排→折叠区（design doc §3）：
               grid-template-areas 换成单列纵向堆叠，跟桌面端"左栏时间脊柱/
               右栏行动流"的两栏顺序（时间脊柱在前）刻意不同——决策优先。 */
            @media (max-width: 760px) {
              .orbit-today-columns {
                grid-template-areas: "decide" "spine" "arrangements" "collapsed";
                grid-template-columns: minmax(0, 1fr);
                grid-template-rows: auto auto auto auto;
              }
            }
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
                  其余的 Orbit 已经准备好了 —— 确认后执行；支持补偿的操作可撤销。
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

            <div data-orbit-today-decide-column>
              <OrbitRealToday
                expandedEntryId={expandedEntryId}
                onlyKeys={["decide"]}
                preserveParams={preserveParams}
                viewModel={localizedToday}
              />
            </div>

            <div data-orbit-today-arrangements-column id="arrangements">
              {localizedSchedule.state === "success" ? (
                <OrbitTodayArrangements
                  arrangements={localizedSchedule.arrangements}
                  dimmedIds={merged.dimmedArrangementIds}
                  evidenceCount={localizedSchedule.evidenceIds.length}
                />
              ) : (
                <ArrangementsErrorCard schedule={localizedSchedule} />
              )}
            </div>

            <div data-orbit-today-collapsed-column>
              <OrbitRealToday
                expandedEntryId={expandedEntryId}
                onlyKeys={["prepared", "recent"]}
                preserveParams={preserveParams}
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
