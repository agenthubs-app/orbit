import { useLocalSearchParams } from "expo-router";

import { withOnlineOnlyRoute } from "../../../../src/components/OnlineOnlyBoundary";
import { withOrbitPrivateRoute } from "../../../../src/components/OrbitRouteAccessBoundary";
import { addDesignMock } from "../../../../src/screens/add/add-design-mock";
import { isImportDesignName } from "../../../../src/screens/add/import/import-design";
import { ContactsImportScreen, ImportBatchScreen } from "../../../../src/screens/add/import/ImportScreens";
import { appGuideReturnTo } from "../../../../src/view-models/guide-return-to";

// R16 取り込み · まとめて確認 → 完成 (b9 A2 ④ App; Web /app/contacts/new/import/[importId]).
// `design-*` = the local pixel-gate demo (dev build + EXPO_PUBLIC_ORBIT_REDESIGN_MOCK=add-scan), never in a release build.
function ImportBatchRoute() {
  const params = useLocalSearchParams<{ importId?: string | string[]; excluded?: string | string[]; returnTo?: string | string[] }>();
  const importId = (Array.isArray(params.importId) ? params.importId[0] : params.importId) ?? "";
  const excluded = Number((Array.isArray(params.excluded) ? params.excluded[0] : params.excluded) ?? 0) || 0;
  const returnTo = appGuideReturnTo(params.returnTo);
  if (addDesignMock("add-scan") && isImportDesignName(importId)) {
    return importId === "design-review" ? <ImportBatchScreen batchId={importId} excluded={46} design={importId} /> : <ContactsImportScreen design={importId} />;
  }
  return <ImportBatchScreen key={importId} batchId={importId} excluded={excluded} returnTo={returnTo} />;
}

export default withOrbitPrivateRoute(withOnlineOnlyRoute(ImportBatchRoute));
