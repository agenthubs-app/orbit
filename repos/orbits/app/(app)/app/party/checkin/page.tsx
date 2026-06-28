import { OrbitRealPartyCheckin } from "../../dashboard/orbit-real-party";
import { OrbitLangRuntime } from "../../orbit-lang-runtime";
import { OrbitReferenceStyles } from "../../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../../orbit-visual-freeze-runtime";

export default function AppPartyCheckinPage() {
  return (
    <>
      <OrbitReferenceStyles />
      <OrbitLangRuntime />
      <OrbitVisualFreezeRuntime />
      <OrbitRealPartyCheckin />
    </>
  );
}
