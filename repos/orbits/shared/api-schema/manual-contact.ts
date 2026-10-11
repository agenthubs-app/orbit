import { z } from "zod";

import { ingestContactCandidateObject } from "./business-card-batch";
import { readableItems, tolerantEnum } from "./tolerant";
import type {
  ManualContactCreateInput,
  ManualContactCreateResult,
  ManualContactDuplicateCheckInput,
  ManualContactDuplicateCheckResult,
  ManualContactOrganizationSuggestion,
  ManualContactOrganizationSuggestionsResult,
  ManualContactUndoResult,
} from "../contract/manual-contact";

// R12 契约（DESIGN §4.1）。Owner: 甲 (R12). Used by: 人脈を追加 · 手入力（两端）。
// 响应宽进（不 strict、枚举 tolerantEnum、列表 readableItems），请求体严格。
const name = z.string().max(120).refine((value) => value.trim().length > 0, { message: "displayName is required" });
const optionalText = (max: number) => z.string().max(max).optional();
const nonEmpty = z.string().refine((value) => value.trim().length > 0);
/** 请求里的 id（活动 / 统合目标）：与 idempotencyKey 同一上限（复核 M3：没有上限的字符串会进联系人记录）。 */
const requestId = z.string().max(200).refine((value) => value.trim().length > 0);

const MERGE_FIELDS = ["displayName", "organization", "role", "email", "phone"] as const;
const fieldChoice = z.enum(["existing", "incoming"]);

export const manualContactMetContextObject = z.object({
  kind: z.enum(["event", "intro", "other"]),
  eventId: requestId.optional(),
  label: optionalText(120),
}).strict();

export const manualContactCreateInputObject = z.object({
  displayName: name,
  organization: optionalText(200),
  role: optionalText(120),
  email: optionalText(254),
  phone: optionalText(40),
  metContext: manualContactMetContextObject.optional(),
  note: optionalText(2000),
  mergeIntoContactId: requestId.optional(),
  fieldChoices: z.object({
    displayName: fieldChoice.optional(),
    organization: fieldChoice.optional(),
    role: fieldChoice.optional(),
    email: fieldChoice.optional(),
    phone: fieldChoice.optional(),
  }).strict().optional(),
  allowDuplicate: z.boolean().optional(),
  idempotencyKey: z.string().min(1).max(200),
}).strict();
export const manualContactCreateInputSchema = manualContactCreateInputObject.superRefine((value, context) => {
  if (value.fieldChoices && !value.mergeIntoContactId) context.addIssue({ code: "custom", path: ["fieldChoices"], message: "fieldChoices needs mergeIntoContactId" });
  if (value.mergeIntoContactId && value.allowDuplicate) context.addIssue({ code: "custom", path: ["allowDuplicate"], message: "merge and allowDuplicate are exclusive" });
  if (value.metContext?.kind === "event" && !value.metContext.eventId) context.addIssue({ code: "custom", path: ["metContext", "eventId"], message: "an event context needs eventId" });
}) as z.ZodType<ManualContactCreateInput>;

// 不认识的 outcome 读成 duplicate_review：界面再问一次，而不是当成功（复核 m10）。
export const manualContactCreateResultObject = z.object({
  outcome: tolerantEnum(["created", "merged", "duplicate_review"], "duplicate_review"),
  contactId: nonEmpty.optional(),
  candidates: readableItems(ingestContactCandidateObject).optional(),
  undoUntil: z.string().datetime({ offset: true }).optional(),
});
export const manualContactCreateResultSchema = manualContactCreateResultObject as z.ZodType<ManualContactCreateResult>;

export const manualContactDuplicateCheckInputObject = z.object({
  displayName: name,
  organization: optionalText(200),
  email: optionalText(254),
  phone: optionalText(40),
}).strict();
export const manualContactDuplicateCheckInputSchema = manualContactDuplicateCheckInputObject as z.ZodType<ManualContactDuplicateCheckInput>;

export const manualContactDuplicateCheckResultObject = z.object({ candidates: readableItems(ingestContactCandidateObject) });
export const manualContactDuplicateCheckResultSchema = manualContactDuplicateCheckResultObject as z.ZodType<ManualContactDuplicateCheckResult>;

export const manualContactOrganizationSuggestionObject = z.object({ name: nonEmpty, contactCount: z.number().int().nonnegative() });
export const manualContactOrganizationSuggestionSchema = manualContactOrganizationSuggestionObject as z.ZodType<ManualContactOrganizationSuggestion>;
export const manualContactOrganizationSuggestionsResultObject = z.object({ organizations: readableItems(manualContactOrganizationSuggestionObject) });
export const manualContactOrganizationSuggestionsResultSchema = manualContactOrganizationSuggestionsResultObject as z.ZodType<ManualContactOrganizationSuggestionsResult>;

export const manualContactUndoResultObject = z.object({ outcome: tolerantEnum(["undone"], "undone") });
export const manualContactUndoResultSchema = manualContactUndoResultObject as z.ZodType<ManualContactUndoResult>;

/** 统合时可逐个选择的字段（与 ManualContactMergeField 同一组）。 */
export const MANUAL_CONTACT_MERGE_FIELDS = MERGE_FIELDS;
