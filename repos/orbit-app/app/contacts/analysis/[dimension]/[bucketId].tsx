import { withOrbitPrivateRoute } from "../../../../src/components/OrbitRouteAccessBoundary";
import { NetworkAnalysisListScreen } from "../../../../src/screens/network-analysis/NetworkAnalysisListScreen";

// R11b 人脈分析の名簿 (dimension = industry | seniority | region | met | opportunity).
export default withOrbitPrivateRoute(NetworkAnalysisListScreen);
