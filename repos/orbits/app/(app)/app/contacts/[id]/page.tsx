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
