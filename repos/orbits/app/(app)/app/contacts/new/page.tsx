import { OrbitReferenceStyles } from "../../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../../orbit-visual-freeze-runtime";
import { OrbitRealCardsImport } from "../orbit-real-cards-import";

export default async function AppContactScanPage() {
  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      <OrbitRealCardsImport />
    </>
  );
}
