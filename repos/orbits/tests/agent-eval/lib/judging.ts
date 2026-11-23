/**
 * Judge packets and the summary of judgments (eval/README.md §5, judge-prompt.md).
 * The runner never judges and never calls an API for judging: packets are read by fresh
 * Claude sessions, each writing its own judge-N.json next to the packet.
 */
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

import type { CheckResult } from "./hard-checks";
import type { TraceEvent } from "./trace-log";

export interface JudgeItem {
  id: string;
  verdict: "pass" | "fail" | "unclear";
  evidence: number[];
  reason: string;
}

export interface JudgeFile {
  caseId: string;
  items: JudgeItem[];
  overall: "pass" | "fail";
  caseIssue: string | null;
  judge: { model: string; session: string; promptVersion: number; at: string };
}

function short(value: unknown, max = 160): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** One line per event, so a judge can cite seqs without reading the whole trace. */
export function eventIndexLine(event: TraceEvent): string {
  const base = `${event.seq} · ${event.type}${event.source ? ` [${event.source}]` : ""}`;
  switch (event.type) {
    case "turn.user":
      return `${base} · ${short(event.text)}`;
    case "turn.assistant":
      return `${base} · ${short(event.text, 220)}${Array.isArray(event.citations) && event.citations.length ? ` · 引用 ${event.citations.join(",")}` : ""}`;
    case "http.request":
      return `${base} · ${event.method} ${event.path}${event.purpose ? ` (${event.purpose})` : ""}`;
    case "http.response":
      return `${base} · ${event.status} ${event.path}`;
    case "model.request":
      return `${base} · ${event.provider} ${short((event.body as { model?: string })?.model ?? "")}${(event as { fault?: unknown }).fault ? ` · 故障 ${short((event as { fault?: unknown }).fault)}` : ""}`;
    case "model.response":
      return `${base} · status ${event.status ?? "-"} · usage ${event.usage ? short(event.usage, 120) : "无"}`;
    case "read.query":
      return `${base} · ${(event.tables as string[] | undefined)?.join(",") ?? ""}`;
    case "read.result": {
      const records = (event.records as { collection: string | null; id: string | null }[] | undefined) ?? [];
      return `${base} · ${event.rowCount ?? records.length} 行 · ${short(records.slice(0, 6).map((record) => `${record.collection ?? "?"}:${record.id}`).join(" "), 200)}`;
    }
    case "db.write":
      return `${base} · ${(event.tables as string[] | undefined)?.[0] ?? ""} · ${short(event.records ?? (event.params as unknown[] | undefined)?.slice(0, 3), 160)}`;
    case "card.frozen":
      return `${base} · ${event.cardKind} ${event.cardId}`;
    case "card.decision":
      return `${base} · ${event.cardId} ${event.decision}${event.accepted === false ? ` 被拒 ${event.reason}` : ""}${event.replayed === true ? " 重复提交，服务端返回第一次的结果" : ""}${event.via ? ` (${event.via})` : ""}`;
    case "exec.call":
    case "exec.receipt":
      return `${base} · ${event.executorKey ?? ""} ${event.status ?? ""}`;
    // AG01: the real-time channel (who resumed from which seq, what the server pushed).
    case "turn.disconnect":
      return `${base} · ${event.client} · 最后收到 #${event.lastSeq}`;
    case "turn.disconnect_late":
      return `${base} · ${event.client} · ${short(event.reason)}`;
    case "turn.reconnect":
      return `${base} · ${event.client} · Last-Event-ID ${event.after}`;
    case "entry.channel.open":
      return `${base} · after ${event.after}${event.stream === false ? " (JSON)" : ""}`;
    case "entry.channel.push":
      return `${base} · after ${event.after} → ${(event.seqs as number[] | undefined)?.join(",") ?? ""}`;
    case "client.channel_event":
      return `${base} · ${event.client} 收到 #${event.channelSeq} ${event.kind} ${event.status}${event.duplicate ? " (重复)" : ""}`;
    case "egress.blocked":
    case "egress.connected":
      return `${base} · ${event.host}:${event.port ?? ""} · ${event.at}`;
    // AG14: which saved entries a turn used (ids and revisions; never their words), and the user's own setting changes.
    case "memory.recall":
      return `${base} · ${event.scope ?? ""} · 用到的记忆条目 ${((event.memories as string[] | undefined) ?? []).join(",") || "无"}${Array.isArray(event.overruled) && event.overruled.length ? ` · 本轮原话优先、没用的 ${(event.overruled as string[]).join(",")}` : ""}${event.enabled === false ? " · 「回答时参考这些」关着" : ""}`;
    case "turn.setting":
      return `${base} · ${short(event.setting)}`;
    case "turn.resume_conversation":
      return `${base} · 回到第 ${event.index} 个对话`;
    default:
      return `${base}${event.text ? ` · ${short(event.text)}` : ""}`;
  }
}

export interface RubricItem {
  id: string;
  text: string;
  gate?: string;
}

function rubricOf(caseYaml: string): RubricItem[] {
  try {
    const parsed = yaml.load(caseYaml) as { rubric?: RubricItem[] } | null;
    return Array.isArray(parsed?.rubric) ? parsed.rubric.filter((item) => item && typeof item.id === "string") : [];
  } catch {
    return [];
  }
}

/**
 * README §3.3/§6: in a gate run for AGx, an item gated later than AGx is judged but does not count
 * towards the case result (listed as deferred). Outside gate runs (runGate null) every item counts.
 */
export function countedRubric(rubric: readonly RubricItem[], runGate: string | null): { counted: string[]; deferred: { id: string; gate: string }[] } {
  const counted: string[] = [];
  const deferred: { id: string; gate: string }[] = [];
  for (const item of rubric) {
    if (runGate && item.gate && item.gate > runGate) deferred.push({ gate: item.gate, id: item.id });
    else counted.push(item.id);
  }
  return { counted, deferred };
}

export function renderJudgePacket(input: {
  caseDir: string;
  caseYaml: string;
  transcript: string;
  checks: CheckResult[];
  hardPass: boolean;
  events: TraceEvent[];
  judgePrompt: string;
  judgeCount: number;
}): string {
  const lines: string[] = [];
  lines.push("# 评审材料", "");
  lines.push(`你是新开的评审会话。按下面「评审者的指示」评这一例，把结果写成 \`${path.join(input.caseDir, "judge-<N>.json")}\`（第几位评审就写第几号，本例需要 ${input.judgeCount} 份，互不相见）。只读本材料，需要核对时打开 \`${path.join(input.caseDir, "trace.jsonl")}\`。不要打开代码仓库、REPORT 或别的评审结果。`, "");
  lines.push("## 评审者的指示", "", input.judgePrompt.trim(), "");
  lines.push("## 用例原文", "", "```yaml", input.caseYaml.trim(), "```", "");
  const rubric = rubricOf(input.caseYaml);
  if (rubric.length) {
    lines.push("## 评审项", "", "每一条都照常评（通过、不通过、看不出，各引日志序号）。标了起始 sprint 的条目，只影响报告怎么计入本例结论，不影响你怎么评。", "");
    for (const item of rubric) lines.push(`- ${item.id}：${item.text}${item.gate ? `（从 ${item.gate} 起计入本例结论）` : ""}`);
    lines.push("");
  }
  lines.push("## transcript.md（用户看到的内容）", "", input.transcript.trim(), "");
  lines.push(`## 代码判定（hard-checks.json）：${input.hardPass ? "全部通过" : "有不通过"}`, "", "| 判定 | 结果 | 说明 | 事件序号 |", "|---|---|---|---|");
  for (const check of input.checks) {
    lines.push(`| ${check.check}${check.expectedToFail ? "（本例要求它不通过）" : ""} | ${check.status} | ${String(check.detail).replace(/\|/gu, "\\|").slice(0, 600)} | ${check.evidence.join(", ")} |`);
  }
  lines.push("", `## 事件索引（共 ${input.events.length} 条；完整内容见 trace.jsonl，按 seq 查）`, "", "```");
  for (const event of input.events) lines.push(eventIndexLine(event));
  lines.push("```", "");
  return `${lines.join("\n")}\n`;
}

export interface JudgeValidation {
  file: string;
  judge: JudgeFile | null;
  problems: string[];
}

export function validateJudgeFile(file: string, caseId: string, rubricIds: readonly string[], maxSeq: number): JudgeValidation {
  const problems: string[] = [];
  let judge: JudgeFile | null = null;
  try {
    judge = JSON.parse(fs.readFileSync(file, "utf8")) as JudgeFile;
  } catch (error) {
    return { file, judge: null, problems: [`unreadable: ${error instanceof Error ? error.message : error}`] };
  }
  if (judge.caseId !== caseId) problems.push(`caseId ${judge.caseId} ≠ ${caseId}`);
  const items = Array.isArray(judge.items) ? judge.items : [];
  for (const id of rubricIds) if (!items.some((item) => item.id === id)) problems.push(`no verdict for ${id}`);
  for (const item of items) {
    if (!["pass", "fail", "unclear"].includes(item.verdict)) problems.push(`${item.id}: verdict ${item.verdict}`);
    if (!Array.isArray(item.evidence) || item.evidence.length === 0) problems.push(`${item.id}: no evidence seq`);
    else if (item.evidence.some((seq) => !Number.isInteger(seq) || seq < 1 || seq > maxSeq)) problems.push(`${item.id}: evidence ${JSON.stringify(item.evidence)} not in the trace (1–${maxSeq})`);
    if (!item.reason || !String(item.reason).trim()) problems.push(`${item.id}: no reason`);
  }
  if (!judge.judge?.model || !judge.judge?.session || !judge.judge?.at) problems.push("judge model / session / time missing");
  return { file, judge, problems };
}

export interface CaseVerdict {
  caseId: string;
  hardPass: boolean;
  verdict: "pass" | "fail" | "needs_review" | "unjudged";
  judges: { file: string; overall: string | null; problems: string[] }[];
  disagreements: string[];
  reasons: string[];
  expectJudgeVerdicts?: { item: string; verdict: string }[];
  /** Judged items left out of this gate run's result (README §3.3). */
  deferred?: { id: string; gate: string }[];
  /** AG04: the same items with each valid judgment's verdict, for report.md ("已评、从 AGnn 起计入"). */
  deferredVerdicts?: { id: string; gate: string; verdicts: string[] }[];
}

/**
 * README §6: pass needs every hard check and every rubric item of every judgment to pass.
 * expect_judge_verdicts (H.yaml): the listed items must have exactly that verdict, the rest pass.
 * Disagreeing judges → the item is listed for manual review (a third judge settles the verdict).
 * The result is computed from the per-item verdicts of `rubricIds` (the counted items), never from a
 * judge's own `overall`. `deferred` items (gated later than this gate run) are listed, not counted.
 */
export function decideCase(input: { caseId: string; hardPass: boolean; rubricIds: string[]; required: number; validations: JudgeValidation[]; expectJudgeVerdicts?: { item: string; verdict: string }[]; deferred?: { id: string; gate: string }[] }): CaseVerdict {
  const valid = input.validations.filter((validation) => validation.judge && validation.problems.length === 0);
  const reasons: string[] = [];
  for (const validation of input.validations.filter((item) => item.problems.length)) reasons.push(`rejected ${path.basename(validation.file)}: ${validation.problems.join("; ")}`);
  const deferredVerdicts: { id: string; gate: string; verdicts: string[] }[] = [];
  for (const item of input.deferred ?? []) {
    const verdicts = valid.map((validation) => validation.judge!.items.find((entry) => entry.id === item.id)?.verdict ?? "missing");
    reasons.push(`${item.id} 已评（${verdicts.join(", ") || "无"}），从 ${item.gate} 起计入`);
    deferredVerdicts.push({ gate: item.gate, id: item.id, verdicts });
  }
  const disagreements: string[] = [];
  const expected = new Map((input.expectJudgeVerdicts ?? []).map((item) => [item.item, item.verdict]));
  for (const id of input.rubricIds) {
    const verdicts = valid.map((validation) => validation.judge!.items.find((item) => item.id === id)?.verdict);
    if (new Set(verdicts).size > 1) disagreements.push(`${id}: ${verdicts.join(" vs ")}`);
    if (verdicts.includes("unclear")) reasons.push(`${id} unclear in a judgment (counts as fail, listed for review)`);
  }
  const judges = input.validations.map((validation) => ({ file: path.basename(validation.file), overall: validation.judge?.overall ?? null, problems: validation.problems }));
  const base = { caseId: input.caseId, disagreements, hardPass: input.hardPass, judges, ...(input.expectJudgeVerdicts ? { expectJudgeVerdicts: input.expectJudgeVerdicts } : {}), ...(input.deferred?.length ? { deferred: input.deferred, deferredVerdicts } : {}) };
  if (valid.length < input.required) {
    return { ...base, reasons: [...reasons, `${valid.length} valid judgment(s), ${input.required} required`], verdict: input.hardPass ? "unjudged" : "fail" };
  }
  const itemOk = (id: string, verdict: string | undefined) => (expected.has(id) ? verdict === expected.get(id) : verdict === "pass");
  const judgedOk = (validation: JudgeValidation) => input.rubricIds.every((id) => itemOk(id, validation.judge!.items.find((item) => item.id === id)?.verdict));
  let judgesPass: boolean;
  if (disagreements.length && valid.length >= 3) {
    const votes = valid.map(judgedOk);
    judgesPass = votes.filter(Boolean).length > votes.length / 2;
  } else judgesPass = valid.every(judgedOk);
  if (!input.hardPass) return { ...base, reasons: [...reasons, "a hard check failed; judgments cannot overturn it"], verdict: disagreements.length ? "needs_review" : "fail" };
  if (disagreements.length) return { ...base, reasons: [...reasons, `judges disagree: ${disagreements.join("; ")}${valid.length >= 3 ? `; majority says ${judgesPass ? "pass" : "fail"}` : "; a third judgment is needed"}`], verdict: "needs_review" };
  if (reasons.some((reason) => reason.includes("unclear"))) return { ...base, reasons, verdict: "needs_review" };
  return { ...base, reasons: judgesPass ? reasons : [...reasons, "a rubric item did not get the required verdict"], verdict: judgesPass ? "pass" : "fail" };
}

export function readCaseYaml(caseDir: string): Record<string, any> {
  return yaml.load(fs.readFileSync(path.join(caseDir, "case.yaml"), "utf8")) as Record<string, any>;
}
