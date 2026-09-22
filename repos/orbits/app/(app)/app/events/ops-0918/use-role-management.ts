"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

// 原样抽自 [id]/operations/roles/event-role-management-workspace.tsx（已于任务 6 删除；原 8–116、
// 123–314 行）：角色类型/选项/文案、RequestError + requestJson、参与者候选池
// （best-effort）、角色表加载、授予/变更（先读 assignment head revision，PUT）、
// 撤销（DELETE）、409 → 刷新后提示。授权表单与逐成员编辑草稿随动作一并留在 hook。

export type DelegatedRole =
  | "operations"
  | "check_in"
  | "reviewer"
  | "read_only_analyst";
export type PrincipalRole = "owner" | DelegatedRole;

export interface EventView {
  endsAt: string | null;
  eventId: string;
  lifecycleState: string;
  migrationPending: boolean;
  owner: boolean;
  revision: number;
  role: PrincipalRole;
  startsAt: string | null;
  title: string | null;
  venue: string | null;
}

export interface RoleMember {
  assignedAt: string | null;
  assignedByActorId: string | null;
  eventId: string;
  reason: string | null;
  revision: number;
  role: PrincipalRole;
  state: "active";
  subjectActorId: string;
}

export interface RoleMembersPayload {
  event: EventView;
  members: readonly RoleMember[];
}

interface AssignmentView {
  eventId: string;
  owner: boolean;
  revision: number;
  role: DelegatedRole | null;
  state: "active" | "revoked" | null;
  subjectActorId: string;
}

interface ApiEnvelope<T> {
  data?: T;
  error?: { message?: string };
  success: boolean;
}

class RequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "RequestError";
  }
}

const ACTOR_ID = /^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,199}$/u;
export const ROLE_OPTIONS: readonly {
  description: string;
  label: string;
  value: DelegatedRole;
}[] = [
  { description: "配置运营、受保护参会信息、现场流程与发布。", label: "运营", value: "operations" },
  { description: "仅受限签到名单与签到写入。", label: "签到", value: "check_in" },
  { description: "报名审阅与准入决定。", label: "审核", value: "reviewer" },
  { description: "仅活动汇总分析，不含个人名单。", label: "只读分析", value: "read_only_analyst" },
];

export const roleLabel: Record<PrincipalRole, string> = {
  check_in: "签到",
  operations: "运营",
  owner: "活动负责人",
  read_only_analyst: "只读分析",
  reviewer: "审核",
};

function validReason(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 1_000 ? trimmed : null;
}

export function roleFromValue(value: string): DelegatedRole {
  return ROLE_OPTIONS.some((option) => option.value === value)
    ? (value as DelegatedRole)
    : "operations";
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: init?.body
      ? { "content-type": "application/json", ...init.headers }
      : init?.headers,
  });
  const envelope = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;
  if (!response.ok || envelope?.success !== true || envelope.data === undefined) {
    throw new RequestError(
      envelope?.error?.message ?? "角色请求失败。",
      response.status,
    );
  }
  return envelope.data;
}

/**
 * 活动角色管理会话（`GET /access/roles`、`GET|PUT|DELETE /access/assignments/{actorId}`）：
 * - 数据：`snapshot`（event + members）、`delegatedMembers`、`participantOptions`、
 *   `participantLabelByActorId`
 * - 状态：`loading`、`busy`（"grant:<id>" | "revoke:<id>" | null）、`error`、`notice`
 * - 授权表单：`newSubjectActorId`/`setNewSubjectActorId`、`newRole`/`setNewRole`、
 *   `newReason`/`setNewReason`；逐成员编辑：`memberEdits`/`setMemberEdits`
 * - 动作：`load(showLoading?)`、`grantOrChange({ subjectActorId, role, reason })`、`revoke(member)`
 */
export interface RoleManagementSession {
  busy: string | null;
  delegatedMembers: readonly RoleMember[];
  error: string | null;
  grantOrChange: (input: { reason: string; role: DelegatedRole; subjectActorId: string }) => Promise<void>;
  load: (showLoading?: boolean) => Promise<void>;
  loading: boolean;
  memberEdits: Record<string, { reason: string; role: DelegatedRole }>;
  newReason: string;
  newRole: DelegatedRole;
  newSubjectActorId: string;
  notice: string | null;
  participantLabelByActorId: Map<string, string>;
  participantOptions: readonly { actorId: string; label: string }[] | null;
  revoke: (member: RoleMember) => Promise<void>;
  setMemberEdits: React.Dispatch<React.SetStateAction<Record<string, { reason: string; role: DelegatedRole }>>>;
  setNewReason: React.Dispatch<React.SetStateAction<string>>;
  setNewRole: React.Dispatch<React.SetStateAction<DelegatedRole>>;
  setNewSubjectActorId: React.Dispatch<React.SetStateAction<string>>;
  snapshot: RoleMembersPayload | null;
}

export function useRoleManagement(eventId: string): RoleManagementSession {
  const baseUrl = `/api/events/${encodeURIComponent(eventId)}/access`;
  const [snapshot, setSnapshot] = useState<RoleMembersPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [newSubjectActorId, setNewSubjectActorId] = useState("");
  const [newRole, setNewRole] = useState<DelegatedRole>("operations");
  const [newReason, setNewReason] = useState("");
  const [memberEdits, setMemberEdits] = useState<Record<string, { reason: string; role: DelegatedRole }>>({});
  // Registered participants of this event double as the candidate pool, so the
  // owner can pick a person by name instead of hunting down a raw actor id.
  // Loading this is best-effort: without the sensitive-read capability the
  // manual actor-id input still works on its own.
  const [participantOptions, setParticipantOptions] = useState<
    readonly { actorId: string; label: string }[] | null
  >(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch(
          `/api/events/${encodeURIComponent(eventId)}/operations/admin`,
          { cache: "no-store" },
        );
        if (!response.ok) return;
        const body = (await response.json().catch(() => null)) as {
          data?: { participants?: readonly { actorId?: string; company?: string | null; displayName?: string }[] };
        } | null;
        const participants = body?.data?.participants ?? [];
        const seen = new Set<string>();
        const options = participants
          .filter((participant): participant is { actorId: string; company?: string | null; displayName?: string } =>
            typeof participant.actorId === "string" && participant.actorId.trim().length > 0)
          .filter((participant) => {
            if (seen.has(participant.actorId)) return false;
            seen.add(participant.actorId);
            return true;
          })
          .map((participant) => ({
            actorId: participant.actorId,
            label: [participant.displayName, participant.company].filter(Boolean).join(" · ") || participant.actorId,
          }))
          .sort((left, right) => left.label.localeCompare(right.label));
        if (active && options.length) setParticipantOptions(options);
      } catch {
        // Best-effort enrichment only; manual input remains available.
      }
    })();
    return () => { active = false; };
  }, [eventId]);

  const participantLabelByActorId = useMemo(
    () => new Map((participantOptions ?? []).map((option) => [option.actorId, option.label])),
    [participantOptions],
  );

  const load = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const next = await requestJson<RoleMembersPayload>(`${baseUrl}/roles`);
      setSnapshot(next);
      setMemberEdits((current) => {
        const nextEdits: Record<string, { reason: string; role: DelegatedRole }> = {};
        for (const member of next.members) {
          if (member.role === "owner") continue;
          nextEdits[member.subjectActorId] = current[member.subjectActorId] ?? {
            reason: "",
            role: member.role,
          };
        }
        return nextEdits;
      });
      setError(null);
    } catch (cause) {
      setSnapshot(null);
      setError(cause instanceof Error ? cause.message : "无法读取当前活动角色。");
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [baseUrl]);

  useEffect(() => {
    void load();
  }, [load]);

  const delegatedMembers = useMemo(
    () => snapshot?.members.filter((member) => member.role !== "owner") ?? [],
    [snapshot],
  );

  async function currentAssignment(subjectActorId: string): Promise<AssignmentView> {
    return requestJson<AssignmentView>(
      `${baseUrl}/assignments/${encodeURIComponent(subjectActorId)}`,
    );
  }

  async function grantOrChange(input: {
    reason: string;
    role: DelegatedRole;
    subjectActorId: string;
  }) {
    const subjectActorId = input.subjectActorId.trim();
    const reason = validReason(input.reason);
    if (!ACTOR_ID.test(subjectActorId)) {
      setError("请输入准确的账号 ID；此处不提供全库模糊搜索。");
      return;
    }
    if (!reason) {
      setError("请填写 1–1000 个字符的授权或变更原因。");
      return;
    }
    setBusy(`grant:${subjectActorId}`);
    setError(null);
    setNotice(null);
    try {
      // Do not infer revision from the visible active roster: a revoked subject
      // is absent there but retains its durable assignment head revision.
      const current = await currentAssignment(subjectActorId);
      if (current.owner) {
        throw new Error("活动负责人来自 Event Core，不能被授予委派角色。");
      }
      const after = await requestJson<AssignmentView>(
        `${baseUrl}/assignments/${encodeURIComponent(subjectActorId)}`,
        {
          body: JSON.stringify({
            expectedRevision: current.revision,
            reason,
            role: input.role,
          }),
          method: "PUT",
        },
      );
      setNotice(
        current.state === "revoked"
          ? `已按最新版本重新授予 ${roleLabel[input.role]}（版本 ${after.revision}）。`
          : current.state === "active"
            ? `已按最新版本更新为${roleLabel[input.role]}（版本 ${after.revision}）。`
            : `已授予${roleLabel[input.role]}（版本 ${after.revision}）。`,
      );
      setNewSubjectActorId("");
      setNewReason("");
      await load(false);
    } catch (cause) {
      if (cause instanceof RequestError && cause.status === 409) {
        await load(false);
        setError("角色刚被其他管理员更新；已刷新当前版本，请确认后重试。");
      } else {
        setError(cause instanceof Error ? cause.message : "无法保存活动角色。");
      }
    } finally {
      setBusy(null);
    }
  }

  async function revoke(member: RoleMember) {
    const edit = memberEdits[member.subjectActorId];
    const reason = validReason(edit?.reason ?? "");
    if (!reason) {
      setError("撤销前请填写原因，以保留可审计记录。");
      return;
    }
    setBusy(`revoke:${member.subjectActorId}`);
    setError(null);
    setNotice(null);
    try {
      const current = await currentAssignment(member.subjectActorId);
      if (current.state !== "active") {
        await load(false);
        throw new Error("该角色已变化；已刷新当前角色表。");
      }
      const after = await requestJson<AssignmentView>(
        `${baseUrl}/assignments/${encodeURIComponent(member.subjectActorId)}`,
        {
          body: JSON.stringify({ expectedRevision: current.revision, reason }),
          method: "DELETE",
        },
      );
      setNotice(`已撤销 ${member.subjectActorId} 的${roleLabel[member.role]}角色（版本 ${after.revision}）。`);
      await load(false);
    } catch (cause) {
      if (cause instanceof RequestError && cause.status === 409) {
        await load(false);
        setError("角色刚被其他管理员更新；已刷新当前版本，请确认后重试。");
      } else {
        setError(cause instanceof Error ? cause.message : "无法撤销活动角色。");
      }
    } finally {
      setBusy(null);
    }
  }

  return {
    busy,
    delegatedMembers,
    error,
    grantOrChange,
    load,
    loading,
    memberEdits,
    newReason,
    newRole,
    newSubjectActorId,
    notice,
    participantLabelByActorId,
    participantOptions,
    revoke,
    setMemberEdits,
    setNewReason,
    setNewRole,
    setNewSubjectActorId,
    snapshot,
  };
}
