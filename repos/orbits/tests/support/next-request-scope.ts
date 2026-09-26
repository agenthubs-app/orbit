import "./next-async-local-storage";

import { workAsyncStorage } from "next/dist/server/app-render/work-async-storage.external";
import { workUnitAsyncStorage } from "next/dist/server/app-render/work-unit-async-storage.external";

/**
 * Runs code inside Next's real per-request async stores, filled with only the
 * fields a request scope needs here (route template, request headers and an
 * `after()` queue). This replaces the Next server, not Orbit code: route
 * handlers, services, pools and the read-receipt adapter all run for real.
 */
export function nextRequestScope(
  route: string,
  headers: Record<string, string>,
  /** Next's page id: "/api/x/route" for a route handler, "/" for proxy.ts. */
  page = `${route === "/" ? "" : route}/route`,
) {
  const afterTasks: Array<() => unknown> = [];
  const work = { route, page, afterContext: { after: (task: () => unknown) => void afterTasks.push(task) } };
  const unit = { type: "request", phase: "action", headers: new Headers(headers) };
  return {
    afterTasks,
    run<T>(fn: () => T): T {
      return workAsyncStorage.run(work as never, () => workUnitAsyncStorage.run(unit as never, fn));
    },
    /** What Next does once the response has been sent. */
    async runAfter(): Promise<void> {
      for (const task of afterTasks.splice(0)) await task();
    },
  };
}
