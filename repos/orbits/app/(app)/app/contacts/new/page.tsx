/**
 * 新建/扫描联系人页 route adapter。
 *
 * 复用联系人 view model，实际扫描和草稿 UI 在 `OrbitRealCardsScan` 中。
 */
import { getOrbitContactsViewModel } from "../../orbit-contacts-route-view-model";
import { getOrbitServerLanguage, localizeOrbitTree } from "../../orbit-language-server";
import { OrbitReferenceStyles } from "../../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../../orbit-visual-freeze-runtime";
import { OrbitRealCardsScan } from "../orbit-real-contacts";

export default async function AppContactScanPage() {
  const language = await getOrbitServerLanguage();

  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      <OrbitRealCardsScan viewModel={localizeOrbitTree(getOrbitContactsViewModel(), language)} />
    </>
  );
}
