import { z } from "zod";
import type { ContactStatusFilterCode } from "../api/contract/contacts";
import type { IndustryIdCode } from "../api/contract/industries";
import { isIndustryIdCode } from "../api/domain/industries";

// App-side validation of fields consumed from the existing detail HTTP response.
// The detail DTO has not entered the sanctioned shared-contract copy channel.
export const contactDetailReadSchema = z.object({
  state: z.literal("success"),
  contact: z.object({
    id: z.string().trim().min(1),
    displayName: z.string().trim().min(1),
    role: z.string(), organization: z.string(), location: z.string(),
    primaryEmail: z.string().optional(),
    primaryIndustryId: z.string().nullable().optional(), primaryIndustryLabel: z.string().optional(),
    relationshipContext: z.string(), nextAction: z.string(),
    source: z.object({ type: z.string(), label: z.string() }).passthrough(),
    status: z.enum(["active", "needs_follow_up", "nurture", "archived"]),
    tags: z.array(z.string()),
    publicProfile: z.object({ bio: z.string(), offering: z.array(z.string()), seeking: z.array(z.string()), topics: z.array(z.string()), conversationPrompts: z.array(z.string()) }).passthrough(),
    evidence: z.array(z.object({ excerpt: z.string() }).passthrough()),
    notes: z.array(z.object({ noteId: z.string(), body: z.string(), createdAt: z.string(), authorLabel: z.string(), privacy: z.enum(["private", "relationship_shared"]).optional() }).passthrough()),
    lastInteraction: z.object({ channel: z.string(), occurredAt: z.string(), summary: z.string() }).passthrough()
  }).passthrough()
}).passthrough();

export interface ContactDetailEditDraft {
  status: ContactStatusFilterCode;
  primaryIndustryId: IndustryIdCode | null;
  tags: string[];
  lastInteraction: { channel: string; occurredAt: string; summary: string };
}
export interface ContactDetailEditor {
  contact: z.infer<typeof contactDetailReadSchema>["contact"];
  draft: ContactDetailEditDraft;
  statusOptions: ContactStatusFilterCode[];
}
export type ContactDetailEditBody = Partial<ContactDetailEditDraft>;

const editorSchema = contactDetailReadSchema.extend({
  editableStatusOptions: z.array(z.enum(["active", "needs_follow_up", "nurture", "archived"])).min(1)
});
const interactionChannels = new Set(["event_note", "manual_note", "email_signal", "calendar_signal", "referral"]);

export function contactDetailEditorFrom(data: unknown, contactId: string): ContactDetailEditor | null {
  const parsed = editorSchema.safeParse(data);
  if (!parsed.success || parsed.data.contact.id !== contactId) return null;
  const { contact, editableStatusOptions } = parsed.data;
  if (contact.primaryIndustryId != null && !isIndustryIdCode(contact.primaryIndustryId)) return null;
  return { contact, statusOptions: [...new Set(editableStatusOptions)], draft: {
    status: contact.status, primaryIndustryId: contact.primaryIndustryId ?? null,
    tags: [...contact.tags], lastInteraction: { channel: contact.lastInteraction.channel, occurredAt: contact.lastInteraction.occurredAt, summary: contact.lastInteraction.summary }
  } };
}

export function buildContactDetailEditRequest(original: ContactDetailEditor, draft: ContactDetailEditDraft): { success: true; body: ContactDetailEditBody } | { success: false; error: string } {
  const body: ContactDetailEditBody = {};
  if (draft.status !== original.draft.status) {
    if (!original.statusOptions.includes(draft.status)) return { success: false, error: "请选择当前可用的跟进状态。" };
    body.status = draft.status;
  }
  if (draft.primaryIndustryId !== original.draft.primaryIndustryId) {
    if (draft.primaryIndustryId !== null && !isIndustryIdCode(draft.primaryIndustryId)) return { success: false, error: "请选择列表中的行业。" };
    body.primaryIndustryId = draft.primaryIndustryId;
  }
  const seenTags = new Set<string>();
  const tags = draft.tags.map(tag => tag.trim()).filter(tag => {
    if (!tag || seenTags.has(tag.toLocaleLowerCase())) return false;
    seenTags.add(tag.toLocaleLowerCase()); return true;
  });
  if (JSON.stringify([...tags].sort()) !== JSON.stringify([...original.draft.tags].sort())) body.tags = tags;
  const interaction = { channel: draft.lastInteraction.channel.trim(), occurredAt: draft.lastInteraction.occurredAt.trim(), summary: draft.lastInteraction.summary.trim() };
  if (interaction.channel !== original.draft.lastInteraction.channel || interaction.occurredAt !== original.draft.lastInteraction.occurredAt || interaction.summary !== original.draft.lastInteraction.summary) {
    if (!interactionChannels.has(interaction.channel)) return { success: false, error: "请选择列表中的互动渠道。" };
    if ((!interaction.occurredAt && original.draft.lastInteraction.occurredAt) || (!interaction.summary && original.draft.lastInteraction.summary)) return { success: false, error: "暂不支持清空已有互动时间或摘要，请保留原值或填写新内容。" };
    body.lastInteraction = interaction;
  }
  return { success: true, body };
}

export function confirmContactDetailEdit(data: unknown, contactId: string, body: ContactDetailEditBody): boolean {
  const parsed = contactDetailReadSchema.safeParse(data);
  if (!parsed.success || parsed.data.contact.id !== contactId) return false;
  const { contact } = parsed.data;
  if (body.status !== undefined && contact.status !== body.status) return false;
  if (body.primaryIndustryId !== undefined && (contact.primaryIndustryId ?? null) !== body.primaryIndustryId) return false;
  if (body.tags && JSON.stringify([...contact.tags].sort()) !== JSON.stringify([...body.tags].sort())) return false;
  if (body.lastInteraction && (contact.lastInteraction.channel !== body.lastInteraction.channel || contact.lastInteraction.occurredAt !== body.lastInteraction.occurredAt || contact.lastInteraction.summary !== body.lastInteraction.summary)) return false;
  return true;
}
