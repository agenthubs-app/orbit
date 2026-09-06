import type { TestContext } from "node:test";

export function useUnconfiguredLiveDatabase(context: TestContext): void {
  const keys = [
    "ORBIT_EVENT_DATABASE_URL",
    "ORBIT_LIVE_DATABASE_URL",
    "ORBIT_DATABASE_URL",
  ] as const;
  const previous = keys.map((key) => [key, process.env[key]] as const);
  context.after(() => {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  for (const key of keys) delete process.env[key];
}
