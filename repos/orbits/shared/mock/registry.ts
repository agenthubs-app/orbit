import {
  defaultMockFixtures,
  MOCK_FIXTURE_COLLECTION_NAMES,
  type MockFixtureCollectionName,
  type MockRuntimeFixtures,
} from "./fixtures";
import { cloneMockState } from "./state-store";

export const DEFAULT_MOCK_FIXTURE_VARIANT = "default";

// registry 是 mock runtime 的 fixture 变体表。
// 各 capability 默认共享 defaultMockFixtures；测试或 debug surface 可以注册新 variant，
// 但读取时都会 clone，避免一个服务改动污染其它服务。
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
  // variant 会出现在调试 API 和测试参数里，空字符串会让默认值语义不清。
  if (variant.trim() === "") {
    throw new Error("Mock fixture variant must be a non-empty string.");
  }
}

function summarizeRegistration(
  registration: MockFixtureVariantRegistration,
): MockFixtureVariantSummary {
  // summary 只暴露集合数量和 fixture id，不把完整关系图塞进 registry 列表响应。
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
  // 写入 registry 前 clone 一次，保证注册方之后继续改原对象不会影响已注册 fixture。
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
  // 读取也 clone，调用方可以放心在本地服务里派生/过滤，不会改到全局 registry。
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
  // reset 是测试隔离和 debug reset 的基础：恢复到唯一默认关系图。
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
