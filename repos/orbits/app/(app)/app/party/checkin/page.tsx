/**
 * Party check-in 页 route adapter。
 *
 * 这是现场签到 UI 的入口，只挂载共享样式/runtime 和 check-in 组件。
 */
import { OrbitRealPartyCheckin } from "../../dashboard/orbit-real-party";
import { OrbitReferenceStyles } from "../../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../../orbit-visual-freeze-runtime";

export default function AppPartyCheckinPage() {
  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      <OrbitRealPartyCheckin />
    </>
  );
}
