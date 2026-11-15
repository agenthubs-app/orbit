/**
 * Validation of the first layer's output (设计稿附录 C, after the type block). A failure lists what is
 * wrong so the one repair call (§3.3) can be told exactly what to fix.
 *
 * - `sourceQuote` must be a substring of this turn's words (only leading/trailing white space is trimmed).
 * - capabilities, data sources, deliverables, clarities and entities come from the fixed lists.
 * - `dependsOn` names other parts of this output and has no cycle.
 * - `referenceId` is a handle the context gave for this turn (an authorized @ reference or a record of
 *   the session state); `continues.ref` is an open item of the session.
 * - fields the model may not decide (`verdict`, `route`, `waitReason`, …) are dropped and reported;
 *   approval flags and account ids are removed and reported as `model.approval_claims_rejected`.
 */
import { rejectModelApprovalClaims } from "../entry/approval-claims";
import { isCapability, type Capability } from "../route/capabilities";
import {
  CLARITIES,
  CONTINUE_KINDS,
  DATA_OWNERS,
  DATA_SOURCES,
  DELIVERABLES,
  ENTITIES,
  INTENT_BASES,
  PERSISTENCES,
  type ObjectClue,
  type UnderstandOutput,
  type UnderstandPart,
} from "./schema";

export const MAX_PARTS = 8;
const CODE_DECIDED = ["verdict", "route", "waitReason", "reason", "missing", "status"] as const;

export interface UnderstandValidationInput {
  /** This turn's words, exactly as the user sent them. */
  message: string;
  /** Handles the context offered (r1, r2 …); a referenceId must be one of them. */
  handles: ReadonlySet<string>;
  /** Refs of the session's open items; continues.ref must be one of them. */
  openItemRefs: ReadonlySet<string>;
}

export type UnderstandValidation =
  | { ok: true; output: UnderstandOutput; dropped: string[] }
  | { ok: false; errors: string[] };

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const oneOf = <T extends string>(list: readonly T[], value: unknown): value is T => typeof value === "string" && (list as readonly string[]).includes(value);

/** The JSON object in a model's text (a ```json fence is tolerated). */
export function parseModelJson(text: string): { ok: true; value: unknown } | { ok: false; error: string } {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/u, "").replace(/\s*```$/u, "");
  try {
    return { ok: true, value: JSON.parse(trimmed) };
  } catch (error) {
    return { ok: false, error: `the output is not valid JSON (${error instanceof Error ? error.message : String(error)})` };
  }
}

/** Parts whose dependsOn forms a cycle (localIds on it), or null. */
export function findDependencyCycle(parts: readonly Pick<UnderstandPart, "localId" | "dependsOn">[]): string[] | null {
  const edges = new Map(parts.map((part) => [part.localId, part.dependsOn]));
  const state = new Map<string, "visiting" | "done">();
  const stack: string[] = [];
  const visit = (id: string): string[] | null => {
    if (state.get(id) === "done") return null;
    if (state.get(id) === "visiting") return stack.slice(stack.indexOf(id)).concat(id);
    state.set(id, "visiting");
    stack.push(id);
    for (const next of edges.get(id) ?? []) {
      const cycle = visit(next);
      if (cycle) return cycle;
    }
    stack.pop();
    state.set(id, "done");
    return null;
  };
  for (const part of parts) {
    const cycle = visit(part.localId);
    if (cycle) return cycle;
  }
  return null;
}

function stringList(value: unknown, field: string, errors: string[]): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    errors.push(`${field} must be a list of strings`);
    return [];
  }
  return value.map((item) => String(item));
}

export function validateUnderstandOutput(raw: unknown, input: UnderstandValidationInput): UnderstandValidation {
  const errors: string[] = [];
  const dropped: string[] = [];
  if (!isRecord(raw)) return { errors: ["the output must be one JSON object with plainChat, reply and parts"], ok: false };
  const value = rejectModelApprovalClaims(raw, "understand") as Record<string, unknown>;
  for (const key of CODE_DECIDED) if (key in value) dropped.push(`$.${key}`);
  if (typeof value.plainChat !== "boolean") errors.push("plainChat must be true or false");
  const reply = typeof value.reply === "string" && value.reply.trim() ? value.reply.trim() : undefined;
  if (value.reply !== undefined && value.reply !== null && typeof value.reply !== "string") errors.push("reply must be a string");
  if (value.plainChat === true && !reply) errors.push("plainChat is true, so reply must be the answer text");
  if (value.plainChat === true && reply && Array.isArray(value.parts) && value.parts.length === 0 && input.message.trim()) {
    // Plain chat with no part listed: the whole message is one discussion part (no capability, nothing to route elsewhere).
    dropped.push("$.parts (empty for plain chat; the whole message is taken as one discussion part)");
    value.parts = [{ clarity: "clear", constraints: [], dataSources: ["turn_material"], deliverable: "answer", dependsOn: [], goal: input.message.trim(), localId: "p1", objectClues: [], requiredCapabilities: [], sourceQuote: input.message.trim() }];
  }
  if (!Array.isArray(value.parts) || value.parts.length === 0) {
    errors.push("parts must list at least one part");
    return { errors, ok: false };
  }
  if (value.parts.length > MAX_PARTS) errors.push(`at most ${MAX_PARTS} parts`);
  const parts: UnderstandPart[] = [];
  const ids = new Set<string>();
  value.parts.forEach((item: unknown, index: number) => {
    const where = `parts[${index}]`;
    if (!isRecord(item)) {
      errors.push(`${where} must be an object`);
      return;
    }
    for (const key of CODE_DECIDED) if (key in item) dropped.push(`$.${where}.${key}`);
    const localId = typeof item.localId === "string" ? item.localId.trim() : "";
    if (!localId) errors.push(`${where}.localId is required`);
    else if (ids.has(localId)) errors.push(`${where}.localId ${localId} is used twice`);
    ids.add(localId);
    const sourceQuote = typeof item.sourceQuote === "string" ? item.sourceQuote.trim() : "";
    if (!sourceQuote) errors.push(`${where}.sourceQuote is required`);
    else if (!input.message.includes(sourceQuote)) errors.push(`${where}.sourceQuote "${sourceQuote}" is not copied exactly from the user's message; copy a continuous piece of it character for character`);
    const goal = typeof item.goal === "string" ? item.goal.trim() : "";
    if (!goal) errors.push(`${where}.goal is required`);
    if (!oneOf(CLARITIES, item.clarity)) errors.push(`${where}.clarity must be one of ${CLARITIES.join(", ")}`);
    if (!oneOf(DELIVERABLES, item.deliverable)) errors.push(`${where}.deliverable must be one of ${DELIVERABLES.join(", ")}`);
    const intentBasis = item.intentBasis === undefined ? "instruction" : item.intentBasis;
    if (!oneOf(INTENT_BASES, intentBasis)) errors.push(`${where}.intentBasis must be one of ${INTENT_BASES.join(", ")}`);
    const dataOwner = item.dataOwner === undefined ? "self" : item.dataOwner;
    if (!oneOf(DATA_OWNERS, dataOwner)) errors.push(`${where}.dataOwner must be one of ${DATA_OWNERS.join(", ")}`);
    const persistence = item.persistence === undefined ? "this_turn" : item.persistence;
    if (!oneOf(PERSISTENCES, persistence)) errors.push(`${where}.persistence must be one of ${PERSISTENCES.join(", ")}`);
    const capabilities: Capability[] = [];
    if (item.requiredCapabilities !== undefined && !Array.isArray(item.requiredCapabilities)) errors.push(`${where}.requiredCapabilities must be a list`);
    for (const capability of Array.isArray(item.requiredCapabilities) ? item.requiredCapabilities : []) {
      if (isCapability(capability)) capabilities.push(capability);
      else errors.push(`${where}.requiredCapabilities has "${String(capability)}", which is not in the capability list`);
    }
    const dataSources = stringList(item.dataSources, `${where}.dataSources`, errors);
    for (const source of dataSources) if (!oneOf(DATA_SOURCES, source)) errors.push(`${where}.dataSources has "${source}"; use ${DATA_SOURCES.join(", ")}`);
    const constraints = stringList(item.constraints, `${where}.constraints`, errors);
    const dependsOn = stringList(item.dependsOn, `${where}.dependsOn`, errors);
    const clues: ObjectClue[] = [];
    if (item.objectClues !== undefined && !Array.isArray(item.objectClues)) errors.push(`${where}.objectClues must be a list`);
    (Array.isArray(item.objectClues) ? item.objectClues : []).forEach((clue: unknown, clueIndex: number) => {
      const at = `${where}.objectClues[${clueIndex}]`;
      if (!isRecord(clue)) {
        errors.push(`${at} must be an object`);
        return;
      }
      if (!oneOf(ENTITIES, clue.entity)) errors.push(`${at}.entity must be one of ${ENTITIES.join(", ")}`);
      const text = typeof clue.text === "string" ? clue.text.trim() : "";
      if (!text) errors.push(`${at}.text is required`);
      const referenceId = typeof clue.referenceId === "string" && clue.referenceId.trim() ? clue.referenceId.trim() : undefined;
      if (clue.referenceId !== undefined && clue.referenceId !== null && typeof clue.referenceId !== "string") errors.push(`${at}.referenceId must be a string`);
      if (referenceId && !input.handles.has(referenceId)) errors.push(`${at}.referenceId "${referenceId}" is not one of the record handles given in the context (${[...input.handles].join(", ") || "none"}); leave it out when no handle fits`);
      clues.push({ entity: clue.entity as ObjectClue["entity"], text, ...(referenceId ? { referenceId } : {}) });
    });
    let continues: UnderstandPart["continues"];
    if (item.continues !== undefined && item.continues !== null) {
      if (!isRecord(item.continues) || !oneOf(CONTINUE_KINDS, item.continues.kind) || typeof item.continues.ref !== "string") errors.push(`${where}.continues must be { kind, ref }`);
      else if (!input.openItemRefs.has(item.continues.ref)) errors.push(`${where}.continues.ref "${item.continues.ref}" is not one of the open items (${[...input.openItemRefs].join(", ") || "none"})`);
      else continues = { kind: item.continues.kind, ref: item.continues.ref };
    }
    parts.push({
      clarity: item.clarity as UnderstandPart["clarity"],
      constraints,
      dataOwner: dataOwner as UnderstandPart["dataOwner"],
      dataSources: dataSources as UnderstandPart["dataSources"],
      deliverable: item.deliverable as UnderstandPart["deliverable"],
      dependsOn,
      goal,
      intentBasis: intentBasis as UnderstandPart["intentBasis"],
      localId,
      objectClues: clues,
      persistence: persistence as UnderstandPart["persistence"],
      requiredCapabilities: capabilities,
      sourceQuote,
      ...(continues ? { continues } : {}),
    });
  });
  for (const part of parts) {
    for (const dependency of part.dependsOn) {
      if (dependency === part.localId) errors.push(`part ${part.localId} depends on itself`);
      else if (!ids.has(dependency)) errors.push(`part ${part.localId} depends on ${dependency}, which is not a part of this output`);
    }
  }
  const cycle = findDependencyCycle(parts.filter((part) => part.localId));
  if (cycle) errors.push(`dependsOn forms a cycle: ${cycle.join(" → ")}`);
  if (errors.length) return { errors, ok: false };
  return { dropped, ok: true, output: { parts, plainChat: value.plainChat as boolean, ...(reply ? { reply } : {}) } };
}
