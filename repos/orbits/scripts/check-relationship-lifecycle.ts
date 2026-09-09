import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import type { LiveRecord } from "../shared/storage/live-record-store";
import { assessRelationshipLifecycleMigration } from "../features/connections/lifecycle/migration-preflight";

function recordEnvelope(value: unknown): value is LiveRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return ["workspaceId", "collectionName", "recordId", "sourceType", "sourceId", "createdAt", "updatedAt"].every((key) => typeof row[key] === "string" && (row[key] as string).trim().length > 0)
    && (row.userId == null || typeof row.userId === "string")
    && typeof row.lifecycleState === "string" && ["active", "archived", "deleted"].includes(row.lifecycleState)
    && Array.isArray(row.evidenceIds) && row.evidenceIds.every((id) => typeof id === "string")
    && Object.hasOwn(row, "payload");
}

export async function runRelationshipLifecyclePreflightCommand(argv: readonly string[]): Promise<void> {
  const options = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!["--input", "--actor", "--workspace"].includes(key) || options.has(key) || !value?.trim() || value.startsWith("--")) throw new Error("Invalid arguments: supply --input, --actor and --workspace exactly once.");
    options.set(key, value);
  }
  if (options.size !== 3) throw new Error("Missing arguments: supply --input, --actor and --workspace.");
  let text: string;
  try {
    text = await readFile(options.get("--input")!, "utf8");
  } catch {
    throw new Error("Input file could not be read.");
  }
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch {
    throw new Error("Input must contain valid JSON.");
  }
  if (!Array.isArray(input) || !input.every(recordEnvelope)) throw new Error("Input must be an array of complete LiveRecord envelopes.");
  const report = assessRelationshipLifecycleMigration({ actorId: options.get("--actor")!, workspaceId: options.get("--workspace")!, records: input });
  process.stdout.write(`${JSON.stringify(report)}\n`);
  process.exitCode = report.readyForCutover ? 0 : 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runRelationshipLifecyclePreflightCommand(process.argv.slice(2)).catch((error: unknown) => {
    // JSON/parser errors are replaced above so file contents never reach stderr.
    process.stderr.write(`${error instanceof Error ? error.message : "Input preflight failed."}\n`);
    process.exitCode = 1;
  });
}
