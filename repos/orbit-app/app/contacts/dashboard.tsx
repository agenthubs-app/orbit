import { withOrbitPrivateRoute } from "../../src/components/OrbitRouteAccessBoundary";
import { NetworkAnalysisScreen } from "../../src/screens/network-analysis/NetworkAnalysisScreen";

// R11b 人脈分析 (?tab=structure|opportunities|insight).
export default withOrbitPrivateRoute(NetworkAnalysisScreen);
