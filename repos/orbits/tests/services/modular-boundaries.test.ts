import assert from "node:assert/strict";
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

const moduleDocs = [
  "account",
  "acquisition",
  "actions",
  "analysis",
  "audit",
  "bootstrap",
  "chat",
  "connections",
  "contacts",
  "dashboard",
  "events",
  "followups",
  "notifications",
  "orbit-ai",
  "permissions",
  "profile",
  "recommendations",
  "search",
  "ai-provider",
] as const;

const featureFactories = [
  "account",
  "acquisition",
  "agent",
  "analysis",
  "audit",
  "bootstrap",
  "chat",
  "connections",
  "contacts",
  "dashboard",
  "events",
  "followups",
  "notifications",
  "orbit-ai",
  "permissions",
  "profile",
  "recommendations",
  "search",
] as const;

const allowedMockImportPatterns = [
  /^app\/dev\//,
  /^app\/api\/mock\//,
  /^features\/[^/]+\/service-factory\.ts$/,
  /^features\/[^/]+\/[^/]+\/debug-view\.tsx$/,
  /^shared\/ai\/service-factory\.ts$/,
  /^shared\/ai\/[^/]+\/debug-view\.tsx$/,
  /^tests\//,
];

function source(path: string): string {
  return readFileSync(join(projectRoot, path), "utf8");
}

function walk(path: string): string[] {
  const absolutePath = join(projectRoot, path);

  if (!existsSync(absolutePath)) {
    return [];
  }

  return readdirSync(absolutePath)
    .flatMap((entry) => {
      const entryPath = join(absolutePath, entry);
      const relativePath = relative(projectRoot, entryPath);

      if (statSync(entryPath).isDirectory()) {
        return walk(relativePath);
      }

      return /\.(ts|tsx)$/.test(entryPath) ? [relativePath] : [];
    })
    .sort();
}

function isAllowedMockImportPath(path: string): boolean {
  return allowedMockImportPatterns.some((pattern) => pattern.test(path));
}

test("production routes and app pages obtain mock implementations only through service factories", () => {
  const runtimeFiles = [
    ...walk("app/api").filter((path) => !path.startsWith("app/api/mock/")),
    ...walk("app/(app)"),
  ].filter((path) => !isAllowedMockImportPath(path));

  const directMockConsumers = runtimeFiles.filter((path) => {
    const contents = source(path);

    return (
      /from\s+["'][^"']*(?:features|shared)\/[^"']*\/mock[^"']*["']/.test(
        contents,
      ) || /createMock[A-Z]\w*Service\s*\(/.test(contents)
    );
  });

  assert.deepEqual(directMockConsumers, []);
});

test("every modular capability has a replaceable service factory", () => {
  const missingFactories = featureFactories
    .map((moduleId) => `features/${moduleId}/service-factory.ts`)
    .filter((path) => !existsSync(join(projectRoot, path)));

  assert.deepEqual(missingFactories, []);
  assert.ok(
    existsSync(join(projectRoot, "shared/ai/service-factory.ts")),
    "shared AI provider needs a replaceable service factory",
  );
});

test("module architecture docs describe position, expected behavior, mock behavior, and hot-swap boundary in Chinese", () => {
  const requiredHeadings = [
    "模块定位",
    "期望行为",
    "Mock 行为",
    "热拔插边界",
  ];
  const missingDocs: string[] = [];
  const incompleteDocs: string[] = [];

  for (const moduleId of moduleDocs) {
    const path = `docs/architecture/modules/${moduleId}.md`;

    if (!existsSync(join(projectRoot, path))) {
      missingDocs.push(path);
      continue;
    }

    const contents = source(path);
    const hasEveryHeading = requiredHeadings.every((heading) =>
      contents.includes(heading),
    );

    if (!hasEveryHeading || !/[一-龥]/.test(contents)) {
      incompleteDocs.push(path);
    }
  }

  assert.deepEqual(missingDocs, []);
  assert.deepEqual(incompleteDocs, []);
});

test("product presenters consume route view models instead of Orbit AI service payloads", () => {
  const presenterFiles = [
    "app/(app)/app/agent/orbit-real-agent.tsx",
    "app/(app)/app/chat/compose-app-chat-from-previously-approved-mock-first-capabilities/chat-view-model-adapter.ts",
  ];
  const routeViewModelFiles = [
    "app/(app)/app/chat/compose-app-chat-from-previously-approved-mock-first-capabilities/chat-route-view-model.ts",
  ];

  for (const path of presenterFiles) {
    const contents = source(path);

    assert.doesNotMatch(contents, /features\/orbit-ai/);
    assert.doesNotMatch(contents, /features\/chat/);
    assert.doesNotMatch(contents, /createOrbit[A-Za-z]*Service/);
    assert.doesNotMatch(contents, /createAppChatRouteServices/);
    assert.doesNotMatch(contents, /createMock/);
  }

  for (const path of routeViewModelFiles) {
    const contents = source(path);

    assert.match(contents, /service-factory/);
    assert.doesNotMatch(contents, /from ["']react["']/);
    assert.doesNotMatch(contents, /WorkbenchSurface|<section|<article|<div/);
  }
});

test("contacts live runtime does not import mock capability directories", () => {
  const liveRuntimeFiles = [
    "features/contacts/live-service.ts",
    "features/contacts/storage/contact-live-record-provider.ts",
  ];

  for (const path of liveRuntimeFiles) {
    assert.doesNotMatch(
      source(path),
      /contacts-list-search-and-filter-mock/,
      `${path} should depend on neutral contacts query/storage modules, not mock capability directories`,
    );
  }
});

test("search live runtime does not import fixture modules", () => {
  assert.doesNotMatch(
    source("features/search/live-service.ts"),
    /from\s+["']\.\/fixtures["']/,
    "features/search/live-service.ts should depend on neutral search filter/query modules, not fixture modules",
  );
});

test("dashboard live runtime does not import fixture modules", () => {
  assert.doesNotMatch(
    source("features/dashboard/live-service.ts"),
    /from\s+["']\.\/fixtures["']/,
    "features/dashboard/live-service.ts should depend on neutral dashboard summary modules, not fixture modules",
  );
});

test("permissions live confirmation runtime does not import mock service modules", () => {
  assert.doesNotMatch(
    source("features/permissions/live-confirmation-service.ts"),
    /from\s+["']\.\/mock-confirmation-service["']/,
    "features/permissions/live-confirmation-service.ts should depend on neutral confirmation policy modules, not mock service modules",
  );
});

test("agent live settings runtime does not import fixture modules", () => {
  assert.doesNotMatch(
    source("features/agent/live-settings-service.ts"),
    /from\s+["']\.\/settings-fixtures["']/,
    "features/agent/live-settings-service.ts should depend on neutral settings policy modules, not fixture modules",
  );
});

test("agent live external action runtime does not import fixture modules", () => {
  assert.doesNotMatch(
    source("features/agent/live-external-action-sandbox.ts"),
    /from\s+["']\.\/external-action-fixtures["']/,
    "features/agent/live-external-action-sandbox.ts should depend on neutral external action policy modules, not fixture modules",
  );
});

test("events live CRUD runtime does not hard-code mock or fixture source markers", () => {
  assert.doesNotMatch(
    source("features/events/event-crud-and-import/live-service.ts"),
    /(?:mock-|fixture)/,
    "features/events/event-crud-and-import/live-service.ts should depend on neutral event source policy instead of hard-coded mock or fixture source markers",
  );
});
