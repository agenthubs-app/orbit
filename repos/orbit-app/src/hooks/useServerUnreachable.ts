import { useEffect, useState } from "react";

import { serverReachability } from "../api/server-reachability";

/**
 * UX-3: true only while the last request to this server could not reach it. A slow or failed
 * background sync does not count — a screen whose action needs the server (send to iOrbit)
 * should try the request and report a real failure instead of refusing up front.
 */
export function useServerUnreachable(baseUrl: string): boolean {
  const [state, setState] = useState(() => serverReachability.state(baseUrl));
  useEffect(() => {
    setState(serverReachability.state(baseUrl));
    return serverReachability.subscribe(() => setState(serverReachability.state(baseUrl)));
  }, [baseUrl]);
  return state === "unreachable";
}
