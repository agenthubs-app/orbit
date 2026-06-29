import { getOrbitServerLanguage, localizeOrbitTree } from "../../orbit-language-server";
import { getOrbitAdminViewModel } from "../../orbit-admin-platform-route-view-model";
import { OrbitReferenceStyles } from "../../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../../orbit-visual-freeze-runtime";
import { OrbitRealAdminEvents } from "../orbit-real-admin";

export default async function AdminEventsPage() {
  const language = await getOrbitServerLanguage();
  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      <OrbitRealAdminEvents viewModel={localizeOrbitTree(getOrbitAdminViewModel(), language)} />
    </>
  );
}
