/**
 * The graph's checkpointer (设计稿 §3.9: LangGraph's Postgres checkpointer in the existing Postgres).
 *
 * Live mode uses the configured database (locally `ORBIT_LOCAL_DATABASE_URL`), in its own schema
 * `agent_v1_graph` so the checkpoint tables stay apart from the product tables. The tables are
 * created by the checkpointer's own setup() on first use. Mock mode (and unit tests) keep the
 * checkpoints in memory. The state written is references and progress only (graph/state.ts).
 */
import { MemorySaver, type BaseCheckpointSaver } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

import type { FeatureMode } from "../../../shared/config/feature-mode";
import { resolveLiveDatabaseConnectionConfig } from "../../../shared/storage/live-database-config";

export const CHECKPOINT_SCHEMA = "agent_v1_graph";

let memory: MemorySaver | null = null;
let postgres: Promise<BaseCheckpointSaver> | null = null;

export function memoryCheckpointer(): MemorySaver {
  memory ??= new MemorySaver();
  return memory;
}

/** A Postgres checkpointer on `connectionString` (schema agent_v1_graph), set up once. */
export async function createPostgresCheckpointer(connectionString: string): Promise<PostgresSaver> {
  const saver = PostgresSaver.fromConnString(connectionString, { schema: CHECKPOINT_SCHEMA });
  await saver.setup();
  return saver;
}

export async function configuredCheckpointer(mode: FeatureMode): Promise<BaseCheckpointSaver> {
  if (mode === "mock" || mode === "hybrid") return memoryCheckpointer();
  const config = resolveLiveDatabaseConnectionConfig();
  if (!config) return memoryCheckpointer();
  postgres ??= createPostgresCheckpointer(config.connectionString).catch((error: unknown) => {
    postgres = null;
    throw error;
  });
  return postgres;
}
