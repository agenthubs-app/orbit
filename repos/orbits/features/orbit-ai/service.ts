import type { OrbitAiCommandInput, OrbitAiCommandResult } from "./contract";

export interface OrbitAiCommandService {
  getCommandCenter: (input?: OrbitAiCommandInput) => OrbitAiCommandResult;
}

export type { OrbitAiCommandInput, OrbitAiCommandResult };
