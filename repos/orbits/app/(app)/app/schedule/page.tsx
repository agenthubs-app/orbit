/**
 * 日程安排页 route adapter。
 *
 * 页面只消费 schedule route view model；联系人、活动和跟进数据的组合逻辑留在
 * `schedule-route-view-model.ts`，展示层在 `orbit-real-schedule-page.tsx`。
 */
import {
  getOrbitServerLanguage,
  localizeOrbitTree,
} from "../orbit-language-server";
import type { OrbitLanguage } from "../orbit-language-core";
import { OrbitReferenceStyles } from "../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../orbit-visual-freeze-runtime";
import { OrbitRealSchedulePage } from "./orbit-real-schedule-page";
import {
  loadAppScheduleRouteViewModel,
  type AppScheduleSearchParams,
} from "./schedule-route-view-model";

function readSearchParam(
  searchParams: AppScheduleSearchParams | undefined,
  key: string,
): string | undefined {
  const value = searchParams?.[key];

  return Array.isArray(value) ? value[0] : value;
}

async function getSchedulePageLanguage(): Promise<OrbitLanguage> {
  try {
    return await getOrbitServerLanguage();
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("outside a request scope")
    ) {
      return "zh";
    }

    throw error;
  }
}

export default async function AppSchedulePage({
  searchParams,
}: {
  searchParams?: Promise<AppScheduleSearchParams>;
} = {}) {
  const query = await searchParams;
  const language = await getSchedulePageLanguage();
  const routeModel = await loadAppScheduleRouteViewModel({
    scenario: readSearchParam(query, "scenario"),
  });
  const localizedRouteModel = localizeOrbitTree(routeModel, language);

  return (
    <>
      <OrbitReferenceStyles />
      <OrbitRealSchedulePage routeModel={localizedRouteModel} />
      <OrbitVisualFreezeRuntime />
    </>
  );
}
