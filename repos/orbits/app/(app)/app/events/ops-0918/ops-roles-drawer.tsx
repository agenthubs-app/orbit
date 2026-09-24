/**
 * 运营台协作者抽屉（任务 6）：`/app/events/[id]/operations?drawer=roles`。JSX 逐元素来自
 * docs/designs/Orbit_0918/Events 运营台.dc.html 第 447–476 行（遮罩 448 / 面板 449 / 头 450–453 / 当前协作者 454–465 /
 * 添加协作者 466–473），toast 478–480 由 `OpsToast` 承担。数据与写操作 = `useRoleManagement`（原 `/operations/roles` 工作区抽出的
 * hook，接口零改动）。
 *
 * 与设计的差异（审阅修订 10）：真实 API 需要精确 actor ID + 1–1000 字理由，角色是 运营 / 签到 / 审核 / 只读分析（无「管理员 / 数据查看」），
 * 负责人来自 Event Core 不可授予 → 「邮箱或用户名」输入改为参与者选择器（候选池不可用时退为 actor ID 文本框；候选池可用时
 * 选择器末项「其他账号 ID…」切回文本框——旧工作区允许给活动之外的人员粘贴准确账号 ID，任务 7 评审补回），
 * 角色为真实 `<select>`，新增理由输入；每行「···」为 `<details>` 菜单（改角色 / 移除，各带理由 + 确认），负责人行无菜单。
 * `error` 时面板顶部错误条附「刷新角色」= `load()`（角色表读失败后可重读，不必关抽屉）。
 * 关闭（遮罩 / ✕ / Esc）= 去掉 `?drawer` 整页导航回运营台（保留 `?tab`，与 events-0918/event-register-modal 同法）；
 * 打开时锁 body 滚动 + 焦点进入面板 + Tab 焦点循环（events-0918/event-modal-frame 同法）。
 */
"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent } from "react";

import { loopFocus } from "../events-0918/event-modal-frame";
import { shouldCloseOnKeydown } from "../events-0918/event-register-modal";
import { collaboratorInitial, collaboratorName, ROLE_CHIP_TONE } from "./ops-model";
import { OpsDetailsMenu, OpsToast } from "./ops-shell";
import {
  ROLE_OPTIONS,
  roleFromValue,
  roleLabel,
  useRoleManagement,
  type RoleMember,
} from "./use-role-management";

const TITLE_ID = "ops-roles-drawer-title";
/** 参与者选择器末项：切到手动 actor ID 输入（值不会被当成 actor ID 提交）。 */
export const MANUAL_SUBJECT = "__manual__";

type MemberEditMode = { actorId: string; mode: "change" | "revoke" } | null;

export function OpsRolesDrawer({ closeHref, eventId }: { closeHref: string; eventId: string }) {
  const {
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
  } = useRoleManagement(eventId);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [editing, setEditing] = useState<MemberEditMode>(null);
  // 「其他账号 ID…」：候选池存在时仍允许手动粘贴活动之外的精确 actor ID（旧工作区能力）。
  const [manualSubject, setManualSubject] = useState(false);

  const close = useCallback(() => {
    window.location.assign(closeHref);
  }, [closeHref]);

  // 打开：锁 body 滚动，焦点进面板（第一个输入框，没有则 ✕）；关闭：还原滚动与焦点。
  useEffect(() => {
    if (typeof document === "undefined") return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>("input:not([type=hidden]), select, textarea") ?? panel?.querySelector<HTMLElement>("button, a[href]");
    first?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      previous?.focus?.();
    };
  }, []);

  // 候选池到达时「actor ID 输入框」换成参与者 <select>，若焦点随旧节点丢失则拉回面板内第一个输入。
  useEffect(() => {
    if (typeof document === "undefined" || participantOptions === null) return;
    const panel = panelRef.current;
    if (panel && !panel.contains(document.activeElement)) {
      panel.querySelector<HTMLElement>("input:not([type=hidden]), select, textarea")?.focus();
    }
  }, [participantOptions]);

  // 合并前终审修正 8：候选池到达（或变化）时，若已输入的 actor ID 不在池内，自动切到「其他账号 ID…」模式——
  // 否则 <select> 会显示「请选择参与者」而把先前输入的 ID 藏起来。
  useEffect(() => {
    if (participantOptions === null) return;
    if (newSubjectActorId.trim() && !participantLabelByActorId.has(newSubjectActorId)) setManualSubject(true);
  }, [newSubjectActorId, participantLabelByActorId, participantOptions]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onKeydown = (event: KeyboardEvent) => {
      if (!shouldCloseOnKeydown(event)) return;
      event.preventDefault();
      close();
    };
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, [close]);

  const onOverlayClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) close();
  };

  const onPanelKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return;
    const active = typeof document === "undefined" ? null : document.activeElement;
    if (loopFocus(panelRef.current, active, event.shiftKey)) event.preventDefault();
  };

  const owner = snapshot?.members.find((member) => member.role === "owner") ?? null;
  const total = (owner ? 1 : 0) + delegatedMembers.length;
  const disabled = busy !== null;

  const updateEdit = (member: RoleMember, patch: Partial<{ reason: string; role: string }>) => {
    setMemberEdits((current) => {
      const currentEdit = current[member.subjectActorId] ?? { reason: "", role: roleFromValue(member.role) };
      return {
        ...current,
        [member.subjectActorId]: {
          reason: patch.reason ?? currentEdit.reason,
          role: patch.role === undefined ? currentEdit.role : roleFromValue(patch.role),
        },
      };
    });
  };

  /** 选中菜单项：收起该行的 <details>（原生 details 不会自动关闭），再展开行内表单。 */
  const pickMenu = (event: MouseEvent<HTMLButtonElement> | undefined, actorId: string, mode: "change" | "revoke") => {
    event?.currentTarget?.closest?.("details")?.removeAttribute("open");
    setEditing({ actorId, mode });
  };

  const renderRow = (member: RoleMember) => {
    const tone = ROLE_CHIP_TONE[member.role];
    const id = member.subjectActorId;
    const edit = member.role === "owner" ? null : memberEdits[id] ?? { reason: "", role: roleFromValue(member.role) };
    const open = editing?.actorId === id ? editing.mode : null;
    return (
      <span className="op-dw-member" data-event-role-member={id} key={id}>
        <span className="op-dw-row">
          <span className="op-dw-ava">{collaboratorInitial(id, participantLabelByActorId)}</span>
          <strong className="op-dw-name">{collaboratorName(id, participantLabelByActorId)}</strong>
          <span className="op-dw-role" style={{ background: tone.bg, color: tone.color }}>{roleLabel[member.role]}</span>
          <span className="op-dw-fill" />
          {edit ? (
            <OpsDetailsMenu className="op-dw-more" summary="···" summaryClassName="op-dw-dots" summaryLabel={`${collaboratorName(id, participantLabelByActorId)} 的更多操作`}>
              <div className="op-menu" role="menu">
                <button className="btn op-menu-item op-dw-menu-btn" data-event-role-action={`edit:${id}`} disabled={disabled} onClick={(event) => pickMenu(event, id, "change")} role="menuitem" type="button">改角色</button>
                <button className="btn op-menu-item op-dw-menu-btn" data-event-role-action={`remove:${id}`} disabled={disabled} onClick={(event) => pickMenu(event, id, "revoke")} role="menuitem" type="button">移除</button>
              </div>
            </OpsDetailsMenu>
          ) : null}
        </span>
        {edit && open ? (
          <span className="op-dw-edit" data-event-role-edit={`${open}:${id}`}>
            {open === "change" ? (
              <select className="op-dw-input" data-event-role-select={id} disabled={disabled} onChange={(input) => updateEdit(member, { role: input.target.value })} value={edit.role}>
                {ROLE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            ) : null}
            <input className="op-dw-input" data-event-role-reason={id} disabled={disabled} onChange={(input) => updateEdit(member, { reason: input.target.value })} placeholder={open === "change" ? "变更理由（必填）" : "移除理由（必填）"} value={edit.reason} />
            <span className="op-dw-edit-actions">
              <button
                className="btn op-dw-submit op-dw-submit-sm"
                data-event-role-action={`${open}:${id}`}
                disabled={disabled}
                onClick={() => void (open === "change"
                  ? grantOrChange({ reason: edit.reason, role: edit.role, subjectActorId: id })
                  : revoke(member))}
                type="button"
              >
                {open === "change" ? "确认改角色" : "确认移除"}
              </button>
              <button className="btn op-dw-cancel" onClick={() => setEditing(null)} type="button">取消</button>
            </span>
          </span>
        ) : null}
      </span>
    );
  };

  return (
    <>
      <div className="op-dw-overlay" data-ops-drawer="roles" onClick={onOverlayClick}>
        <div aria-labelledby={TITLE_ID} aria-modal="true" className="op-dw-panel" onKeyDown={onPanelKeyDown} ref={panelRef} role="dialog">
          <div className="op-dw-head">
            <span className="op-dw-head-copy">
              <span className="op-dw-ico">⚇</span>
              <span className="op-dw-titles">
                <strong className="op-dw-title" id={TITLE_ID}>协作者管理</strong>
                <span className="op-dw-sub">仅管理当前活动的协作者权限。</span>
              </span>
            </span>
            <button aria-label="关闭" className="btn op-dw-close" onClick={close} type="button">✕</button>
          </div>

          {error ? (
            <div className="op-note op-note-error op-dw-note" role="alert">
              <span>{error}</span>
              <button className="btn op-dw-cancel op-dw-reload" data-event-role-reload disabled={disabled || loading} onClick={() => void load()} type="button">
                {loading ? "正在刷新…" : "刷新角色"}
              </button>
            </div>
          ) : null}

          <section className="op-dw-sec">
            <strong className="op-dw-sec-title">当前协作者（{total}）</strong>
            {loading ? <span className="op-dw-hint" role="status">正在读取当前角色…</span> : null}
            {owner ? renderRow(owner) : null}
            {delegatedMembers.map(renderRow)}
            {!loading && snapshot && delegatedMembers.length === 0 ? <span className="op-dw-hint">除活动负责人外，尚无协作者。</span> : null}
          </section>

          <section className="op-dw-sec">
            <strong className="op-dw-sec-title">添加协作者</strong>
            <span className="op-dw-field">
              <span className="op-dw-label">参与者</span>
              {participantOptions ? (
                <select
                  className="op-dw-input"
                  data-event-role-participant-picker
                  disabled={disabled}
                  onChange={(input) => {
                    if (input.target.value === MANUAL_SUBJECT) {
                      setManualSubject(true);
                      setNewSubjectActorId("");
                      return;
                    }
                    setManualSubject(false);
                    setNewSubjectActorId(input.target.value);
                  }}
                  value={manualSubject ? MANUAL_SUBJECT : participantLabelByActorId.has(newSubjectActorId) ? newSubjectActorId : ""}
                >
                  <option value="">请选择参与者</option>
                  {participantOptions.map((option) => <option key={option.actorId} value={option.actorId}>{option.label}</option>)}
                  <option value={MANUAL_SUBJECT}>其他账号 ID…</option>
                </select>
              ) : null}
              {!participantOptions || manualSubject ? (
                <input className="op-dw-input" data-event-role-subject="new" disabled={disabled} onChange={(input) => setNewSubjectActorId(input.target.value)} placeholder={participantOptions ? "请输入准确的账号 ID（可为活动之外的人员）" : "请输入参与者 actor ID"} value={newSubjectActorId} />
              ) : null}
            </span>
            <span className="op-dw-field">
              <span className="op-dw-label">角色</span>
              <select className="op-dw-input" data-event-role-select="new" disabled={disabled} onChange={(input) => setNewRole(roleFromValue(input.target.value))} value={newRole}>
                {ROLE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </span>
            <span className="op-dw-field">
              <span className="op-dw-label">理由</span>
              <input className="op-dw-input" data-event-role-reason="new" disabled={disabled} onChange={(input) => setNewReason(input.target.value)} placeholder="授权理由（必填）" value={newReason} />
            </span>
            <button
              className="btn op-dw-submit"
              data-event-role-action="grant"
              disabled={disabled}
              onClick={() => void grantOrChange({ reason: newReason, role: newRole, subjectActorId: newSubjectActorId })}
              type="button"
            >
              {busy === `grant:${newSubjectActorId.trim()}` ? "正在保存…" : "添加协作者"}
            </button>
            <span className="op-dw-hint">ⓘ 权限仅对当前活动生效。</span>
          </section>
        </div>
      </div>
      {notice ? <OpsToast text={notice} /> : null}
    </>
  );
}
