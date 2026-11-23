/**
 * Checks of the second layer's output (设计稿附录 C 末段; agent-design AG06, PLANNER 易错边界 3).
 *
 * - Approval flags and account ids are stripped before anything else and reported
 *   (`model.approval_claims_rejected`, where "propose"); they never reach a card or the ledger (AE-BND-002).
 * - Every text must be a piece of the CURRENT message; it is kept as offsets.
 * - Only the parts handed over as writes, only the operations this version proposes, only the fields of
 *   附录 B; unknown keys of an operation are dropped and reported.
 * - dependsOn must name operations of the output and have no cycle (code decides dependencies between
 *   items itself, from the user's words; the model's are only traced).
 */
import { rejectModelApprovalClaims } from "../entry/approval-claims";
import { emitTrace } from "../observability/trace";
import { parseModelJson } from "../understand/validate";
import { MEMO_CHANNELS, MEMO_DIRECTIONS, PROPOSE_ENTITIES, PROPOSE_VERBS, RELATION_ROLES, VALUE_FIELDS, type StoredIntent } from "./schema";

export const PROPOSED_CAPABILITIES = ["todo.create", "todo.update", "memo.create", "contact.create", "contact.update", "contact.delete", "contact.restore", "contact.import",
  // AG13: private events, «我去过», schedule items, the other to-do verbs, and a memo's event links.
  "privateEvent.create", "privateEvent.update", "privateEvent.delete", "attendance.create", "attendance.delete", "schedule.create", "schedule.update", "schedule.delete", "todo.complete", "todo.reopen", "todo.delete", "memo.update"] as const;
const OPERATION_KEYS = new Set(["localId", "partId", "entity", "verb", "selector", "fields", "dateText", "relations", "channel", "direction", "dependsOn", "timeText", "eventClues", "dueText", "timeZoneText", "durationText"]);
/** AG20a: optional words kept as offsets (a to-do's deadline, a schedule item's zone and length). */
const EXTRA_SPANS = [["dueText", "due"], ["timeZoneText", "zone"], ["durationText", "duration"]] as const;

export interface ProposeValidationInput {
  message: string;
  /** The write parts: id → capabilities the first layer named. */
  parts: ReadonlyMap<string, readonly string[]>;
}

export type ProposeChecked =
  | { ok: true; intents: Map<string, StoredIntent[]>; modelDependsOn: Map<string, string[]> }
  | { ok: false; errors: string[] };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

export function checkProposeOutput(text: string, input: ProposeValidationInput): ProposeChecked {
  const parsed = parseModelJson(text);
  if (parsed.ok === false) return { errors: [parsed.error], ok: false };
  const value = rejectModelApprovalClaims(parsed.value, "propose");
  return validateProposeOutput(value, input);
}

export function validateProposeOutput(value: unknown, input: ProposeValidationInput): ProposeChecked {
  const errors: string[] = [];
  const message = input.message;
  const span = (words: unknown, what: string): [number, number] | null => {
    if (typeof words !== "string" || !words.trim()) {
      errors.push(`${what} must be a non-empty string`);
      return null;
    }
    const trimmed = words.trim();
    const at = message.indexOf(trimmed);
    if (at < 0) {
      errors.push(`${what} "${trimmed.slice(0, 60)}" is not copied from the CURRENT message`);
      return null;
    }
    return [at, at + trimmed.length];
  };
  if (!isRecord(value) || !Array.isArray(value.operations)) return { errors: ["output must be {\"operations\": [...]}"], ok: false };
  const intents = new Map<string, StoredIntent[]>();
  const modelDependsOn = new Map<string, string[]>();
  const ids = new Set<string>();
  const dropped: string[] = [];
  for (const [index, raw] of value.operations.entries()) {
    const where = `operations[${index}]`;
    if (!isRecord(raw)) {
      errors.push(`${where} must be an object`);
      continue;
    }
    for (const key of Object.keys(raw)) if (!OPERATION_KEYS.has(key)) dropped.push(`${where}.${key}`);
    const localId = typeof raw.localId === "string" && raw.localId.trim() ? raw.localId.trim() : `w${index + 1}`;
    if (ids.has(localId)) errors.push(`${where}.localId ${localId} is used twice`);
    ids.add(localId);
    const partId = typeof raw.partId === "string" ? raw.partId : "";
    const partCapabilities = input.parts.get(partId);
    if (!partCapabilities) {
      errors.push(`${where}.partId must be one of ${[...input.parts.keys()].join(", ")}`);
      continue;
    }
    if (!(PROPOSE_ENTITIES as readonly unknown[]).includes(raw.entity) || !(PROPOSE_VERBS as readonly unknown[]).includes(raw.verb)) {
      errors.push(`${where}: entity must be todo, memo, contact, privateEvent, attendance or schedule and verb create, update, delete, restore, import, complete or reopen`);
      continue;
    }
    const capability = `${raw.entity}.${raw.verb}` as StoredIntent["capability"];
    if (!(PROPOSED_CAPABILITIES as readonly string[]).includes(capability)) {
      errors.push(`${where}: ${capability} is not an operation this step proposes (use one of ${PROPOSED_CAPABILITIES.join(", ")})`);
      continue;
    }
    if (!partCapabilities.includes(capability)) {
      errors.push(`${where}: part ${partId} asks for ${partCapabilities.join(", ")}, not ${capability}`);
      continue;
    }
    const stored: StoredIntent = { capability, localId, relations: [], selector: [] };
    if (raw.selector !== undefined) {
      const clues = isRecord(raw.selector) && Array.isArray(raw.selector.clues) ? raw.selector.clues : null;
      if (!clues) errors.push(`${where}.selector must be {"clues": [...]}`);
      else for (const [at, clue] of clues.entries()) {
        const found = span(clue, `${where}.selector.clues[${at}]`);
        if (found) stored.selector.push(found);
      }
    }
    for (const [at, field] of (Array.isArray(raw.fields) ? raw.fields : []).entries()) {
      const name = isRecord(field) ? field.name : undefined;
      if (typeof name !== "string" || !(VALUE_FIELDS[capability] ?? []).includes(name)) {
        errors.push(`${where}.fields[${at}].name must be one of ${(VALUE_FIELDS[capability] ?? []).join(", ") || "(none)"} for ${capability}`);
        continue;
      }
      const found = span((field as Record<string, unknown>).valueText, `${where}.fields[${at}].valueText`);
      if (found && capability.startsWith("contact.")) stored.values = { ...(stored.values ?? {}), [name]: found };
      else if (found && (name === "venue" || name === "note")) stored[name] = found;
      else if (found) stored[name === "body" ? "body" : "title"] = found;
    }
    if (raw.dateText !== undefined && raw.dateText !== null && raw.dateText !== "") {
      const found = span(raw.dateText, `${where}.dateText`);
      if (found) stored.date = found;
    }
    // AG13: the time words and the event clues, as offsets too.
    if (raw.timeText !== undefined && raw.timeText !== null && raw.timeText !== "") {
      const found = span(raw.timeText, `${where}.timeText`);
      if (found) stored.time = found;
    }
    for (const [key, field] of EXTRA_SPANS) {
      // Optional: words not copied from the message are left out (code reads the message itself), never a repair call.
      const said = typeof raw[key] === "string" ? String(raw[key]).trim() : "";
      if (!said) continue;
      const at = message.indexOf(said);
      if (at >= 0) stored[field] = [at, at + said.length];
      else dropped.push(`${where}.${key}`);
    }
    if (raw.eventClues !== undefined) {
      if (!Array.isArray(raw.eventClues)) errors.push(`${where}.eventClues must be a list of words`);
      else for (const [at, clue] of raw.eventClues.entries()) {
        const found = span(clue, `${where}.eventClues[${at}]`);
        if (found) stored.events = [...(stored.events ?? []), found];
      }
    }
    for (const [at, relation] of (Array.isArray(raw.relations) ? raw.relations : []).entries()) {
      if (!isRecord(relation) || relation.entity !== "contact" || !(RELATION_ROLES as readonly unknown[]).includes(relation.role)) {
        errors.push(`${where}.relations[${at}] must be {"entity": "contact", "clue": …, "role": actual_contact | mentioned | about}`);
        continue;
      }
      const found = span(relation.clue, `${where}.relations[${at}].clue`);
      if (found) stored.relations.push({ quote: found, role: relation.role as StoredIntent["relations"][number]["role"] });
    }
    if (capability === "memo.create") {
      if ((MEMO_CHANNELS as readonly unknown[]).includes(raw.channel)) stored.channel = raw.channel as StoredIntent["channel"];
      if ((MEMO_DIRECTIONS as readonly unknown[]).includes(raw.direction)) stored.direction = raw.direction as StoredIntent["direction"];
    }
    modelDependsOn.set(localId, Array.isArray(raw.dependsOn) ? raw.dependsOn.filter((id): id is string => typeof id === "string") : []);
    const firstDep = modelDependsOn.get(localId)?.[0];
    if (firstDep) stored.after = firstDep;
    intents.set(partId, [...(intents.get(partId) ?? []), stored]);
  }
  for (const [id, deps] of modelDependsOn) {
    for (const dep of deps) if (!ids.has(dep) || dep === id) errors.push(`dependsOn of ${id} names ${dep}, which is not another operation of this output`);
  }
  // No cycles among the model's dependencies (traced only; code decides the card's dependencies).
  const visiting = new Set<string>();
  const done = new Set<string>();
  const cyclic = (id: string): boolean => {
    if (done.has(id)) return false;
    if (visiting.has(id)) return true;
    visiting.add(id);
    const found = (modelDependsOn.get(id) ?? []).some(cyclic);
    visiting.delete(id);
    done.add(id);
    return found;
  };
  if ([...modelDependsOn.keys()].some(cyclic)) errors.push("dependsOn has a cycle");
  if (dropped.length) emitTrace({ dropped, note: "fields outside the operation schema are not accepted", type: "propose.fields_dropped" });
  if (errors.length) return { errors, ok: false };
  return { intents, modelDependsOn, ok: true };
}
