/**
 * 联系人详情页 route adapter。
 *
 * 从动态路由参数读取 contact id，并把共享联系人 view model 交给详情组件。
 */
import { getOrbitContactsViewModel } from "../../orbit-contacts-route-view-model";
import { getOrbitServerLanguage, localizeOrbitTree } from "../../orbit-language-server";
import { OrbitReferenceStyles } from "../../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../../orbit-visual-freeze-runtime";
import { OrbitRealCardDetail } from "../orbit-real-contacts";

export default async function AppContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const language = await getOrbitServerLanguage();

  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      <OrbitRealCardDetail contactId={id} viewModel={localizeOrbitTree(getOrbitContactsViewModel(), language)} />
    </>
  );
}
