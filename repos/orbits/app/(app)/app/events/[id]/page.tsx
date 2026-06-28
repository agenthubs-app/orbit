import { getOrbitServerLanguage, localizeOrbitTree } from "../../orbit-language-server";
import { getOrbitEventDetailViewModel } from "../../orbit-landing-route-view-model";
import { OrbitReferenceStyles } from "../../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../../orbit-visual-freeze-runtime";
import { OrbitRealEventDetail } from "./orbit-real-event-detail";

export default async function AppEventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const language = await getOrbitServerLanguage();

  return (
    <>
      <OrbitReferenceStyles />
      <OrbitRealEventDetail event={localizeOrbitTree(getOrbitEventDetailViewModel(id), language)} />
      <OrbitVisualFreezeRuntime />
    </>
  );
}
