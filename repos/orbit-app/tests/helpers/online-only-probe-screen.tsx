import { useEffect } from "react";
import { Pressable, Text } from "react-native";
import { withOnlineOnlyRoute } from "../../src/components/OnlineOnlyBoundary";
import { useOrbitApiClient } from "../../src/hooks/useOrbitApiClient";

/** Sprint 0131 test page: a stand-in online-only screen (it reads on open, like real pages) behind the real boundary. */
function OnlineOnlyProbeScreen() {
  const client = useOrbitApiClient();
  useEffect(() => { void client.get("/api/probe-page"); }, [client]);
  return <><Text>probe page content</Text><Pressable accessibilityRole="button" onPress={() => { void client.post("/api/probe-page"); }}><Text>probe write</Text></Pressable></>;
}

export const OnlineOnlyProbeRoute = withOnlineOnlyRoute(OnlineOnlyProbeScreen);
