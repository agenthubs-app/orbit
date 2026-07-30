import { useIsFocused } from "expo-router";
import { ContactsScreen } from "../../src/screens/contacts/ContactsScreen";
import { withOrbitPrivateRoute } from "../../src/components/OrbitRouteAccessBoundary";

function ContactsListRoute() {
  const isFocused = useIsFocused();

  if (!isFocused) {
    return null;
  }

  return <ContactsScreen mode="list" />;
}

export default withOrbitPrivateRoute(ContactsListRoute);
