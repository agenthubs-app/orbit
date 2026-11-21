/**
 * agent-design AG15 interface (approved visual draft 15-4 「点「改」之后」, 15-3 「用表单新建」): a scheduled task made or
 * changed with the form. The user does it by hand, so there is no card (the draft: "在这里是你自己动手改，点「保存」就
 * 生效"); the form's choices are turned into the same rule fields the conversation's card writes, with the same words
 * (scope, basis, title) written by code. A note is taken by id only and must be one the owner can read now.
 */
import type { AgentScheduledTaskFormContract } from "../../../shared/contract/agent-v1";
import { RULE_CAPABILITY_OF } from "../../agent-v1/domains/rule/apply";
import type { RuleSchedule } from "../../agent-v1/domains/rule/ops";
import { fieldBasis, noteBasis, scopeWordsOf, titleOf, topicBasis } from "../../agent-v1/graph/nodes/rule";
import type { AgentAutomation, AgentRuleScope, AgentRuleSpec, CreateAgentAutomationInput, UpdateAgentAutomationInput } from "./contract";

type Locale = "zh" | "en" | "ja";

const capital = (text: string) => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
const sameScope = (left: AgentRuleScope, right: AgentRuleScope) => JSON.stringify(left) === JSON.stringify(right);

function scopeOf(form: AgentScheduledTaskFormContract, before: AgentRuleSpec | undefined): AgentRuleScope {
  if (form.domain === "todo") return { domain: "todo", filter: "past_planned" };
  if (form.domain === "contact") return before?.scope.domain === "contact" ? before.scope : { domain: "contact", quietDays: 30 };
  const window = form.window ?? (before?.scope.domain === "event" ? before.scope.window : "weekend");
  return before?.scope.domain === "event" ? { ...before.scope, window } : { domain: "event", window };
}

/** The rule a form describes; `before` is the task being changed (its scope words stay when its scope does). */
export function ruleFromForm(form: AgentScheduledTaskFormContract, locale: Locale, before?: AgentAutomation | null): { title: string; schedule: RuleSchedule; rule: AgentRuleSpec } {
  const schedule: RuleSchedule = form.schedule.kind === "daily"
    ? { kind: "daily", time: form.schedule.time, timeZone: form.schedule.timeZone }
    : { daysOfWeek: [...new Set(form.schedule.daysOfWeek)].sort(), kind: "weekly", time: form.schedule.time, timeZone: form.schedule.timeZone };
  const previous = before?.rule;
  const scope = scopeOf(form, previous);
  const scopeText = previous && sameScope(previous.scope, scope) ? previous.scopeText : (locale === "en" ? capital(scopeWordsOf(scope, locale)) : scopeWordsOf(scope, locale));
  const basis = form.domain === "todo" ? { field: "plannedDate" as const, kind: "field" as const } : form.basis;
  const ranking: AgentRuleSpec["ranking"] = basis.kind === "field" ? { field: { direction: "asc", name: basis.field } } : basis.kind === "topic" ? { topic: basis.words.trim() } : {};
  const rankingBasis = basis.kind === "note" ? noteBasis(locale, basis.title) : basis.kind === "field" ? fieldBasis(basis.field, "asc", locale) : topicBasis(locale, basis.words.trim());
  const rule: AgentRuleSpec = {
    action: form.domain === "todo" ? "replan" : "pick",
    locale,
    maxItems: form.maxItems,
    notify: { inApp: true, push: form.push },
    onEmpty: "silent",
    ranking,
    rankingBasis,
    references: basis.kind === "note" ? [{ id: basis.noteId, title: basis.title, type: "memo" }] : [],
    scope,
    scopeText,
    validUntil: form.validUntil,
  };
  const title = form.title.trim() || titleOf(schedule, rule, locale);
  return { rule, schedule, title: title.slice(0, 120) };
}

export function createInputFromForm(form: AgentScheduledTaskFormContract, locale: Locale): CreateAgentAutomationInput {
  const { rule, schedule, title } = ruleFromForm(form, locale);
  return { capabilityId: RULE_CAPABILITY_OF[rule.scope.domain], delivery: rule.notify.push ? "push" : "in_app", instruction: `${rule.scopeText} — ${rule.rankingBasis}`.slice(0, 4_000), rule, source: "manual", title, trigger: { kind: "schedule", schedule } };
}

export function updateInputFromForm(form: AgentScheduledTaskFormContract, locale: Locale, before: AgentAutomation): UpdateAgentAutomationInput {
  const { rule, schedule, title } = ruleFromForm(form, locale, before);
  return { capabilityId: RULE_CAPABILITY_OF[rule.scope.domain], changeNote: "Changed with the form.", delivery: rule.notify.push ? "push" : "in_app", instruction: `${rule.scopeText} — ${rule.rankingBasis}`.slice(0, 4_000), rule, source: "manual", title, trigger: { kind: "schedule", schedule } };
}
