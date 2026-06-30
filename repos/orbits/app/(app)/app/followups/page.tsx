/**
 * 跟进日程页 route adapter。
 *
 * route 负责生成 schedule view model；提醒、任务和跟进列表由 `OrbitRealSchedule` 渲染。
 */
import { getOrbitServerLanguage, localizeOrbitTree } from "../orbit-language-server";
import { OrbitReferenceStyles } from "../orbit-reference-styles";
import { getOrbitScheduleViewModel } from "../orbit-schedule-route-view-model";
import { OrbitVisualFreezeRuntime } from "../orbit-visual-freeze-runtime";
import { OrbitRealSchedule } from "./orbit-real-schedule";

export default async function AppSchedulePage() {
  const language = await getOrbitServerLanguage();
  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      <OrbitRealSchedule viewModel={localizeOrbitTree(getOrbitScheduleViewModel(), language)} />
    </>
  );
}
