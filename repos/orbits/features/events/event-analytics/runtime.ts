import { createConfiguredEventOperationsPostgresRuntime } from "../event-operations/storage/postgres-client";
import { createConfiguredAttendeePostEventAiArtifactReader } from "../post-event-artifact/runtime";
import type { EventAnalyticsReadModel } from "./contract";
import { createEventAnalyticsReadModel } from "./read-model";

/**
 * The analytics runtime is a separate read model. It intentionally does not
 * import Event Operations mutation methods or an AI provider configuration.
 */
export function createConfiguredEventAnalyticsReadModel(): EventAnalyticsReadModel | null {
  const runtime = createConfiguredEventOperationsPostgresRuntime();
  if (!runtime) return null;

  return createEventAnalyticsReadModel({
    artifactReader: createConfiguredAttendeePostEventAiArtifactReader(),
    runtime,
  });
}
