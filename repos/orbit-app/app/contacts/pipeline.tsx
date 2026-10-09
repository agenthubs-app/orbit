import { ContactPipelineScreen } from "../../src/screens/contacts/ContactPipelineScreen";
import { withOrbitPrivateRoute } from "../../src/components/OrbitRouteAccessBoundary";

// Sprint 0137: the account-owned contact mirror powers stage grouping offline.
export default withOrbitPrivateRoute(ContactPipelineScreen);
