import fs from "node:fs";
import path from "node:path";
import { CASES_DIR, SEALED_DIR, SPRINTS_MD } from "./paths";
import { readYamlFile } from "./yaml";

export type Step = Record<string, any>;
export type HardCheck = Record<string, any>;

export interface EvalCase {
  id: string;
  title: string;
  sprint: string;
  gate?: string;
  split: string;
  invariant: boolean;
  requirement: string[];
  design: string[];
  locale: string;
  world: string;
  account?: string;
  patches?: string[];
  clock?: string;
  settings?: Record<string, any>;
  conversation?: string;
  interference?: unknown;
  steps: Step[];
  hard: HardCheck[];
  rubric: { id: string; text: string }[];
  notes?: string;
  [key: string]: unknown;
}

export interface AreaFile {
  file: string;
  sealed: boolean;
  area: string;
  proposed_checks?: { name: string; usage?: string; meaning?: string }[];
  proposed_steps?: { name: string; usage?: string; meaning?: string }[];
  new_patches?: Record<string, any>;
  cases: EvalCase[];
  raw: Record<string, any>;
}

/** Visible area files; the sealed set is read only when asked for explicitly. */
export function listAreaFiles(options: { sealed?: boolean; dir?: string } = {}): string[] {
  const dir = options.dir ?? CASES_DIR;
  const files = fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".yaml"))
    .map((name) => path.join(dir, name))
    .sort();
  if (!options.sealed) return files;
  const sealedDir = options.dir ? path.join(options.dir, "sealed") : SEALED_DIR;
  const sealed = fs.existsSync(sealedDir)
    ? fs.readdirSync(sealedDir).filter((name) => name.endsWith(".yaml")).map((name) => path.join(sealedDir, name)).sort()
    : [];
  return [...files, ...sealed];
}

export function loadAreaFile(file: string): AreaFile {
  const raw = readYamlFile<Record<string, any>>(file) ?? {};
  return {
    area: raw.area,
    cases: Array.isArray(raw.cases) ? raw.cases : [],
    file,
    new_patches: raw.new_patches ?? {},
    proposed_checks: raw.proposed_checks ?? [],
    proposed_steps: raw.proposed_steps ?? [],
    raw,
    sealed: file.includes(`${path.sep}sealed${path.sep}`),
  };
}

export function loadAreaFiles(options: { sealed?: boolean; dir?: string } = {}): AreaFile[] {
  return listAreaFiles(options).map(loadAreaFile);
}

export function caseArea(id: string): string | null {
  return id.match(/^AE-([A-Z]+)-\d{3}$/u)?.[1] ?? null;
}

/** The sprint whose gate the case belongs to (README §6). */
export function gateOf(testCase: Pick<EvalCase, "gate" | "sprint">): string {
  return testCase.gate ?? testCase.sprint;
}

export function sprintNumber(sprint: string): number {
  const match = sprint.match(/^AG(\d{2})$/u);
  if (!match) throw new Error(`Not a sprint id: ${sprint}`);
  return Number(match[1]);
}

/** Cases that probe the outbound guard void their run, so they run alone (H.yaml AE-H-006 notes). */
export function requiresSoloRun(testCase: EvalCase): boolean {
  return testCase.steps.some((step) => step && typeof step === "object" && "egress_probe" in step);
}

export interface Selection {
  cases: EvalCase[];
  /** Selected but left out because they must run alone. */
  solo: EvalCase[];
  invariants: EvalCase[];
}

/**
 * --gate AGnn: cases whose gate is AGnn, plus the invariant pack (from AG02 on) with gate not later than AGnn.
 * --all: every visible case. --case: exactly the named cases (solo cases are allowed only this way).
 */
export function selectCases(
  areaFiles: readonly AreaFile[],
  options: { gate?: string; all?: boolean; caseIds?: readonly string[]; sealed?: boolean },
): Selection {
  const all = areaFiles.filter((file) => (options.sealed ? true : !file.sealed)).flatMap((file) => file.cases);
  let chosen: EvalCase[];
  let invariants: EvalCase[] = [];
  if (options.caseIds?.length) {
    const wanted = new Set(options.caseIds);
    chosen = all.filter((testCase) => wanted.has(testCase.id));
    const missing = [...wanted].filter((id) => !chosen.some((testCase) => testCase.id === id));
    if (missing.length) throw new Error(`Unknown case id(s): ${missing.join(", ")}`);
    return { cases: chosen, invariants, solo: [] };
  }
  if (options.gate) {
    const gate = sprintNumber(options.gate);
    chosen = all.filter((testCase) => gateOf(testCase) === options.gate);
    if (gate >= 2) {
      invariants = all.filter(
        (testCase) => testCase.invariant && gateOf(testCase) !== options.gate && sprintNumber(gateOf(testCase)) <= gate,
      );
    }
    chosen = [...chosen, ...invariants];
  } else if (options.all || options.sealed) {
    chosen = all;
  } else {
    throw new Error("Choose --gate AGnn, --all, --sealed or --case <id>.");
  }
  return {
    cases: chosen.filter((testCase) => !requiresSoloRun(testCase)),
    invariants: invariants.filter((testCase) => !requiresSoloRun(testCase)),
    solo: chosen.filter(requiresSoloRun),
  };
}

/** SPRINTS.md registry: sprint → areas in its gate column ("UND ×14、CTX ×6、SCL ×3"). */
export function readGateAreas(file = SPRINTS_MD): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/u)) {
    const cells = line.split("|").map((cell) => cell.trim());
    if (!/^AG\d{2}$/u.test(cells[1] ?? "")) continue;
    const gateCell = cells[7] ?? "";
    const areas = new Set([...gateCell.matchAll(/\b([A-Z]{1,4})\s*×/gu)].map((match) => match[1]));
    out.set(cells[1], areas);
  }
  return out;
}
