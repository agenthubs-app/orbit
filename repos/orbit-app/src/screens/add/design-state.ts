// R31a (RD-28): mid-states the pixel gate compares (a sheet / dialog open) are reached with a dev-only switch —
// `?design=<state>` on the path the gate opens through open-path. Same gate as addDesignMock: only in a development
// build with EXPO_PUBLIC_ORBIT_REDESIGN_MOCK containing `open-path`; a release build never reads it.
import { addDesignMock } from "./add-design-mock";

export function designState(param: string | string[] | undefined, enabled: boolean = addDesignMock("open-path")): string | null {
  if (!enabled) return null;
  const value = Array.isArray(param) ? param[0] : param;
  return value && /^[a-z0-9-]{1,32}$/u.test(value) ? value : null;
}
