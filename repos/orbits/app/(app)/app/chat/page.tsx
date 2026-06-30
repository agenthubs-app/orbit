/**
 * Chat 页 route adapter。
 *
 * 当前 chat 入口复用 Agent 视图模型和真实 Agent 组件，route 只负责语言和样式注入。
 */
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
