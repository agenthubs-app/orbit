import { useLocalSearchParams } from "expo-router";

import { withOnlineOnlyRoute } from "../../../../src/components/OnlineOnlyBoundary";
import { withOrbitPrivateRoute } from "../../../../src/components/OrbitRouteAccessBoundary";
import { ContactsImportScreen, LinkedInImportScreen } from "../../../../src/screens/add/import/ImportScreens";

// R16 人脈を追加 › その他 (DESIGN §2.7): `?kind=contacts` 連絡先 (b9 A2 ① ② ③), `?kind=linkedin` (b9 A3 ①).
// Online-only: the import batch lives on the server (docs/offline/page-inventory.md).
function ImportRoute() {
  const params = useLocalSearchParams<{ kind?: string | string[] }>();
  const kind = Array.isArray(params.kind) ? params.kind[0] : params.kind;
  return kind === "linkedin" ? <LinkedInImportScreen /> : <ContactsImportScreen />;
}

export default withOrbitPrivateRoute(withOnlineOnlyRoute(ImportRoute));
