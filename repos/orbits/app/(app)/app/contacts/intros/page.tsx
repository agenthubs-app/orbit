/**
 * 介绍与引荐页 route adapter。
 *
 * 这里只把联系人 view model 接到 intros 视图，具体推荐/引荐 UI 在真实组件中。
 */
import { getOrbitContactsViewModel } from "../../orbit-contacts-route-view-model";
import { getOrbitServerLanguage, localizeOrbitTree } from "../../orbit-language-server";
import { OrbitReferenceStyles } from "../../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../../orbit-visual-freeze-runtime";
import { OrbitRealCardsIntros } from "../orbit-real-contacts";

export default async function AppContactsIntrosPage() {
  const language = await getOrbitServerLanguage();

  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      <OrbitRealCardsIntros viewModel={localizeOrbitTree(getOrbitContactsViewModel(), language)} />
    </>
  );
}
