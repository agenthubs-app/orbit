import { ORBIT_API_ENDPOINTS } from "../api/endpoints";
import type {
  ContactPipelinePageContract,
  ContactPipelineStageCode,
} from "../api/contract/contact-pipeline-page";

export const CONTACT_PIPELINE_PAGE_LIMIT = 20;
export type ContactPipelineStageId = ContactPipelineStageCode;

const stageDefinitions: readonly { id: ContactPipelineStageCode; label: string; detail: string }[] = [
  { id: "to_contact", label: "待联系", detail: "需要先发起或重新确认下一步。" },
  { id: "in_progress", label: "推进中", detail: "已经有明确交流或合作线索。" },
  { id: "nurture", label: "长期维护", detail: "适合低频维护，先保留关系温度。" },
  { id: "archived", label: "已归档", detail: "当前不用继续推进，可后续恢复。" },
];

export interface ContactPipelineStageView {
  id: ContactPipelineStageCode;
  label: string;
  detail: string;
  count: number;
}

export interface ContactPipelineContactView {
  id: string;
  name: string;
  detail: string;
}

export type ContactPipelineActionDueTone = "overdue" | "today" | "upcoming";

export interface ContactPipelineActionView {
  taskId: string;
  contactId: string;
  contactName: string;
  detail: string;
  title: string;
  dueLabel: string;
  dueTone: ContactPipelineActionDueTone;
}

export interface ContactPipelinePageView {
  stages: ContactPipelineStageView[];
  contacts: ContactPipelineContactView[];
  actions: ContactPipelineActionView[];
}

export function contactPipelinePagePath(stage: ContactPipelineStageCode, cursor?: string | null): string {
  const query = new URLSearchParams({ stage, limit: String(CONTACT_PIPELINE_PAGE_LIMIT) });
  if (cursor) query.set("cursor", cursor);
  return `${ORBIT_API_ENDPOINTS.contactPipeline}?${query.toString()}`;
}

function contactDetail(organization: string, role: string): string {
  return [organization === "Independent" ? "" : organization, role].filter(Boolean).join(" · ") || "关系信息待补充";
}

function dueView(dueAt: string, now: Date): Pick<ContactPipelineActionView, "dueLabel" | "dueTone"> {
  const dueDate = new Date(dueAt);
  const dueDay = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate()).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const difference = Math.round((dueDay - today) / 86_400_000);
  if (difference < 0) return { dueLabel: "逾期", dueTone: "overdue" };
  if (difference === 0) return { dueLabel: "今天", dueTone: "today" };
  if (difference === 1) return { dueLabel: "明天", dueTone: "upcoming" };
  return { dueLabel: `${dueDate.getMonth() + 1}月${dueDate.getDate()}日`, dueTone: "upcoming" };
}

export function contactPipelinePageToView(page: ContactPipelinePageContract, now = new Date()): ContactPipelinePageView {
  return {
    stages: stageDefinitions.map(stage => ({ ...stage, count: page.stageCounts[stage.id] })),
    contacts: page.items.map(contact => ({
      id: contact.id,
      name: contact.displayName,
      detail: contactDetail(contact.organization, contact.role),
    })),
    actions: page.actions.map(action => ({
      taskId: action.taskId,
      contactId: action.contactId,
      contactName: action.contactName,
      detail: contactDetail(action.organization, action.role),
      title: action.title.replace(/复核/gu, "确认"),
      ...dueView(action.dueAt, now),
    })),
  };
}
