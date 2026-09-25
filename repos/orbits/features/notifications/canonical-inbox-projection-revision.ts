import {createHash} from 'node:crypto';
import type {ReminderPlanDTO} from './reminder-plan-contract';

/** Equality token for the latest-state work item, not an ordering cursor.
 * updatedAt alone can collide when a plan is rescheduled in the same tick.
 * Keep an explicit field list so ignored payload extensions and JSON key order
 * cannot change the token between the producer DTO and the validated reader. */
export function canonicalInboxProjectionRevision(plan:ReminderPlanDTO):string {
  return createHash('sha256').update(JSON.stringify([
    1,plan.id,plan.accountId,plan.ownerUserId,plan.targetType,plan.targetId,
    plan.fireAt,plan.timeZone,plan.status,plan.title,plan.body,plan.deepLink,
    plan.createdBy,plan.createdAt,plan.updatedAt,plan.channels,
    plan.deliveredAt??null,plan.cancelledAt??null,plan.failureCode??null,
  ])).digest('hex');
}
