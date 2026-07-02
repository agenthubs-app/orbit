/**
 * Agent 页 route adapter。
 *
 * route 只负责挂载样式/runtime，并把 Orbit AI 的真实聊天入口挂到 `/app/agent`。
 */
import { getOrbitServerLanguage, localizeOrbitTree } from "../orbit-language-server";
import { getOrbitAgentViewModel } from "../orbit-agent-route-view-model";
import { OrbitReferenceStyles } from "../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../orbit-visual-freeze-runtime";
import { OrbitRealAgent } from "./orbit-real-agent";

export default async function AppAgentPage() {
  const language = await getOrbitServerLanguage();
  const viewModel = localizeOrbitTree(getOrbitAgentViewModel(), language);

  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      <OrbitRealAgent viewModel={viewModel} />
    </>
  );
}
