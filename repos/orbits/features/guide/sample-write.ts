import { DEMO_ACTOR_ID } from "../../shared/mock/demo-world/fixtures";

/** Sample data is read only, including requests sent directly to an API. */
export function isSampleWrite(request: Request, actorId: string): boolean {
  return actorId === DEMO_ACTOR_ID || request.headers.get("x-orbit-sample")?.trim() === "1";
}
