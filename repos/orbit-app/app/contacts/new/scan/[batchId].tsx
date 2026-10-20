import { useLocalSearchParams } from "expo-router";

import { withOnlineOnlyRoute } from "../../../../src/components/OnlineOnlyBoundary";
import { withOrbitPrivateRoute } from "../../../../src/components/OrbitRouteAccessBoundary";
import { ScanBatchScreen } from "../../../../src/screens/add/ScanBatchScreen";
import { appGuideReturnTo } from "../../../../src/view-models/guide-return-to";

// R12 名刺 · 読み取り → まとめて確認 → 完成 (DESIGN §2.2 steps 4–7; Web /app/contacts/new/scan/[batchId]).
// Online-only: the batch lives on the server (docs/offline/page-inventory.md).
function ScanBatchRoute() {
  const params = useLocalSearchParams<{ batchId?: string | string[]; returnTo?: string | string[] }>();
  const batchId = (Array.isArray(params.batchId) ? params.batchId[0] : params.batchId) ?? "";
  return <ScanBatchScreen key={batchId} batchId={batchId} returnTo={appGuideReturnTo(params.returnTo)} />;
}

export default withOrbitPrivateRoute(withOnlineOnlyRoute(ScanBatchRoute));
