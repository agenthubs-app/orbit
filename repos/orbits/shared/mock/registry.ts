import {
  defaultMockFixtures,
  MOCK_FIXTURE_COLLECTION_NAMES,
  type MockFixtureCollectionName,
  type MockRuntimeFixtures,
} from "./fixtures";
import { cloneMockState } from "./state-store";

export const DEFAULT_MOCK_FIXTURE_VARIANT = "default";

export interface MockFixtureVariantRegistration<
  TFixtures extends MockRuntimeFixtures = MockRuntimeFixtures,
> {
  variant: string;
  label: string;
  description: string;
  fixtures: TFixtures;
}

export interface MockFixtureVariantSummary {
  variant: string;
  label: string;
  description: string;
  fixtureId: string;
  collectionCounts: Record<MockFixtureCollectionName, number>;
}

const registry = new Map<string, MockFixtureVariantRegistration>();

function assertVariantName(variant: string): void {
  if (variant.trim() === "") {
    throw new Error("Mock fixture variant must be a non-empty string.");
  }
}

function summarizeRegistration(
  registration: MockFixtureVariantRegistration,
): MockFixtureVariantSummary {
  const collectionCounts = MOCK_FIXTURE_COLLECTION_NAMES.reduce(
    (counts, collectionName) => ({
      ...counts,
      [collectionName]: registration.fixtures[collectionName].length,
    }),
    {} as Record<MockFixtureCollectionName, number>,
  );

  return {
    variant: registration.variant,
    label: registration.label,
    description: registration.description,
    fixtureId: registration.fixtures.id,
    collectionCounts,
  };
}

function storeRegistration(
  registration: MockFixtureVariantRegistration,
): MockFixtureVariantSummary {
  assertVariantName(registration.variant);

  registry.set(registration.variant, {
    variant: registration.variant,
    label: registration.label,
    description: registration.description,
    fixtures: cloneMockState(registration.fixtures),
  });

  return summarizeRegistration(registry.get(registration.variant)!);
}

export function registerMockFixtureVariant<
  TFixtures extends MockRuntimeFixtures,
>(
  registration: MockFixtureVariantRegistration<TFixtures>,
): MockFixtureVariantSummary {
  return storeRegistration(registration);
}

export function getMockFixtureVariant<
  TFixtures extends MockRuntimeFixtures = MockRuntimeFixtures,
>(variant = DEFAULT_MOCK_FIXTURE_VARIANT): TFixtures {
  const registration = registry.get(variant);

  if (!registration) {
    throw new Error(`Mock fixture variant "${variant}" is not registered.`);
  }

  return cloneMockState(registration.fixtures) as TFixtures;
}

export function listMockFixtureVariants(): MockFixtureVariantSummary[] {
  return Array.from(registry.values()).map((registration) =>
    summarizeRegistration(registration),
  );
}

export function resetMockFixtureRegistry(): MockFixtureVariantSummary[] {
  registry.clear();
  storeRegistration({
    variant: DEFAULT_MOCK_FIXTURE_VARIANT,
    label: "Default Orbit mock graph",
    description:
      "Source-backed relationship seed data shared by mock capability providers.",
    fixtures: defaultMockFixtures,
  });

  return listMockFixtureVariants();
}

resetMockFixtureRegistry();
