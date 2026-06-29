import { getOrbitServerLanguage, localizeOrbitTree } from "../orbit-language-server";
import { getOrbitAgentViewModel } from "../orbit-agent-route-view-model";
import { OrbitReferenceStyles } from "../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../orbit-visual-freeze-runtime";
import { OrbitRealAgent } from "./orbit-real-agent";

export default async function AppAgentPage() {
  const language = await getOrbitServerLanguage();
  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      <OrbitRealAgent viewModel={localizeOrbitTree(getOrbitAgentViewModel(), language)} />
    </>
  );
}
