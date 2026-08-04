import type { OrbitKnownWorkflow } from "./contract";

export type EventMatchmakingInput = Readonly<Record<string, unknown>>;
export type EventMatchmakingArtifact = never;

export function createEventMatchmakingWorkflow(): OrbitKnownWorkflow<
  EventMatchmakingInput,
  EventMatchmakingArtifact
> {
  return {
    key: "event_matchmaking_v1",
    version: 1,
    canHandle: (trigger) =>
      trigger === "event_matchmaking_requested" ||
      trigger === "event_goal_confirmed",
    async run() {
      throw Object.assign(
        new Error(
          "LEGACY_MATCHMAKING_READ_ONLY: event_matchmaking_v1 is retired; use published event operations recommendations and contact requests.",
        ),
        { code: "LEGACY_MATCHMAKING_READ_ONLY" as const },
      );
    },
  };
}
