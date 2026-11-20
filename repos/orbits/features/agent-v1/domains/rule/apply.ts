/**
 * agent-design AG15 `applyApproved` for scheduled rules (设计稿 §5.3, 附录 B「定时规则」): runs only in the executor
 * after the owner's click, through the automation service — the rule and its row of the due index are written in one
 * transaction there. Before the click nothing exists, so nothing can run.
 *
 * - create: the rule's id comes from the item's own operation key, so a replay finds the rule and makes no second one.
 * - update / pause / resume / cancel: the version the card was frozen from is checked first; a rule changed since then
 *   is a permanent failure — nothing overwritten, never retried.
 */
import { createHash } from "node:crypto";

import type { AgentAutomationService, AgentRuleSpec } from "../../../agent/automations/contract";
import { ruleWithReminder } from "../../../agent/automations/reminder";
import type { AgentActionExecutor } from "../../../agent/runtime/executor-registry";
import { AgentExecutionPermanentError } from "../../../agent/runtime/service";
import { RULE_CANCEL, RULE_CREATE, RULE_PAUSE, RULE_RESUME, RULE_UPDATE, type RuleSchedule, type RuleSnapshot } from "./ops";

export interface RuleWriteDeps {
  automations: Pick<AgentAutomationService, "get" | "create" | "update" | "remove">;
}

/** The read capability a rule's domain runs under (the automation service only accepts registered read capabilities). */
export const RULE_CAPABILITY_OF: Record<AgentRuleSpec["scope"]["domain"], string> = {
  contact: "contacts.recommend",
  event: "events.recommend",
  todo: "followups.reviewQueue",
};

export function ruleIdOf(idempotencyKey: string): string {
  return `rule:${createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 32)}`;
}

const changed = (what: string) => new AgentExecutionPermanentError(`CARD_CONTENT_CHANGED: ${what}; nothing was written.`);

/** A rule as cards read it; null for older playbooks without the rule fields, or signal-triggered ones. */
export function ruleSnapshotOf(automation: Awaited<ReturnType<AgentAutomationService["get"]>>): RuleSnapshot | null {
  if (!automation?.rule || automation.trigger.kind !== "schedule" || automation.trigger.schedule.kind === "once") return null;
  return { automationId: automation.automationId, rule: automation.rule, schedule: automation.trigger.schedule, status: automation.status, title: automation.title, version: automation.version };
}

async function current(deps: RuleWriteDeps, payload: Readonly<Record<string, unknown>>) {
  const automationId = String(payload.automationId ?? "");
  const automation = automationId ? await deps.automations.get(automationId) : null;
  if (!automation) throw changed("the scheduled task no longer exists");
  if (automation.version !== Number(payload.expectedVersion)) throw changed("the scheduled task was changed after this card was made");
  return automation;
}

export function ruleWriteExecutors(deps: RuleWriteDeps): AgentActionExecutor[] {
  return [
    {
      async execute(payload, context) {
        const rule = payload.rule as AgentRuleSpec | undefined;
        const schedule = payload.schedule as RuleSchedule | undefined;
        const title = typeof payload.title === "string" ? payload.title.trim() : "";
        if (!rule || !schedule || !title) throw new AgentExecutionPermanentError("The rule on the card is incomplete.");
        const automationId = ruleIdOf(context.idempotencyKey);
        const existing = await deps.automations.get(automationId);
        if (existing) return { resultRef: automationId, summary: `Scheduled task "${existing.title}" is on.` };
        const created = await deps.automations.create({
          automationId,
          capabilityId: RULE_CAPABILITY_OF[rule.scope.domain],
          delivery: rule.notify.push ? "push" : "in_app",
          instruction: `${rule.scopeText} — ${rule.rankingBasis}`.slice(0, 4_000),
          rule,
          source: "natural_language",
          title: title.slice(0, 120),
          trigger: { kind: "schedule", schedule },
        });
        return { resultRef: created.automationId, summary: `Scheduled task "${created.title}" is on.` };
      },
      key: RULE_CREATE,
      riskLevel: "write",
    },
    {
      async execute(payload) {
        const automation = await current(deps, payload);
        if (!automation.rule) throw new AgentExecutionPermanentError("This task has no parameters that can be changed here.");
        const set = (payload.set ?? {}) as { schedule?: RuleSchedule; maxItems?: number; validUntil?: string | null; notify?: { inApp: true; push: boolean } };
        // AG16: the reminder switch is written the same way as from the task's own page (the switch only; a change of
        // the switch alone keeps what the task already told). Any other change starts the task's memory anew.
        const reminderOnly = Boolean(set.notify) && set.schedule === undefined && set.maxItems === undefined && set.validUntil === undefined;
        const switched = set.notify ? ruleWithReminder({ rule: automation.rule, version: automation.version }, { push: set.notify.push === true }) : automation.rule;
        const { toldFromVersion: _toldFromVersion, ...fresh } = switched;
        const rule: AgentRuleSpec = { ...(reminderOnly ? switched : fresh), ...(set.maxItems !== undefined ? { maxItems: set.maxItems } : {}), ...(set.validUntil !== undefined ? { validUntil: set.validUntil } : {}) };
        const updated = await deps.automations.update(automation.automationId, { changeNote: "Changed on a confirmation card.", delivery: rule.notify.push ? "push" : "in_app", rule, source: "natural_language", ...(set.schedule ? { trigger: { kind: "schedule", schedule: set.schedule } } : {}) });
        return { resultRef: updated.automationId, summary: `Scheduled task "${updated.title}" was changed.` };
      },
      key: RULE_UPDATE,
      riskLevel: "write",
    },
    {
      async execute(payload) {
        const automation = await current(deps, payload);
        if (automation.status !== "paused") await deps.automations.update(automation.automationId, { status: "paused" });
        return { resultRef: automation.automationId, summary: `Scheduled task "${automation.title}" is paused.` };
      },
      key: RULE_PAUSE,
      riskLevel: "write",
    },
    {
      async execute(payload) {
        const automation = await current(deps, payload);
        if (automation.status === "paused") await deps.automations.update(automation.automationId, { status: "active" });
        return { resultRef: automation.automationId, summary: `Scheduled task "${automation.title}" is on again.` };
      },
      key: RULE_RESUME,
      riskLevel: "write",
    },
    {
      async execute(payload) {
        const automationId = String(payload.automationId ?? "");
        const automation = automationId ? await deps.automations.get(automationId) : null;
        // Removed already (a replay): done.
        if (!automation) return { resultRef: automationId, summary: "The scheduled task is removed." };
        if (automation.version !== Number(payload.expectedVersion)) throw changed("the scheduled task was changed after this card was made");
        await deps.automations.remove(automation.automationId);
        return { resultRef: automationId, summary: `Scheduled task "${automation.title}" is removed.` };
      },
      key: RULE_CANCEL,
      riskLevel: "write",
    },
  ];
}
