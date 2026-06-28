import { getOrbitAdminViewModel } from "../../orbit-admin-platform-route-view-model";
import { OrbitLangRuntime } from "../../orbit-lang-runtime";
import { OrbitReferenceStyles } from "../../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../../orbit-visual-freeze-runtime";
import { OrbitRealAdminEvents } from "../orbit-real-admin";

export default function AdminEventsPage() {
  return (
    <>
      <OrbitReferenceStyles />
      <OrbitLangRuntime />
      <OrbitVisualFreezeRuntime />
      <OrbitRealAdminEvents viewModel={getOrbitAdminViewModel()} />
    </>
  );
}
