import { getOrbitOrganizerPublicViewModel } from "../../orbit-organizer-route-view-model";
import { OrbitLangRuntime } from "../../orbit-lang-runtime";
import { OrbitRealOrganizerPublic } from "../orbit-real-organizer-public";
import { OrbitReferenceStyles } from "../../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../../orbit-visual-freeze-runtime";

export default async function AppOrganizerPublicPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <>
      <OrbitReferenceStyles />
      <OrbitRealOrganizerPublic viewModel={getOrbitOrganizerPublicViewModel(slug)} />
      <OrbitLangRuntime />
      <OrbitVisualFreezeRuntime />
    </>
  );
}
