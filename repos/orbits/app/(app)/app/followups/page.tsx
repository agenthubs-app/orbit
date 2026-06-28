import { OrbitLangRuntime } from "../orbit-lang-runtime";
import { OrbitReferenceStyles } from "../orbit-reference-styles";
import { getOrbitScheduleViewModel } from "../orbit-schedule-route-view-model";
import { OrbitVisualFreezeRuntime } from "../orbit-visual-freeze-runtime";
import { OrbitRealSchedule } from "./orbit-real-schedule";

export default function AppSchedulePage() {
  return (
    <>
      <OrbitReferenceStyles />
      <OrbitLangRuntime />
      <OrbitVisualFreezeRuntime />
      <OrbitRealSchedule viewModel={getOrbitScheduleViewModel()} />
    </>
  );
}
