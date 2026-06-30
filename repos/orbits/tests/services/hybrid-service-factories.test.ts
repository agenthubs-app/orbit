/**
 * Hybrid service factory coverage.
 *
 * The app can run with ORBIT_MODULE_MODE=hybrid only if every registered
 * capability factory can resolve a hybrid service. Some capabilities have
 * local-remote-store implementations; the rest intentionally fall back to mock
 * until their provider is replaced.
 */
import assert from "node:assert/strict";
import test from "node:test";

const serviceFactoryModules = [
  "../../shared/ai/service-factory",
  "../../features/account/service-factory",
  "../../features/acquisition/service-factory",
  "../../features/agent/service-factory",
  "../../features/analysis/service-factory",
  "../../features/audit/service-factory",
  "../../features/bootstrap/service-factory",
  "../../features/chat/service-factory",
  "../../features/connections/service-factory",
  "../../features/contacts/service-factory",
  "../../features/dashboard/service-factory",
  "../../features/events/service-factory",
  "../../features/followups/service-factory",
  "../../features/notifications/service-factory",
  "../../features/orbit-ai/service-factory",
  "../../features/permissions/service-factory",
  "../../features/profile/service-factory",
  "../../features/recommendations/service-factory",
  "../../features/search/service-factory",
] as const;

interface HybridResolvableFactory {
  capabilityId: string;
  create: (mode?: string) => {
    error?: { message: string };
    mode?: string;
    success: boolean;
  };
}

function isHybridResolvableFactory(
  value: unknown,
): value is HybridResolvableFactory {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { capabilityId?: unknown }).capabilityId === "string" &&
    typeof (value as { create?: unknown }).create === "function"
  );
}

test("every service factory resolves in hybrid mode", async () => {
  const factories: HybridResolvableFactory[] = [];

  for (const modulePath of serviceFactoryModules) {
    const serviceFactoryModule = await import(modulePath);

    factories.push(
      ...Object.values(serviceFactoryModule).filter(isHybridResolvableFactory),
    );
  }

  assert.ok(factories.length > 0);

  for (const factory of factories) {
    const resolution = factory.create("hybrid");

    assert.equal(
      resolution.success,
      true,
      `${factory.capabilityId} should resolve in hybrid mode: ${resolution.error?.message ?? ""}`,
    );
    assert.equal(resolution.mode, "hybrid");
  }
});
