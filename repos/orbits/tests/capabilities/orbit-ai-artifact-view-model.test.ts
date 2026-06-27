import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

async function importProjectModule<TModule>(
  pathFromRoot: string,
): Promise<TModule> {
  const absolutePath = join(projectRoot, pathFromRoot);

  assert.equal(
    existsSync(absolutePath),
    true,
    `${pathFromRoot} must exist for the Orbit AI artifact view model`,
  );

  return (await import(pathToFileURL(absolutePath).href)) as TModule;
}

test("Orbit AI artifact view model converts a ready side panel artifact into render-neutral data", async () => {
  const serviceModule = await importProjectModule<{
    createMockOrbitAgentArtifactTaskService: () => {
      createArtifactTask: (input: {
        kind: string;
        presentation?: { preferredSurface?: string; title?: string };
        query: string;
      }) => {
        success: boolean;
        data?: unknown;
      };
    };
  }>("features/orbit-ai/mock-artifact-task-service.ts");
  const viewModelModule = await importProjectModule<{
    createOrbitAgentArtifactSurfaceViewModel: (payload: unknown) => {
      actionsRequireConfirmation: true;
      artifactId: string;
      kind: string;
      sections: readonly {
        items: readonly {
          actions: readonly { requiresConfirmation: boolean }[];
          metadata: readonly { label: string; value: string }[];
          title: string;
        }[];
        title: string;
      }[];
      sourceModules: readonly string[];
      surface: string;
      title: string;
      widthHint: string | null;
    } | null;
  }>("features/orbit-ai/artifact-view-model.ts");

  const artifactService = serviceModule.createMockOrbitAgentArtifactTaskService();
  const artifact = artifactService.createArtifactTask({
    kind: "event_recommendations",
    presentation: {
      preferredSurface: "side_panel",
      title: "Recommended events",
    },
    query: "推荐下周适合见 Maya 的活动",
  });

  assert.equal(artifact.success, true);

  const viewModel =
    viewModelModule.createOrbitAgentArtifactSurfaceViewModel(artifact.data);

  assert.equal(viewModel?.surface, "side_panel");
  assert.equal(viewModel?.widthHint, "half");
  assert.equal(viewModel?.title, "Recommended events");
  assert.equal(viewModel?.kind, "event_recommendations");
  assert.equal(viewModel?.sourceModules.includes("events"), true);
  assert.equal(viewModel?.sections[0]?.title, "Recommended events");
  assert.equal(viewModel?.sections[0]?.items[0]?.title, "Founder relationship roundtable");
  assert.equal(
    viewModel?.sections[0]?.items[0]?.actions[0]?.requiresConfirmation,
    true,
  );
  assert.equal(viewModel?.actionsRequireConfirmation, true);
});

test("Orbit AI artifact view model hides pending artifacts from render surfaces", async () => {
  const serviceModule = await importProjectModule<{
    createMockOrbitAgentArtifactTaskService: () => {
      createArtifactTask: (input: {
        kind: string;
        query: string;
        scenario?: string;
      }) => {
        success: boolean;
        data?: unknown;
      };
    };
  }>("features/orbit-ai/mock-artifact-task-service.ts");
  const viewModelModule = await importProjectModule<{
    selectPrimaryOrbitAgentArtifactSurface: (
      payloads: readonly unknown[],
    ) => unknown | null;
  }>("features/orbit-ai/artifact-view-model.ts");

  const artifactService = serviceModule.createMockOrbitAgentArtifactTaskService();
  const pending = artifactService.createArtifactTask({
    kind: "event_recommendations",
    query: "推荐活动",
    scenario: "pending",
  });

  assert.equal(pending.success, true);
  assert.equal(
    viewModelModule.selectPrimaryOrbitAgentArtifactSurface([pending.data]),
    null,
  );
});

test("Orbit AI artifact view model stays independent from React Next and app UI components", () => {
  const source = readFileSync(
    join(projectRoot, "features/orbit-ai/artifact-view-model.ts"),
    "utf8",
  );

  assert.doesNotMatch(source, /from ["']react["']/);
  assert.doesNotMatch(source, /from ["']next\//);
  assert.doesNotMatch(source, /shared\/ui|WorkbenchSurface|Chip/);
  assert.doesNotMatch(source, /app\/\(app\)|app-chat-route|className/);
});
