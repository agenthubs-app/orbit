"use client";

import { useState } from "react";

import { aiSessionGroupSchema, aiSessionOrganizationSchema } from "../../../../shared/api-schema/ai-sessions";
import type {
  AiSessionGroupContract,
  AiSessionGroupCreateContract,
  AiSessionGroupDeleteContract,
  AiSessionGroupMutationContract,
  AiSessionOrganizationContract,
  AiSessionOrganizationMutationContract,
} from "../../../../shared/contract/ai-sessions";

const SESSION_PATH = "/api/ai/conversations/sessions";
const GROUP_PATH = "/api/ai/conversations/groups";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function json(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function parseAgentChatGroups(value: unknown): AiSessionGroupContract[] {
  const data = isRecord(value) && value.success === true && isRecord(value.data) ? value.data : value;
  if (!isRecord(data) || !Array.isArray(data.groups)) return [];
  return data.groups.flatMap((group) => {
    const parsed = aiSessionGroupSchema.safeParse(group);
    return parsed.success ? [parsed.data] : [];
  });
}

export async function loadAgentChatGroups(): Promise<AiSessionGroupContract[]> {
  try {
    const response = await fetch(GROUP_PATH, { headers: { accept: "application/json" } });
    return response.ok ? parseAgentChatGroups(await json(response)) : [];
  } catch {
    return [];
  }
}

export async function patchAgentChatSessionOrganization(
  sessionId: string,
  input: AiSessionOrganizationMutationContract,
): Promise<AiSessionOrganizationContract | null> {
  try {
    const response = await fetch(`${SESSION_PATH}/${encodeURIComponent(sessionId)}`, {
      body: JSON.stringify(input),
      headers: { "content-type": "application/json" },
      method: "PATCH",
    });
    const payload = await json(response);
    const data = isRecord(payload) && payload.success === true && isRecord(payload.data) ? payload.data : null;
    const session = data && isRecord(data.session) ? data.session : null;
    const parsed = aiSessionOrganizationSchema.safeParse(session?.organization);
    return response.ok && parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

async function groupMutation(
  path: string,
  method: "PATCH" | "POST",
  body: AiSessionGroupCreateContract | AiSessionGroupMutationContract,
): Promise<AiSessionGroupContract | null> {
  try {
    const response = await fetch(path, {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
      method,
    });
    const payload = await json(response);
    const data = isRecord(payload) && payload.success === true && isRecord(payload.data) ? payload.data : null;
    const parsed = aiSessionGroupSchema.safeParse(data?.group);
    return response.ok && parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export const createAgentChatGroup = (input: AiSessionGroupCreateContract) =>
  groupMutation(GROUP_PATH, "POST", input);

export const renameAgentChatGroup = (groupId: string, input: AiSessionGroupMutationContract) =>
  groupMutation(`${GROUP_PATH}/${encodeURIComponent(groupId)}`, "PATCH", input);

export async function deleteAgentChatGroup(
  groupId: string,
  input: AiSessionGroupDeleteContract,
): Promise<boolean> {
  try {
    const response = await fetch(`${GROUP_PATH}/${encodeURIComponent(groupId)}`, {
      body: JSON.stringify(input),
      headers: { "content-type": "application/json" },
      method: "DELETE",
    });
    const payload = await json(response);
    return response.ok && isRecord(payload) && payload.success === true && isRecord(payload.data) && payload.data.deleted === true;
  } catch {
    return false;
  }
}

export function AgentChatHistoryOrganization({
  busy,
  currentGroupId,
  groups,
  language,
  onCreate,
  onDelete,
  onFilter,
  onNew,
  onRename,
}: {
  busy: boolean;
  currentGroupId: string | null;
  groups: readonly AiSessionGroupContract[];
  language: "en" | "ja" | "zh";
  onCreate: (name: string) => void;
  onDelete: (group: AiSessionGroupContract) => void;
  onFilter: (groupId: string | null) => void;
  onNew: (groupId: string) => void;
  onRename: (group: AiSessionGroupContract, name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [names, setNames] = useState<Record<string, string>>({});
  const [pendingDeleteGroupId, setPendingDeleteGroupId] = useState<string | null>(null);
  const tr = (en: string, zh: string) => language === "zh" ? zh : en;
  return (
    <div data-orbit-agent-groups style={{ display: "grid", gap: 6, padding: "0 8px 8px" }}>
      <button aria-expanded={open} aria-label={tr("Groups", "分组")} className="btn btn-sm btn-quiet" onClick={() => setOpen((value) => !value)} type="button">
        {tr("Groups", "分组")}
      </button>
      {open ? <div style={{ border: "1px solid var(--border)", borderRadius: "var(--r-sm)", display: "grid", gap: 8, padding: 8 }}>
        <button aria-label={tr("Show all conversations", "显示全部会话")} className="btn btn-sm btn-quiet" onClick={() => onFilter(null)} type="button">{tr("All conversations", "全部会话")}</button>
        {groups.map((group) => <div key={group.id} style={{ display: "grid", gap: 4 }}>
          <input aria-label={tr(`Group name: ${group.name}`, `分组名称：${group.name}`)} disabled={busy} onChange={(event) => setNames((current) => ({ ...current, [group.id]: event.target.value }))} value={names[group.id] ?? group.name} />
          <div style={{ display: "flex", gap: 4 }}>
            <button aria-label={tr(`Open group ${group.name}`, `打开分组：${group.name}`)} aria-pressed={currentGroupId === group.id} className="btn btn-sm btn-quiet" onClick={() => onFilter(group.id)} type="button">{tr("Open", "打开")}</button>
            <button aria-label={tr(`New conversation in ${group.name}`, `在分组「${group.name}」中新建对话`)} className="btn btn-sm btn-quiet" onClick={() => onNew(group.id)} type="button">{tr("New", "新建")}</button>
            <button aria-label={tr(`Rename group ${group.name}`, `重命名分组：${group.name}`)} className="btn btn-sm btn-quiet" disabled={busy || !(names[group.id] ?? group.name).trim()} onClick={() => onRename(group, names[group.id] ?? group.name)} type="button">{tr("Rename", "改名")}</button>
            {pendingDeleteGroupId === group.id ? <>
              <button aria-label={tr(`Keep group ${group.name}`, `保留分组：${group.name}`)} className="btn btn-sm btn-quiet" disabled={busy} onClick={() => setPendingDeleteGroupId(null)} type="button">{tr("Cancel", "取消")}</button>
              <button aria-label={tr(`Confirm deleting group ${group.name}`, `确认删除分组：${group.name}`)} className="btn btn-sm btn-quiet" disabled={busy} onClick={() => { setPendingDeleteGroupId(null); onDelete(group); }} type="button">{tr("Confirm delete", "确认删组")}</button>
            </> : <button aria-label={tr(`Delete group ${group.name}`, `删除分组：${group.name}`)} className="btn btn-sm btn-quiet" disabled={busy} onClick={() => setPendingDeleteGroupId(group.id)} type="button">{tr("Delete", "删组")}</button>}
          </div>
        </div>)}
        <div style={{ display: "flex", gap: 4 }}>
          <input aria-label={tr("New group name", "新分组名称")} disabled={busy} onChange={(event) => setNewName(event.target.value)} placeholder={tr("New group", "新分组")} value={newName} />
          <button aria-label={tr("Create group", "创建分组")} className="btn btn-sm btn-primary" disabled={busy || !newName.trim()} onClick={() => { onCreate(newName); setNewName(""); }} type="button">{tr("Create", "创建")}</button>
        </div>
      </div> : null}
    </div>
  );
}
