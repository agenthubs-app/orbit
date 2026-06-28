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
