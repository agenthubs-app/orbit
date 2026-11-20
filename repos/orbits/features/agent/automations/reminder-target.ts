/**
 * Where a scheduled task's reminder leads (agent-design AG16; 视觉稿 16-5「点开去哪」). The reminder carries one opaque id
 * and nothing else. Here that id is resolved for the signed-in account only: it names a run in that account's own
 * history, and the answer is the address of that period's inbox entry. The entry's content is read by the inbox page
 * under the same sign-in; nothing of it is returned here.
 */
import { resolveModuleMode } from "../../../shared/services/module-mode";
import type { AutomationStorage } from "./due-index";
import { RULE_PUSH_BODY, RULE_PUSH_TITLE } from "./push";
import { createAutomationRunStore, runIdOfPushDelivery } from "./runs";
import { configuredAutomationStorage } from "./service-factory";

export interface RuleReminderTarget {
  title: string;
  body: string;
  /** The reminder's own state on the run (delivered, pending, failed, skipped). */
  status: string;
  /** The inbox entry's address in the App and the path the web inbox selects by; null when the entry is not there. */
  href: string | null;
  inboxId: string | null;
}

/** Null: the id is not a scheduled-task reminder, or not one of this account's (indistinguishable to the caller). */
export async function resolveRuleReminderTarget(actorId: string, deliveryId: string, storage: AutomationStorage | null = configuredAutomationStorage(resolveModuleMode())): Promise<RuleReminderTarget | null> {
  const runId = runIdOfPushDelivery(deliveryId);
  if (!runId || !storage || !actorId.trim()) return null;
  const run = await createAutomationRunStore(storage.direct.store, storage.workspaceId).get(actorId, runId);
  if (!run || run.ownerId !== actorId || run.delivery.push.state === "not_requested") return null;
  const inboxId = run.delivery.inbox.state === "delivered" ? run.delivery.inbox.inboxId ?? null : null;
  return {
    body: RULE_PUSH_BODY[run.locale] ?? RULE_PUSH_BODY.zh,
    href: inboxId ? `/inbox/notifications/${encodeURIComponent(inboxId)}` : null,
    inboxId,
    status: run.delivery.push.state,
    title: RULE_PUSH_TITLE,
  };
}
