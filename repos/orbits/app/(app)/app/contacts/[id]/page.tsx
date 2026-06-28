import { getOrbitContactsViewModel } from "../../orbit-contacts-route-view-model";
import { OrbitLangRuntime } from "../../orbit-lang-runtime";
import { OrbitReferenceStyles } from "../../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../../orbit-visual-freeze-runtime";
import { OrbitRealCardDetail } from "../orbit-real-contacts";

export default async function AppContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <>
      <OrbitReferenceStyles />
      <OrbitLangRuntime />
      <OrbitVisualFreezeRuntime />
      <OrbitRealCardDetail contactId={id} viewModel={getOrbitContactsViewModel()} />
    </>
  );
}
