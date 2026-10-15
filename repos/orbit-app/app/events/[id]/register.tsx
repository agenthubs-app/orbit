import { withOnlineOnlyRoute } from "../../../src/components/OnlineOnlyBoundary";
import { withOrbitPrivateRoute } from "../../../src/components/OrbitRouteAccessBoundary";
import { RegisterPage } from "../../../src/screens/events/v2/RegisterPage";

// R27 参加登録（b2 #20–#22）。Online-only: questions and the attendee profile come from the server.
function EventRegisterRoute() {
  return <RegisterPage />;
}

export default withOrbitPrivateRoute(withOnlineOnlyRoute(EventRegisterRoute));
