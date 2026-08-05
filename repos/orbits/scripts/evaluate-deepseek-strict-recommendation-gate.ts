import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createEventOperationsAiProvider, type EventOperationsModelRunner } from "../features/events/event-operations/ai-provider";
import { createEventOperationsPostgresClient } from "../features/events/event-operations/storage/postgres-client";
import { createPostgresEventOperationsRepository } from "../features/events/event-operations/storage/postgres-repository";
import { buildRecommendationTasks, evaluateRecommendationTask, hashEvaluationValue, type BuiltRecommendationTask } from "./evaluate-event-operations-recommendations";
import { loadLocalEnv } from "./load-local-env";

export const STRICT_ENDPOINT = "https://api.deepseek.com/beta/chat/completions" as const;
export const STRICT_TOOL = "submit_event_recommendations" as const;
type StrictCategory = "bad_arguments" | "bad_tool" | "content" | "duplicate_source" | "duplicate_target" | "finish" | "http" | "missing_source" | "transport" | "unknown_source" | "unknown_target" | "wire" | null;

export function createScopedStrictSchema(task: BuiltRecommendationTask) {
  const branches = task.request.sources.map((source, sourceIndex) => {
    const sourceKey = `S${sourceIndex + 1}`;
    return {
      additionalProperties: false,
      properties: {
        noMatchReason: { type: "string" },
        recommendations: {
          items: {
            additionalProperties: false,
            properties: {
              icebreakers: { items: { type: "string" }, type: "array" },
              memberHint: { type: "string" },
              rank: { minimum: 1, type: "integer" },
              reasons: { items: { type: "string" }, type: "array" },
              score: { maximum: 100, minimum: 0, type: "number" },
              targetCandidateKey: {
                enum: source.candidateParticipants.map((_, candidateIndex) => `${sourceKey}C${candidateIndex + 1}`),
                type: "string",
              },
            },
            required: ["targetCandidateKey", "rank", "score", "reasons", "icebreakers", "memberHint"],
            type: "object",
          },
          type: "array",
        },
        sourceKey: { enum: [sourceKey], type: "string" },
      },
      required: ["sourceKey", "noMatchReason", "recommendations"],
      type: "object",
    };
  });
  return {
    additionalProperties: false,
    properties: { recommendations: { items: { anyOf: branches }, type: "array" } },
    required: ["recommendations"], type: "object",
  };
}

function wireDecode(value: unknown, task: BuiltRecommendationTask): { category: StrictCategory; rows?: unknown[] } {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join(",") !== "recommendations") return { category: "wire" };
  const rows = (value as { recommendations?: unknown }).recommendations;
  if (!Array.isArray(rows) || rows.length !== task.request.sources.length) return { category: "missing_source" };
  const seenSources = new Set<string>();
  const decoded: unknown[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row) || Object.keys(row).sort().join(",") !== "noMatchReason,recommendations,sourceKey") return { category: "wire" };
    const sourceKey = (row as { sourceKey?: unknown }).sourceKey;
    if (typeof sourceKey !== "string" || !/^S[1-9]\d*$/u.test(sourceKey)) return { category: "unknown_source" };
    const sourceIndex = Number(sourceKey.slice(1)) - 1;
    const source = task.request.sources[sourceIndex];
    if (!source) return { category: "unknown_source" };
    if (seenSources.has(sourceKey)) return { category: "duplicate_source" };
    seenSources.add(sourceKey);
    const noMatchReason = (row as { noMatchReason?: unknown }).noMatchReason;
    const recommendations = (row as { recommendations?: unknown }).recommendations;
    if (typeof noMatchReason !== "string" || !Array.isArray(recommendations)) return { category: "wire" };
    if ((recommendations.length === 0 && !noMatchReason.trim()) || (recommendations.length > 0 && noMatchReason !== "")) return { category: "wire" };
    const targets = new Set<string>();
    const mapped = [];
    for (const [index, recommendation] of recommendations.entries()) {
      if (!recommendation || typeof recommendation !== "object" || Array.isArray(recommendation) || Object.keys(recommendation).sort().join(",") !== "icebreakers,memberHint,rank,reasons,score,targetCandidateKey") return { category: "wire" };
      const key = (recommendation as { targetCandidateKey?: unknown }).targetCandidateKey;
      const rank = (recommendation as { rank?: unknown }).rank;
      const reasons = (recommendation as { reasons?: unknown }).reasons;
      const icebreakers = (recommendation as { icebreakers?: unknown }).icebreakers;
      const memberHint = (recommendation as { memberHint?: unknown }).memberHint;
      const score = (recommendation as { score?: unknown }).score;
      const candidateIndexByKey = new Map(
        source.candidateParticipants.map((_, candidateIndex) => [`${sourceKey}C${candidateIndex + 1}`, candidateIndex]),
      );
      if (typeof key !== "string" || !candidateIndexByKey.has(key)) return { category: "unknown_target" };
      if (targets.has(key)) return { category: "duplicate_target" };
      if (
        rank !== index + 1 ||
        typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > 100 ||
        !Array.isArray(reasons) || reasons.length === 0 || reasons.some((reason) => typeof reason !== "string" || !reason.trim()) ||
        !Array.isArray(icebreakers) || icebreakers.length !== 2 || icebreakers.some((question) => typeof question !== "string" || !question.trim()) ||
        typeof memberHint !== "string" || !memberHint.trim()
      ) return { category: "wire" };
      targets.add(key);
      mapped.push({ icebreakers, memberHint, rank, reasons, score, targetCandidateKey: key });
    }
    decoded.push({ noMatchReason: noMatchReason || null, recommendations: mapped, sourceKey });
  }
  return seenSources.size === task.request.sources.length ? { category: null, rows: decoded } : { category: "missing_source" };
}

export function createStrictTaskRunner(input: { apiKey: string; fetchImpl: typeof fetch; model: string; requestTimeoutMs?: number; task: BuiltRecommendationTask; telemetry: { category: StrictCategory; bytes: number | null; finish: string | null; timingMs: number | null; tokens: { completion: number; prompt: number } | null } }): EventOperationsModelRunner {
  const schema = createScopedStrictSchema(input.task);
  return async ({ systemInstruction, userText }) => {
    const started = performance.now();
    try {
      const response = await input.fetchImpl(STRICT_ENDPOINT, { body: JSON.stringify({ max_tokens: 8192, messages: [{ content: systemInstruction, role: "system" }, { content: userText, role: "user" }], model: input.model, stream: false, temperature: 0.2, thinking: { type: "disabled" }, tool_choice: { function: { name: STRICT_TOOL }, type: "function" }, tools: [{ function: { description: "Submit scoped event recommendation tokens. Use an empty noMatchReason when recommendations are present; otherwise use a concrete non-empty reason.", name: STRICT_TOOL, parameters: schema, strict: true }, type: "function" }] }), headers: { Authorization: `Bearer ${input.apiKey}`, "Content-Type": "application/json" }, method: "POST", signal: AbortSignal.timeout(input.requestTimeoutMs ?? 90_000) });
      const text = await response.text();
      input.telemetry.bytes = Buffer.byteLength(text); input.telemetry.timingMs = performance.now() - started;
      if (response.status !== 200) { input.telemetry.category = "http"; return { error: { code: "MODEL_REQUEST_FAILED", message: "strict-http", provider: "deepseek" as const, source: "provider:deepseek-chat-completions-api" as const }, retryable: false, success: false }; }
      let parsed: unknown; try { parsed = JSON.parse(text); } catch { input.telemetry.category = "wire"; return { error: { code: "MODEL_REQUEST_FAILED", message: "strict-wire", provider: "deepseek" as const, source: "provider:deepseek-chat-completions-api" as const }, retryable: false, success: false }; }
      const choice = parsed && typeof parsed === "object" ? (parsed as { choices?: unknown }).choices : null;
      const first = Array.isArray(choice) && choice.length === 1 ? choice[0] as Record<string, unknown> : null;
      const finish = typeof first?.finish_reason === "string" ? first.finish_reason : null; input.telemetry.finish = finish;
      const usage = parsed && typeof parsed === "object" ? (parsed as { usage?: { completion_tokens?: unknown; prompt_tokens?: unknown } }).usage : undefined;
      input.telemetry.tokens = usage && typeof usage.prompt_tokens === "number" && typeof usage.completion_tokens === "number" ? { completion: usage.completion_tokens, prompt: usage.prompt_tokens } : null;
      if (finish !== "tool_calls") { input.telemetry.category = "finish"; return { error: { code: "MODEL_REQUEST_FAILED", message: "strict-finish", provider: "deepseek" as const, source: "provider:deepseek-chat-completions-api" as const }, retryable: false, success: false }; }
      const message = first?.message as Record<string, unknown> | undefined;
      if (!message || (message.content !== null && message.content !== "")) { input.telemetry.category = "content"; return { error: { code: "MODEL_REQUEST_FAILED", message: "strict-content", provider: "deepseek" as const, source: "provider:deepseek-chat-completions-api" as const }, retryable: false, success: false }; }
      const calls = message.tool_calls;
      const call = Array.isArray(calls) && calls.length === 1 && calls[0] && typeof calls[0] === "object" ? calls[0] as { type?: unknown; function?: { name?: unknown; arguments?: unknown } } : null;
      if (!call || call.type !== "function" || call.function?.name !== STRICT_TOOL) { input.telemetry.category = "bad_tool"; return { error: { code: "MODEL_REQUEST_FAILED", message: "strict-tool", provider: "deepseek" as const, source: "provider:deepseek-chat-completions-api" as const }, retryable: false, success: false }; }
      if (typeof call.function.arguments !== "string") { input.telemetry.category = "bad_arguments"; return { error: { code: "MODEL_REQUEST_FAILED", message: "strict-arguments", provider: "deepseek" as const, source: "provider:deepseek-chat-completions-api" as const }, retryable: false, success: false }; }
      let decoded: ReturnType<typeof wireDecode>; try { decoded = wireDecode(JSON.parse(call.function.arguments), input.task); } catch { decoded = { category: "bad_arguments" }; }
      if (decoded.category || !decoded.rows) { input.telemetry.category = decoded.category ?? "bad_arguments"; return { error: { code: "MODEL_REQUEST_FAILED", message: "strict-decode", provider: "deepseek" as const, source: "provider:deepseek-chat-completions-api" as const }, retryable: false, success: false }; }
      input.telemetry.category = null;
      return {
        model: input.model,
        provider: "deepseek" as const,
        responseMetadata: {
          finishReason: finish,
          providerResponseBytes: input.telemetry.bytes ?? 0,
          usage: input.telemetry.tokens ? {
            cacheHitTokens: null,
            completionTokens: input.telemetry.tokens.completion,
            promptTokens: input.telemetry.tokens.prompt,
            reasoningTokens: null,
          } : null,
        },
        source: "provider:deepseek-chat-completions-api" as const,
        success: true as const,
        text: JSON.stringify({ recommendations: decoded.rows }),
      };
    } catch { input.telemetry.category = "transport"; input.telemetry.timingMs = performance.now() - started; return { error: { code: "MODEL_REQUEST_FAILED", message: "strict-transport", provider: "deepseek" as const, source: "provider:deepseek-chat-completions-api" as const }, retryable: false, success: false }; }
  };
}

async function main(): Promise<void> {
  loadLocalEnv();
  const generationIdIndex = process.argv.indexOf("--generation-id");
  const generationId = generationIdIndex >= 0 ? process.argv[generationIdIndex + 1]?.trim() : undefined;
  const execute = process.argv.includes("--execute");
  if (!generationId) throw new Error("--generation-id is required.");
  const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL; if (!databaseUrl) throw new Error("ORBIT_EVENT_DATABASE_URL is required.");
  const client = createEventOperationsPostgresClient({ connectionString: databaseUrl });
  try {
    const repository = createPostgresEventOperationsRepository({ client, workspaceId: process.env.ORBIT_WORKSPACE_ID ?? "workspace:default" });
    const generation = await repository.getGeneration(generationId); if (!generation || generation.status === "queued" || generation.status === "running") throw new Error("A settled generation is required.");
    const [configuration, tasks, candidates] = await Promise.all([repository.getGenerationConfiguration(generationId), repository.listTasks(generationId), repository.listCandidates(generationId, generation.snapshot.participants.map((p) => p.participantId))]);
    if (!configuration || tasks.some((task) => task.status === "running" || task.leaseToken !== null)) throw new Error("Configuration or lease precondition failed.");
    const before = hashEvaluationValue({ candidates, configuration, generation, tasks });
    const built = buildRecommendationTasks({ aiRequestFingerprint: "strict-beta", candidates, configuration, eventId: generation.eventId, participants: generation.snapshot.participants, tasks });
    const sourceParticipantIds = built.flatMap((task) => task.participantIds);
    if (built.length !== 11 || generation.snapshot.participants.length !== 64 || sourceParticipantIds.length !== 64 || new Set(sourceParticipantIds).size !== 64 || built.some((task) => task.request.sources.some((source) => source.candidateParticipants.length !== 16))) throw new Error("Frozen 64-person S6 topology precondition failed.");
    const apiKey = process.env.DEEPSEEK_API_KEY; if (execute && !apiKey) throw new Error("DEEPSEEK_API_KEY is required for --execute.");
    const model = process.env.DEEPSEEK_STRICT_MODEL || process.env.ORBIT_DEEPSEEK_MODEL || "deepseek-v4-flash";
    const results = new Array<unknown>(built.length);
    let nextTaskIndex = 0;
    await Promise.all(Array.from({ length: Math.min(8, built.length) }, async () => {
      while (nextTaskIndex < built.length) {
      const taskIndex = nextTaskIndex;
      nextTaskIndex += 1;
      const task = built[taskIndex]!;
      const telemetry = { bytes: null as number | null, category: null as StrictCategory, finish: null as string | null, timingMs: null as number | null, tokens: null as { completion: number; prompt: number } | null };
      const schema = createScopedStrictSchema(task);
      const provider = createEventOperationsAiProvider({ config: { deepseekThinking: false, jsonOutput: true, maxTokens: 8192, provider: "deepseek", requestTimeoutMs: 90_000, temperature: 0.2 }, runModelText: execute ? createStrictTaskRunner({ apiKey: apiKey!, fetchImpl: fetch, model, task, telemetry }) : async () => ({ error: { code: "MODEL_REQUEST_FAILED" as const, message: "dry-run", provider: "deepseek" as const, source: "provider:deepseek-chat-completions-api" as const }, retryable: false, success: false as const }) });
      const gate = execute ? await evaluateRecommendationTask({ provider, recommendationCount: configuration.recommendationCount, snapshotParticipants: generation.snapshot.participants, task }) : null;
      results[taskIndex] = { bytes: telemetry.bytes, domainValid: gate?.overallBusinessValid ?? null, finish: telemetry.finish, requestHash: hashEvaluationValue(task.request), schemaHash: hashEvaluationValue(schema), strictCategory: telemetry.category, taskOrdinal: task.record.taskOrdinal, timingMs: telemetry.timingMs, tokens: telemetry.tokens };
      }
    }));
    const [after, afterConfig, afterTasks, afterCandidates] = await Promise.all([repository.getGeneration(generationId), repository.getGenerationConfiguration(generationId), repository.listTasks(generationId), repository.listCandidates(generationId, generation.snapshot.participants.map((p) => p.participantId))]);
    if (!after || !afterConfig || hashEvaluationValue({ candidates: afterCandidates, configuration: afterConfig, generation: after, tasks: afterTasks }) !== before) throw new Error("Read-only state changed.");
    for (const result of results) process.stdout.write(`${JSON.stringify(result)}\n`);
    if (execute && results.some((result) => (result as { strictCategory: StrictCategory; domainValid: boolean | null }).strictCategory !== null || (result as { domainValid: boolean | null }).domainValid !== true)) process.exitCode = 1;
  } finally { await client.close(); }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) void main().catch(() => { process.stderr.write("Strict recommendation gate failed.\n"); process.exitCode = 1; });
