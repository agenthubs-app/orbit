/**
 * Today 工作台 route adapter — T1 骨架合并 + T2 决策卡原位展开
 * （design doc §1-§2, §5, §7）。
 *
 * 两个权威来源（账本 / 用户明确确认的日程）并行加载，任一失败只降级它自己的区块
 * （见 today-merged-view-model.ts）。左栏是时间脊柱（月历+当日|本月+时间轴）；
 * 右栏是行动流：需要你决定（原位展开的决策卡）→ 已准备的操作/最近动态
 * （默认折叠）。联系人状态、跟进建议和活动库存都不能冒充用户日程。
 *
 * T2 把右栏"决策卡列表 + 常驻详情面板"两块拆分布局，改成一块 accordion 列表
 * ——详情面板 `OrbitTodayDecisionPanel` 不再作为独立栏渲染，它的内容现在内嵌
 * 在展开的决策卡里（orbit-real-today.tsx 的 `DecisionEntryCard`）。这里只需
 * 要把 `?entry=` 的原始值（不是 view-model 里默认选中第一条的
 * `selectedEntry`——没有 `?entry=` 时必须没有任何卡片是展开的，见 T2 需求 1）
 * 和 `?date=`/`?view=` 一起传给 `OrbitRealToday`。
 */
import { AccountTopNav } from "../orbit-account-shell";

import type { AgentLedgerService } from "../../../../features/agent/ledger/service";
import { getOrbitServerLanguage, localizeOrbitTree } from "../orbit-language-server";
import type { OrbitLanguage } from "../orbit-language-core";
import { OrbitReferenceStyles } from "../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../orbit-visual-freeze-runtime";
import {
  createAppTodayMergedLoaders,
  loadAppTodayMergedViewModel,
  type AppTodayMergedRouteControls,
  type AppTodayMergedSearchParams,
  type AppTodayMergedLoaders,
  type AppTodayMergedViewModel,
} from "./compose-app-today-from-agent-ledger/today-merged-view-model";
import { resolveAgentLedgerForServerPage } from "../../../api/_shared/agent-request-context";
import { OrbitRealToday } from "./orbit-real-today";
import { OrbitTodayHeaderActions } from "./orbit-today-header-actions";
import { presentTodaySectionTitles } from "./today-section-presentation";
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

function greetingHeadline(merged: AppTodayMergedViewModel): string {
  if (merged.today.state === "failure" && merged.attention.total === 0) {
    return "今天的日程仍可查看。";
  }
  if (merged.attention.total === 0) return "当前没有待你处理的事。";
  return `当前有 ${merged.attention.total} 件事待你处理。`;
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
  error,
}: {
  error: NonNullable<AppTodayMergedViewModel["timeSpineError"]>;
}) {
  return (
    <div className="card" data-orbit-today-time-spine-error style={{ display: "flex", flexDirection: "column", gap: 8, padding: 22 }}>
      <div className="eyebrow">日程</div>
      <h2 style={{ fontSize: 18, margin: "8px 0 0" }}>{error.title}</h2>
      <p style={{ color: "var(--text-2)", fontSize: 14, margin: 0 }}>{error.description}</p>
      {error.guardrail ? (
        <p style={{ color: "var(--text-3)", fontSize: 13, margin: 0 }}>{error.guardrail}</p>
      ) : null}
      <RouteStateRecoveryActions recoveryActions={error.recoveryActions} />
    </div>
  );
}

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

export default async function AppTodayPageContent({
  searchParams,
  actorId = "test:today-page-content",
  ledgerService,
  loaders,
  routeControls,
}: {
  searchParams?: Promise<AppTodayMergedSearchParams>;
  actorId?: string;
  ledgerService?: AgentLedgerService | null;
  loaders?: AppTodayMergedLoaders;
  routeControls?: AppTodayMergedRouteControls;
} = {}) {
  const resolvedSearchParams = await searchParams;
  const resolvedLedgerService =
    ledgerService === undefined
      ? await resolveAgentLedgerForServerPage()
      : ledgerService;
  const merged = await loadAppTodayMergedViewModel(
    resolvedSearchParams,
    loaders ??
      createAppTodayMergedLoaders(
        resolvedLedgerService,
        actorId,
        routeControls,
      ),
  );
  const language = await getTodayPageLanguage();
  const localizedToday = localizeOrbitTree(
    presentTodaySectionTitles(merged.today, language),
    language,
  );
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
              grid-template-areas: "spine decide" "spine collapsed";
              grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
              grid-template-rows: auto 1fr;
            }
            .orbit-today-columns > [data-orbit-today-spine-column] { grid-area: spine; }
            .orbit-today-columns > [data-orbit-today-decide-column] { grid-area: decide; }
            .orbit-today-columns > [data-orbit-today-collapsed-column] { grid-area: collapsed; }
            /* ≤760 单列，顺序=决策→时间轴→折叠区（design doc §3）：
               grid-template-areas 换成单列纵向堆叠，跟桌面端"左栏时间脊柱/
               右栏行动流"的两栏顺序（时间脊柱在前）刻意不同——决策优先。 */
            @media (max-width: 760px) {
              .orbit-today-columns {
                grid-template-areas: "decide" "spine" "collapsed";
                grid-template-columns: minmax(0, 1fr);
                grid-template-rows: auto auto auto;
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
              <div className="eyebrow">{language === "zh" ? "今天" : language === "ja" ? "今日" : "Today"}</div>
              <h1 style={{ fontSize: 28, lineHeight: 1.25, margin: "10px 0 8px" }}>
                {greetingHeadline(merged)}
              </h1>
              <p style={{ color: "var(--text-2)", fontSize: 14, margin: 0 }}>
                {merged.today.state === "failure"
                  ? "决策账本暂时不可用，已确认日程仍可查看。"
                  : merged.attention.pendingScheduleCount > 0
                    ? `${merged.attention.decisionCount} 项待确认决策 · ${merged.attention.pendingScheduleCount} 项真实约谈待确认。需要你确认的会先问你。`
                    : "其余的 Orbit 都盯着——需要你确认的会先问你，做过的操作大多可以撤销。"}
              </p>
            </div>
            <OrbitTodayHeaderActions connections={headerConnections} />
          </header>

          <div className="orbit-today-columns">
            <div data-orbit-today-spine-column id="arrangements">
              {localizedTimeSpine ? (
                <OrbitTodayTimeSpine
                  initialSelected={merged.calendar.selected}
                  initialView={merged.calendar.view}
                  viewModel={localizedTimeSpine}
                />
              ) : (
                <TimeSpineErrorCard error={merged.timeSpineError!} />
              )}
            </div>

            <div data-orbit-today-decide-column>
              <OrbitRealToday
                expandedEntryId={expandedEntryId}
                language={language}
                onlyKeys={["decide"]}
                preserveParams={preserveParams}
                viewModel={localizedToday}
              />
            </div>

            <div data-orbit-today-collapsed-column>
              <OrbitRealToday
                expandedEntryId={expandedEntryId}
                language={language}
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
