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
import { isQualifierCode } from "../web/vocabulary";
import {
  CLARITIES,
  CONTINUE_KINDS,
  DATA_OWNERS,
  DATA_SOURCES,
  DELIVERABLES,
  ENTITIES,
  INTENT_BASES,
  MAX_READINGS,
  PERSISTENCES,
  RANK_FIELDS,
  READ_ORDERS,
  READ_STATUSES,
  type ObjectClue,
  type RankSpec,
  type ReadFilter,
  type WebTargetSpec,
  type UnderstandOutput,
  type UnderstandPart,
  type UnderstandReading,
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

const DAY = /^\d{4}-\d{2}-\d{2}$/u;
const validDay = (value: unknown): value is string => typeof value === "string" && DAY.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value);

/**
 * AG05: a part's readFilter, keeping only what is valid (words copied from the message, a known order
 * or status, real dates); the rest is dropped and reported, never a reason to reject the output.
 */
function readFilterOf(raw: unknown, message: string, where: string, dropped: string[]): ReadFilter | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (!isRecord(raw)) {
    dropped.push(`${where} (not an object)`);
    return undefined;
  }
  const out: ReadFilter = {};
  const text = typeof raw.text === "string" ? raw.text.trim().replace(/^["“「『]|["”」』]$/gu, "") : "";
  if (text && message.includes(text)) out.text = text.slice(0, 80);
  else if (raw.text !== undefined && raw.text !== null && raw.text !== "") dropped.push(`${where}.text (${JSON.stringify(raw.text).slice(0, 40)} is not words of the message)`);
  if (oneOf(READ_ORDERS, raw.order)) out.order = raw.order;
  else if (raw.order !== undefined && raw.order !== null) dropped.push(`${where}.order (${JSON.stringify(raw.order)})`);
  if (oneOf(READ_STATUSES, raw.status)) out.status = raw.status;
  else if (raw.status !== undefined && raw.status !== null) dropped.push(`${where}.status (${JSON.stringify(raw.status)})`);
  if (raw.current === true) out.current = true;
  else if (raw.current !== undefined && raw.current !== null && raw.current !== false) dropped.push(`${where}.current (${JSON.stringify(raw.current)})`);
  const from = validDay(raw.from) ? raw.from : undefined;
  const to = validDay(raw.to) ? raw.to : undefined;
  if (raw.from !== undefined && raw.from !== null && !from) dropped.push(`${where}.from (${JSON.stringify(raw.from)})`);
  if (raw.to !== undefined && raw.to !== null && !to) dropped.push(`${where}.to (${JSON.stringify(raw.to)})`);
  if (from && to && from > to) {
    out.from = to;
    out.to = from;
  } else {
    if (from) out.from = from;
    if (to) out.to = to;
  }
  return Object.keys(out).length ? out : undefined;
}

const quoted = (value: unknown) => (typeof value === "string" ? value.trim().replace(/^["“「『]|["”」』]$/gu, "") : "");

/** AG08: a part's rank spec, keeping only what is valid (words copied from the message, a known field); never a reason to reject. */
function rankOf(raw: unknown, message: string, where: string, dropped: string[]): RankSpec | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (!isRecord(raw)) {
    dropped.push(`${where} (not an object)`);
    return undefined;
  }
  const out: RankSpec = {};
  const count = typeof raw.count === "string" && /^\d+$/u.test(raw.count) ? Number(raw.count) : raw.count;
  if (typeof count === "number" && Number.isInteger(count) && count >= 1 && count <= 50) out.count = count;
  else if (raw.count !== undefined && raw.count !== null) dropped.push(`${where}.count (${JSON.stringify(raw.count)})`);
  for (const key of ["basis", "within"] as const) {
    const text = quoted(raw[key]);
    if (text && message.includes(text)) out[key] = text.slice(0, 120);
    else if (text) dropped.push(`${where}.${key} (${JSON.stringify(raw[key]).slice(0, 40)} is not words of the message)`);
  }
  if (oneOf(RANK_FIELDS, raw.orderBy)) out.orderBy = raw.orderBy;
  else if (raw.orderBy !== undefined && raw.orderBy !== null) dropped.push(`${where}.orderBy (${JSON.stringify(raw.orderBy)})`);
  if (raw.direction === "asc" || raw.direction === "desc") out.direction = raw.direction;
  else if (raw.direction !== undefined && raw.direction !== null) dropped.push(`${where}.direction (${JSON.stringify(raw.direction)})`);
  return Object.keys(out).length ? out : undefined;
}

/** AG09: a part's webTarget, keeping a quote copied from the message and known qualifier codes; never a reason to reject. */
function webTargetOf(raw: unknown, message: string, where: string, dropped: string[]): WebTargetSpec | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (!isRecord(raw)) {
    dropped.push(`${where} (not an object)`);
    return undefined;
  }
  const out: WebTargetSpec = { qualifiers: [] };
  const text = quoted(raw.quote);
  if (text && message.includes(text)) out.quote = text.slice(0, 100);
  else if (text) dropped.push(`${where}.quote (${JSON.stringify(raw.quote).slice(0, 40)} is not words of the message)`);
  for (const code of Array.isArray(raw.qualifiers) ? raw.qualifiers : []) {
    if (isQualifierCode(code)) {
      if (!out.qualifiers.includes(code)) out.qualifiers.push(code);
    } else dropped.push(`${where}.qualifiers (${JSON.stringify(code).slice(0, 30)} is not a qualifier code)`);
  }
  return out.quote || out.qualifiers.length ? out : undefined;
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
      const text = isRecord(clue) && typeof clue.text === "string" ? clue.text.trim() : "";
      if (!isRecord(clue) || !oneOf(ENTITIES, clue.entity) || !text) {
        // A clue that names no Orbit record kind (or no words) points at nothing code could bind; it is
        // dropped and reported, not a reason to reject the whole output (a referenceId on it would be).
        if (isRecord(clue) && typeof clue.referenceId === "string" && clue.referenceId.trim()) errors.push(`${at} has a referenceId but no valid entity and text`);
        else dropped.push(`$.${at} (not a clue to an Orbit record: ${JSON.stringify(clue).slice(0, 80)})`);
        return;
      }
      const referenceId = typeof clue.referenceId === "string" && clue.referenceId.trim() ? clue.referenceId.trim() : undefined;
      if (clue.referenceId !== undefined && clue.referenceId !== null && typeof clue.referenceId !== "string") errors.push(`${at}.referenceId must be a string`);
      if (referenceId && !input.handles.has(referenceId)) errors.push(`${at}.referenceId "${referenceId}" is not one of the record handles given in the context (${[...input.handles].join(", ") || "none"}); leave it out when no handle fits`);
      clues.push({ entity: clue.entity as ObjectClue["entity"], text, ...(referenceId ? { referenceId } : {}) });
    });
    // AG04: readings are hints for code (附录 C). One with a capability outside 附录 A, or with none, is
    // dropped whole and reported; it is never a reason to reject the output.
    const readings: UnderstandReading[] = [];
    if (item.readings !== undefined && item.readings !== null && !Array.isArray(item.readings)) dropped.push(`$.${where}.readings (not a list)`);
    (Array.isArray(item.readings) ? item.readings : []).forEach((reading: unknown, readingIndex: number) => {
      const at = `$.${where}.readings[${readingIndex}]`;
      const list = isRecord(reading) && Array.isArray(reading.capabilities) ? reading.capabilities : [];
      if (!isRecord(reading) || !list.length || !list.every(isCapability) || readings.length >= MAX_READINGS) {
        dropped.push(`${at} (${readings.length >= MAX_READINGS ? `more than ${MAX_READINGS}` : "not a reading of Orbit capabilities"})`);
        return;
      }
      readings.push({ capabilities: [...new Set(list as Capability[])], deliverable: oneOf(DELIVERABLES, reading.deliverable) ? reading.deliverable : "answer", label: typeof reading.label === "string" ? reading.label.slice(0, 80) : "" });
    });
    const readFilter = readFilterOf(item.readFilter, input.message, `$.${where}.readFilter`, dropped);
    const rank = rankOf(item.rank, input.message, `$.${where}.rank`, dropped);
    const webTarget = webTargetOf(item.webTarget, input.message, `$.${where}.webTarget`, dropped);
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
      ...(readings.length ? { readings } : {}),
      ...(readFilter ? { readFilter } : {}),
      ...(rank ? { rank } : {}),
      ...(webTarget ? { webTarget } : {}),
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
  // AG06: the language the first layer reports for the message (checked against the text by replyLanguageOf).
  const language = value.language === "zh" || value.language === "ja" || value.language === "en" ? value.language : undefined;
  return { dropped, ok: true, output: { ...(language ? { language } : {}), parts, plainChat: value.plainChat as boolean, ...(reply ? { reply } : {}) } };
}
