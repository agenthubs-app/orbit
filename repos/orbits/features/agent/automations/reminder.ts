/**
 * A task's own reminder switch (agent-design AG16; 设计稿 §5.3; PLANNER 易错边界 1). Results always go to the in-app
 * inbox; this switch adds one reminder per period with a result, on the owner's phone and browser. It is one switch
 * per task: turning it on for one task changes nothing for any other.
 *
 * Two ways lead here and both write the same thing: the owner's own switch on the task's page (takes effect at once),
 * and a sentence in the conversation (a confirmation card first; this runs only after the click — domains/rule/apply.ts).
 */
import type { AgentAutomation, AgentAutomationService, AgentRuleSpec } from "./contract";

/**
 * The rule with its reminder switched — the switch and nothing else (no language: the reminder's sentence follows the
 * language of the task's results when it is sent; a language stored by older versions is dropped here). A change of the
 * switch alone makes a new version of the task but not a new task: what earlier versions already told the owner still
 * counts as told (`toldFromVersion`).
 */
export function ruleWithReminder(automation: Pick<AgentAutomation, "version"> & { rule: AgentRuleSpec }, input: { push: boolean }): AgentRuleSpec {
  const { rule } = automation;
  return {
    ...rule,
    notify: { inApp: true, push: input.push },
    toldFromVersion: rule.toldFromVersion ?? automation.version,
  };
}

/**
 * The switch on the task's page. Null: not this owner's task, or not a scheduled task with parameters. Switching to the
 * state it is already in changes nothing (no new version).
 */
export async function setTaskReminder(service: Pick<AgentAutomationService, "get" | "update">, automationId: string, input: { push: boolean }): Promise<AgentAutomation | null> {
  const automation = await service.get(automationId);
  if (!automation?.rule || automation.trigger.kind !== "schedule") return null;
  if (automation.rule.notify.push === input.push) return automation;
  const rule = ruleWithReminder({ rule: automation.rule, version: automation.version }, input);
  return service.update(automationId, {
    changeNote: input.push ? "Reminder turned on." : "Reminder turned off.",
    delivery: input.push ? "push" : "in_app",
    rule,
    source: "manual",
  });
}
