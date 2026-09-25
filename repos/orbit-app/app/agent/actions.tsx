import { useLocalSearchParams } from "expo-router";
import { withOrbitPrivateRoute } from "../../src/components/OrbitRouteAccessBoundary";
import { AllActionsAgentLedgerScreen } from "../../src/screens/agent/AgentLedgerScreen";
import { firstAgentLedgerEntryId } from "../../src/view-models/agent-ledger-route";

function AgentActionsRoute() {
  const params = useLocalSearchParams<{ entry?: string | string[] }>();
  return (
    <AllActionsAgentLedgerScreen
      selectedEntryId={firstAgentLedgerEntryId(params.entry)}
    />
  );
}

export default withOrbitPrivateRoute(AgentActionsRoute);
