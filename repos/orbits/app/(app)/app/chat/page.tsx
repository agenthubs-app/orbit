import { OrbitRealAgent } from "../agent/orbit-real-agent";
import { getOrbitAgentViewModel } from "../orbit-agent-route-view-model";
import { OrbitLangRuntime } from "../orbit-lang-runtime";
import { OrbitReferenceStyles } from "../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../orbit-visual-freeze-runtime";

export default function AppChatPage() {
  return (
    <>
      <OrbitReferenceStyles />
      <OrbitLangRuntime />
      <OrbitVisualFreezeRuntime />
      <OrbitRealAgent viewModel={getOrbitAgentViewModel()} />
    </>
  );
}
