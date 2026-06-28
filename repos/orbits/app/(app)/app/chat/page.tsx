import { OrbitRealAgent } from "../agent/orbit-real-agent";
import { getOrbitServerLanguage, localizeOrbitTree } from "../orbit-language-server";
import { getOrbitAgentViewModel } from "../orbit-agent-route-view-model";
import { OrbitReferenceStyles } from "../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../orbit-visual-freeze-runtime";

export default async function AppChatPage() {
  const language = await getOrbitServerLanguage();
  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      <OrbitRealAgent viewModel={localizeOrbitTree(getOrbitAgentViewModel(), language)} />
    </>
  );
}
