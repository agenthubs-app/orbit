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
