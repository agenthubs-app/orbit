import { getOrbitEventDetailViewModel } from "../../orbit-landing-route-view-model";
import { OrbitLangRuntime } from "../../orbit-lang-runtime";
import { OrbitReferenceStyles } from "../../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../../orbit-visual-freeze-runtime";
import { OrbitRealEventDetail } from "./orbit-real-event-detail";

export default async function AppEventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <>
      <OrbitReferenceStyles />
      <OrbitRealEventDetail event={getOrbitEventDetailViewModel(id)} />
      <OrbitLangRuntime />
      <OrbitVisualFreezeRuntime />
    </>
  );
}
