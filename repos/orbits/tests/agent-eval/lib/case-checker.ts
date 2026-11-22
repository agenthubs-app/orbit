import path from "node:path";
import { caseArea, readGateAreas, sprintOrder, type AreaFile, type EvalCase } from "./cases";
import {
  ACCOUNTS,
  CHECK_WORDS,
  CLIENTS,
  FAULT_KINDS,
  LOCALES,
  OPTIONAL_CASE_FIELDS,
  REQUIRED_CASE_FIELDS,
  SETTING_KEYS,
  SPLITS,
  STEP_MODIFIERS,
  STEP_WORDS,
  WORLD_FOR_ACCOUNT,
} from "./vocabulary";
import { casePatchDefinitions, replacingPatchOf } from "./patched-world";
import { idInRanges, loadWorld, patchProblems, patchRecords, worldWithPatches, type WorldFixture } from "./world";

export interface CheckIssue {
  file: string;
  caseId: string | null;
  field: string;
  message: string;
}

const TOP_LEVEL_KEYS = new Set(["area", "proposed_checks", "proposed_steps", "new_patches", "cases"]);
const CASE_FIELDS = new Set<string>([...REQUIRED_CASE_FIELDS, ...OPTIONAL_CASE_FIELDS]);
/** A token that names a fixture record: C17, RM05, LC10001, or "memo:M31". */
const RECORD_TOKEN = /^(?:[a-z_]+:)?([A-Z]{1,4}\d{1,5})$/u;
/** Values under these keys are not record references. */
// answer_excludes lists text fragments (an "IP67" is not a record id).
const NON_REFERENCE_KEYS = new Set(["fault", "expect_judge_verdicts", "expect_hard_fail", "switch_account", "client", "as", "item", "quote", "answer_excludes"]);
/**
 * Ids the cases name on purpose although no fixture has them. E999 is the phantom candidate that the
 * `phantom_candidate` fault injects (README §3.4) and that checks must not find in a result.
 */
const SYNTHETIC_IDS = new Set(["E999"]);

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export interface CheckerContext {
  worlds: Map<string, WorldFixture>;
  gateAreas: Map<string, Set<string>>;
}

/** AG12 run-02: "later" is in the execution order (cases.ts SPRINT_EXECUTION_ORDER), not by sprint number. */
const sprintOrderSafe = (sprint: string) => {
  try {
    return sprintOrder(sprint);
  } catch {
    return Number(sprint.slice(2));
  }
};
const laterOrSame = (left: string, right: string) => sprintOrderSafe(right) <= sprintOrderSafe(left);

export function createCheckerContext(options: { worlds?: Map<string, WorldFixture>; gateAreas?: Map<string, Set<string>> } = {}): CheckerContext {
  return {
    gateAreas: options.gateAreas ?? readGateAreas(),
    worlds: options.worlds ?? new Map(["base-v1", "regular-v1", "large-v1"].map((name) => [name, loadWorld(name)])),
  };
}

/** Every record token referenced in steps and hard checks, with the field path it was found at. */
export function collectRecordReferences(value: unknown, at = ""): { id: string; at: string }[] {
  const out: { id: string; at: string }[] = [];
  if (typeof value === "string") {
    const match = value.match(RECORD_TOKEN);
    if (match) out.push({ at, id: match[1] });
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => out.push(...collectRecordReferences(item, `${at}[${index}]`)));
    return out;
  }
  if (isRecord(value)) {
    for (const [key, item] of Object.entries(value)) {
      if (NON_REFERENCE_KEYS.has(key)) continue;
      const keyMatch = key.match(RECORD_TOKEN);
      if (keyMatch && !key.includes(".")) out.push({ at: `${at}.${key}`, id: keyMatch[1] });
      out.push(...collectRecordReferences(item, at ? `${at}.${key}` : key));
    }
  }
  return out;
}

function knownIds(world: WorldFixture, patches: readonly string[], filePatches: Record<string, any>): { ids: Set<string>; accounts: Set<string> } {
  const ids = new Set(world.anchors.map((record) => record.id.replace(/^my:/u, "")));
  for (const record of world.anchors) {
    if (record.kind === "my_event") ids.add(String(record.data.eventId));
  }
  const accounts = new Set(Object.keys(world.accounts));
  for (const name of patches) {
    const patch = world.patches[name] ?? filePatches[name];
    if (!patch) continue;
    for (const record of patchRecords(patch, world.mainAccount)) ids.add(record.id);
  }
  return { accounts, ids };
}

function checkSteps(testCase: EvalCase, push: (field: string, message: string) => void): void {
  testCase.steps.forEach((step, index) => {
    const field = `steps[${index}]`;
    if (!isRecord(step)) {
      push(field, "step must be a mapping");
      return;
    }
    const keys = Object.keys(step);
    const words = keys.filter((key) => !STEP_MODIFIERS.includes(key as never));
    if (words.length !== 1) {
      push(field, `step must have exactly one step word, found ${words.length ? words.join(", ") : "none"}`);
      return;
    }
    const [word] = words;
    if (!STEP_WORDS.has(word)) push(field, `undefined step word "${word}"`);
    if ("client" in step && !CLIENTS.includes(step.client)) push(`${field}.client`, `unknown client "${step.client}"`);
    if (word === "fault") {
      const kind = step.fault?.kind;
      if (!FAULT_KINDS.includes(kind)) push(`${field}.fault.kind`, `unknown fault kind "${kind}"`);
      if (typeof step.fault?.where !== "string" || !step.fault.where) push(`${field}.fault.where`, "fault needs a where");
    }
    if (word === "user" && (typeof step.user !== "string" || !step.user.trim())) push(`${field}.user`, "user step needs the message text");
    if (word === "click" && !["confirm", "reject", "defer"].includes(step.click?.decision)) {
      push(`${field}.click.decision`, `unknown decision "${step.click?.decision}"`);
    }
    if (word === "concurrent") {
      if (!Array.isArray(step.concurrent) || step.concurrent.length < 2) push(`${field}.concurrent`, "concurrent needs at least two steps");
      else checkSteps({ ...testCase, steps: step.concurrent }, (sub, message) => push(`${field}.concurrent${sub.replace(/^steps/u, "")}`, message));
    }
  });
}

export function checkCase(testCase: EvalCase, areaFile: AreaFile, context: CheckerContext, seen: Map<string, string>): CheckIssue[] {
  const issues: CheckIssue[] = [];
  const caseId = typeof testCase?.id === "string" ? testCase.id : null;
  const push = (field: string, message: string) => issues.push({ caseId, field, file: path.basename(areaFile.file), message });
  if (!isRecord(testCase)) {
    push("case", "case must be a mapping");
    return issues;
  }
  for (const field of REQUIRED_CASE_FIELDS) {
    if (testCase[field] === undefined || testCase[field] === null) push(field, "missing required field");
  }
  for (const field of Object.keys(testCase)) {
    if (!CASE_FIELDS.has(field)) push(field, "unknown case field");
  }
  if (caseId) {
    const area = caseArea(caseId);
    if (!area) push("id", "id must look like AE-<AREA>-<three digits>");
    else if (area !== areaFile.area && !areaFile.sealed) push("id", `id area ${area} does not match file area ${areaFile.area}`);
    const previous = seen.get(caseId);
    if (previous) push("id", `duplicate id, also in ${previous}`);
    seen.set(caseId, path.basename(areaFile.file));
  }
  // AG19 (answer layout, added 2026-11-19) is the first sprint past AG18.
  const sprintPattern = /^AG(0\d|1[0-9])$/u;
  if (typeof testCase.sprint === "string" && !sprintPattern.test(testCase.sprint)) push("sprint", `unknown sprint "${testCase.sprint}"`);
  if (testCase.gate !== undefined) {
    if (typeof testCase.gate !== "string" || !sprintPattern.test(testCase.gate)) push("gate", `unknown sprint "${testCase.gate}"`);
    else if (typeof testCase.sprint === "string" && sprintPattern.test(testCase.sprint) && laterOrSame(testCase.sprint, testCase.gate)) push("gate", "gate must be later than sprint (in the execution order)");
  }
  const owningSprint = testCase.gate ?? testCase.sprint;
  if (!areaFile.sealed && typeof owningSprint === "string" && sprintPattern.test(owningSprint)) {
    const areas = context.gateAreas.get(owningSprint);
    const area = caseId ? caseArea(caseId) : null;
    if (areas && area && !areas.has(area)) {
      push(testCase.gate ? "gate" : "sprint", `${owningSprint}'s gate (SPRINTS.md) has no ${area} cases`);
    }
  }
  if (testCase.split !== undefined && !SPLITS.includes(testCase.split as never)) push("split", `unknown split "${testCase.split}"`);
  if (testCase.split === "sealed" && !areaFile.sealed) push("split", "a sealed case must live in cases/sealed/");
  if (testCase.invariant !== undefined && typeof testCase.invariant !== "boolean") push("invariant", "must be true or false");
  if (testCase.locale !== undefined && !LOCALES.includes(testCase.locale as never)) push("locale", `unknown locale "${testCase.locale}"`);
  if (testCase.requirement !== undefined && !Array.isArray(testCase.requirement)) push("requirement", "must be a list");
  if (testCase.design !== undefined && !Array.isArray(testCase.design)) push("design", "must be a list");
  const account = (testCase.account ?? "small") as (typeof ACCOUNTS)[number];
  if (!ACCOUNTS.includes(account)) push("account", `unknown account "${testCase.account}"`);
  const world = context.worlds.get(String(testCase.world));
  if (testCase.world !== undefined && !world) push("world", `unknown world "${testCase.world}"`);
  if (world && ACCOUNTS.includes(account) && WORLD_FOR_ACCOUNT[account] !== testCase.world) {
    push("world", `account ${account} runs on ${WORLD_FOR_ACCOUNT[account]}, not ${testCase.world}`);
  }
  if (testCase.clock !== undefined && Number.isNaN(Date.parse(String(testCase.clock)))) push("clock", "not a timestamp");
  const patches = testCase.patches ?? [];
  if (!Array.isArray(patches)) push("patches", "must be a list");
  const filePatches = areaFile.new_patches ?? {};
  for (const name of Array.isArray(patches) ? patches : []) {
    if (!world?.patches[name] && !filePatches[name]) push("patches", `patch "${name}" does not exist in ${testCase.world} or this file's new_patches`);
  }
  // The world as the case sees it: a replacing patch's records in place of the ones it replaces, every patch's web_replay added.
  let caseWorld = world;
  if (world && Array.isArray(patches)) {
    const definitions = casePatchDefinitions(patches, world, filePatches);
    try {
      replacingPatchOf(definitions);
    } catch (error) {
      push("patches", error instanceof Error ? error.message : String(error));
    }
    caseWorld = worldWithPatches(world, definitions.map((item) => item.patch));
  }
  if (testCase.settings !== undefined) {
    if (!isRecord(testCase.settings)) push("settings", "must be a mapping");
    else {
      for (const key of Object.keys(testCase.settings)) {
        if (!SETTING_KEYS.includes(key as never)) push(`settings.${key}`, "unknown setting");
      }
      const replays = testCase.settings.web_replay;
      for (const name of replays === undefined ? [] : Array.isArray(replays) ? replays : [replays]) {
        if (!caseWorld?.webReplay[name]) push("settings.web_replay", `replay "${name}" does not exist in ${testCase.world} or the case's patches`);
      }
    }
  }
  if (!Array.isArray(testCase.steps) || testCase.steps.length === 0) push("steps", "must be a non-empty list");
  else checkSteps(testCase, push);
  if (!Array.isArray(testCase.hard)) push("hard", "must be a list");
  else {
    testCase.hard.forEach((check, index) => {
      if (!isRecord(check) || Object.keys(check).length !== 1) {
        push(`hard[${index}]`, "each check must be a mapping with one check word");
        return;
      }
      const [word] = Object.keys(check);
      if (!CHECK_WORDS.has(word)) push(`hard[${index}]`, `undefined check word "${word}"`);
      if (word === "expect_hard_fail") {
        const names = Array.isArray(check[word]) ? check[word] : [];
        const present = new Set(testCase.hard.map((item) => (isRecord(item) ? Object.keys(item)[0] : "")));
        for (const name of names) {
          if (!present.has(name)) push(`hard[${index}].expect_hard_fail`, `expects "${name}" to fail but the case has no such check`);
        }
      }
      if (word === "expect_judge_verdicts") {
        const rubricIds = new Set((testCase.rubric ?? []).map((item) => item?.id));
        for (const entry of Array.isArray(check[word]) ? check[word] : []) {
          if (!rubricIds.has(entry?.item)) push(`hard[${index}].expect_judge_verdicts`, `rubric item "${entry?.item}" does not exist`);
          if (!["pass", "fail", "unclear"].includes(entry?.verdict)) push(`hard[${index}].expect_judge_verdicts`, `unknown verdict "${entry?.verdict}"`);
        }
      }
    });
  }
  if (!Array.isArray(testCase.rubric) || testCase.rubric.length < 1 || testCase.rubric.length > 4) {
    push("rubric", "must have one to four items");
  } else {
    testCase.rubric.forEach((item, index) => {
      if (!isRecord(item) || typeof item.id !== "string" || typeof item.text !== "string" || !item.text.trim()) {
        push(`rubric[${index}]`, "each item needs an id and a text");
      }
      // README §3.3: an item may count only from a later sprint, never before the case's own gate.
      if (isRecord(item) && item.gate !== undefined) {
        if (typeof item.gate !== "string" || !sprintPattern.test(item.gate)) push(`rubric[${index}].gate`, `unknown sprint "${String(item.gate)}"`);
        else if (typeof owningSprint === "string" && sprintPattern.test(owningSprint) && sprintOrderSafe(item.gate) < sprintOrderSafe(owningSprint)) {
          push(`rubric[${index}].gate`, `${item.gate} is earlier than the case's ${testCase.gate ? "gate" : "sprint"} ${owningSprint}`);
        }
      }
    });
  }
  if (caseWorld) {
    const known = knownIds(caseWorld, Array.isArray(patches) ? patches : [], filePatches);
    if (testCase.conversation !== undefined && !known.ids.has(String(testCase.conversation))) {
      push("conversation", `conversation "${testCase.conversation}" is not in ${testCase.world} or the case's patches`);
    }
    const references = [
      ...collectRecordReferences(testCase.steps, "steps"),
      ...collectRecordReferences(testCase.hard, "hard"),
    ];
    for (const reference of references) {
      if (SYNTHETIC_IDS.has(reference.id) || known.ids.has(reference.id) || known.accounts.has(reference.id)) continue;
      if (idInRanges(reference.id, caseWorld.bulkRanges)) continue;
      push(reference.at, `references ${reference.id}, which is not in ${testCase.world} or the case's patches`);
    }
  }
  return issues;
}

export function checkAreaFiles(areaFiles: readonly AreaFile[], context: CheckerContext = createCheckerContext()): CheckIssue[] {
  const issues: CheckIssue[] = [];
  const seen = new Map<string, string>();
  // Every patch's keys and shape (world files and the area files' new_patches): an unknown key is an error, not ignored.
  for (const world of context.worlds.values()) {
    for (const [name, patch] of Object.entries(world.patches)) {
      for (const message of patchProblems(patch)) issues.push({ caseId: null, field: `patches.${name}`, file: path.basename(world.file), message });
    }
  }
  for (const areaFile of areaFiles) {
    for (const [name, patch] of Object.entries(areaFile.new_patches ?? {})) {
      for (const message of patchProblems(patch)) issues.push({ caseId: null, field: `new_patches.${name}`, file: path.basename(areaFile.file), message });
    }
  }
  for (const areaFile of areaFiles) {
    const file = path.basename(areaFile.file);
    for (const key of Object.keys(areaFile.raw)) {
      if (!TOP_LEVEL_KEYS.has(key)) issues.push({ caseId: null, field: key, file, message: "unknown top-level key" });
    }
    const expectedArea = path.basename(areaFile.file, ".yaml");
    if (!areaFile.sealed && areaFile.area !== expectedArea) {
      issues.push({ caseId: null, field: "area", file, message: `area "${areaFile.area}" does not match the file name` });
    }
    if (!Array.isArray(areaFile.raw.cases)) issues.push({ caseId: null, field: "cases", file, message: "missing case list" });
    for (const testCase of areaFile.cases) issues.push(...checkCase(testCase, areaFile, context, seen));
  }
  return issues;
}

export function formatIssue(issue: CheckIssue): string {
  return `${issue.file} ${issue.caseId ?? "(file)"} ${issue.field}: ${issue.message}`;
}
