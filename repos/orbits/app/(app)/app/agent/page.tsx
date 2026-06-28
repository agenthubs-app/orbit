import { getOrbitAgentViewModel } from "../orbit-agent-route-view-model";
import { OrbitLangRuntime } from "../orbit-lang-runtime";
import { OrbitReferenceStyles } from "../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../orbit-visual-freeze-runtime";
import { OrbitRealAgent } from "./orbit-real-agent";

export default function AppAgentPage() {
  return (
    <>
      <OrbitReferenceStyles />
      <OrbitLangRuntime />
      <OrbitVisualFreezeRuntime />
      <OrbitRealAgent viewModel={getOrbitAgentViewModel()} />
    </>
  );
}
