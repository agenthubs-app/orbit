"use client";

// R17 共同運営者 抽屉（b6 #20，`&drawer=cohosts`，背景是当前页签）。
// 数据：GET /api/host/events/[id]/cohosts；招待 POST /cohost-invites（链接与 H- 码只在这一次返回）；取消招待 DELETE /cohost-invites/[inviteId]；
// 改角色 PATCH /cohosts/[actorId]、移除 DELETE /cohosts/[actorId]（都要理由 1–100 字并带 revision）；owner「変更不可」。
// 抽屉宽：画板 540，组件库 Drawer 只有 380 / 520 / 600 档（待组件库，G23）→ 先用 520。
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { HostCohostHistoryItem, HostCohostInviteResult, HostCohostMember, HostCohostRole, HostCohostsResponse } from "../../../../../shared/contract/host-cohosts";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { ContextMenu, Drawer, Icon, useToast, type MenuItem } from "../ui";
import { failureOf, hostApi } from "./host-api";
import { hostDateDay, hostDateShort, hostTranslator, type HostT } from "./host-model";
import s from "./host.module.css";
import m from "./tabs.module.css";

const ROLES: readonly HostCohostRole[] = ["manager", "check_in", "read_only_analyst"];
const ROLE_LABEL = { check_in: "rCheckIn", manager: "rManager", owner: "rOwnerFixed", read_only_analyst: "rReadOnly" } as const;
const ROLE_GAIN = { check_in: "coGainCheckIn", manager: "coGainManager", read_only_analyst: "coGainReadOnly" } as const;
// 与页头头像同一套（HostConsole：共同运营者按顺序 c4 / c2 / c1；本人 c1）。
const TONES = ["a_c4", "a_c2", "a_c1", "a_c3", "a_c5"] as const;
export const REASON_MAX = 100;

/** 役割でできること（b6 #20 表；A9 照画板）。 */
const RULES: ReadonlyArray<[key: "ruleSetup" | "ruleReview" | "ruleMatching" | "ruleCheckIn" | "ruleReport", manager: boolean, checkIn: boolean, readOnly: boolean]> = [
  ["ruleSetup", true, false, false],
  ["ruleReview", true, false, false],
  ["ruleMatching", true, false, false],
  ["ruleCheckIn", true, true, false],
  ["ruleReport", true, true, true],
];

export type CohostEdit = { actorId: string; kind: "role"; role: HostCohostRole } | { actorId: string; kind: "remove" };

export function historyText(item: HostCohostHistoryItem, t: HostT): string {
  const role = item.role && item.role !== "owner" ? t(ROLE_LABEL[item.role]) : "";
  if (item.action === "invited") return t("hInvited", { name: item.subjectName, role });
  if (item.action === "revoked") return t("hRevoked", { name: item.subjectName });
  return t("hChanged", { name: item.subjectName, role });
}

const callName = (name: string) => name.trim().split(/[\s　]+/u)[0] ?? name;

export type HostCohostsViewProps = {
  data: HostCohostsResponse;
  /** R31b: false when the Drawer draws the head (title + subtitle + ✕). */
  head?: boolean;
  t: HostT;
  busy?: boolean;
  inviteRole: HostCohostRole;
  target: string;
  issued?: HostCohostInviteResult | null;
  edit?: CohostEdit | null;
  reason: string;
  onClose?: () => void;
  onTarget?: (value: string) => void;
  onInviteRole?: (role: HostCohostRole) => void;
  onInvite?: () => void;
  onCopy?: (text: string) => void;
  onRevoke?: (inviteId: string) => void;
  onEdit?: (edit: CohostEdit | null) => void;
  onReason?: (value: string) => void;
  onSave?: () => void;
};

function MemberRow({ member, tone, t, canManage, edit, reason, busy, onEdit, onReason, onSave }: {
  member: HostCohostMember; tone: string; t: HostT; canManage: boolean; edit: CohostEdit | null; reason: string; busy: boolean;
  onEdit?: (edit: CohostEdit | null) => void; onReason?: (value: string) => void; onSave?: () => void;
}) {
  const menuRef = useRef<HTMLButtonElement>(null);
  const [menu, setMenu] = useState(false);
  const editing = edit && edit.actorId === member.actorId ? edit : null;
  const owner = member.role === "owner";
  const items: MenuItem[] = owner ? [] : [
    ...ROLES.filter((role) => role !== member.role).map((role) => ({ key: role, label: t("coMakeRole", { role: t(ROLE_LABEL[role]) }), onSelect: () => onEdit?.({ actorId: member.actorId, kind: "role", role }) })),
    { destructive: true, key: "remove", label: t("coRemove"), onSelect: () => onEdit?.({ actorId: member.actorId, kind: "remove" }) },
  ];
  const trimmed = reason.trim();
  return (
    <div className={m.member} data-cohost={member.actorId}>
      <div className={s.row} style={{ gap: 10 }}>
        <div className={`${s.av} ${s[tone]}`} aria-hidden>{member.initial}</div>
        <div className={s.grow}><b className={m.memberName}>{member.isMe ? t("coYou", { name: member.name }) : member.name}</b><div className={`${s.lbl} ${s.clamp1}`}>{member.org}</div></div>
        {owner ? <span className={s.chip}>{t("rOwnerFixed")}</span> : editing?.kind === "role" ? (
          <><span className={s.chip}>{t(ROLE_LABEL[member.role as HostCohostRole])}</span><Icon name="right" size={16} /><span className={`${s.chip} ${editing.role === "manager" ? s.c_lav : ""}`}>{t(ROLE_LABEL[editing.role])}</span></>
        ) : (
          <>
            <span className={`${s.chip} ${member.role === "manager" ? s.c_lav : ""}`}>{t(ROLE_LABEL[member.role as HostCohostRole])}</span>
            {canManage ? <button ref={menuRef} type="button" className={`btn ${m.lbtn}`} aria-haspopup="menu" aria-label={t("coMemberMenu", { name: member.name })} onClick={() => setMenu(true)}><Icon name="more" size={16} /></button> : null}
            {menu ? <ContextMenu open onClose={() => setMenu(false)} anchor={menuRef} label={t("coMemberMenu", { name: member.name })} items={items} /> : null}
          </>
        )}
      </div>
      {editing ? (
        <div className={`${m.mac} ${m.macLav} ${m.edit}`} data-cohost-edit={editing.kind}>
          {editing.kind === "role" ? (
            <div className={`${s.row} ${m.editDiff}`}><b>{t(ROLE_LABEL[member.role as HostCohostRole])}</b><Icon name="right" size={16} /><b>{t(ROLE_LABEL[editing.role])}</b><span className={`${s.lbl} ${m.editGain}`}>{t(ROLE_GAIN[editing.role])}</span></div>
          ) : (
            <div className={`${s.row} ${m.editDiff}`}><b>{t("coRemove")}</b><span className={`${s.lbl} ${m.editGain}`}>{t("coRemoveSub")}</span></div>
          )}
          <label className={`${s.lbl} ${m.reasonLbl}`} htmlFor={`reason-${member.actorId}`} style={{ display: "block" }}>{t("coReason")}</label>
          <div className={`${m.ta} ${trimmed ? m.taOk : ""}`}>
            <textarea id={`reason-${member.actorId}`} rows={1} value={reason} maxLength={REASON_MAX} placeholder={t("coReasonPh")} aria-invalid={!trimmed} onChange={(event) => onReason?.(event.target.value)} />
            <span className={m.counter} aria-hidden>{t("coCounter", { n: [...reason].length })}</span>
          </div>
          <div className={`${s.row} ${m.editActs}`}>
            {!trimmed ? <span className={`${s.lbl} ${m.needReason}`}>{t("coReasonNeeded")}</span> : null}
            <button type="button" className={`btn ${s.btn} ${s.sm} ${m.first}`} onClick={() => onEdit?.(null)}>{t("cancel")}</button>
            <button type="button" className={`btn ${s.btn} ${s.sm} ${s.primary}`} disabled={!trimmed || busy} onClick={onSave}>{editing.kind === "role" ? t("coSave") : t("coRemoveConfirm")}</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function HostCohostsView(props: HostCohostsViewProps) {
  const { data, t, busy = false, inviteRole, target, issued = null, edit = null, reason } = props;
  let index = 0;
  const tones = new Map(data.members.map((member) => [member.actorId, member.role === "owner" ? "a_c1" : TONES[index++ % TONES.length]!]));
  return (
    <div data-host-cohosts="">
      {props.head === false ? null : (
        <div className={`${s.row} ${m.drawerHead}`}>
          <div><div className={m.drawerTitle}>{t("coTitle")}</div><div className={s.lbl}>{t("coSub", { event: data.eventTitle, n: data.members.length })}</div></div>
          <button type="button" className={`btn ${m.rbtn}`} aria-label={t("close")} onClick={props.onClose}><Icon name="x" size={20} /></button>
        </div>
      )}
      {data.canManage ? (
        <div className={`${s.card} ${m.coCard}`} data-cohost-invite="">
          <b>{t("coInvite")}</b>
          <div className={`${s.row} ${m.inviteRow}`}>
            <label className={`${m.input} ${m.inviteInput}`}><Icon name="mail" size={16} /><input type="text" aria-label={t("coTarget")} placeholder={t("coTargetPh")} value={target} maxLength={200} onChange={(event) => props.onTarget?.(event.target.value)} /></label>
            <div className={s.seg} role="radiogroup" aria-label={t("coRoleLabel")}>
              {ROLES.map((role) => <button key={role} type="button" role="radio" aria-checked={role === inviteRole} className={`btn ${s.segBtn} ${role === inviteRole ? s.segOn : ""}`} onClick={() => props.onInviteRole?.(role)}>{t(ROLE_LABEL[role])}</button>)}
            </div>
          </div>
          <div className={`${s.row} ${m.inviteFoot}`}>
            <span className={s.lbl}>{t("coInviteNote")}</span>
            <button type="button" className={`btn ${s.btn} ${s.sm} ${s.primary} ${m.inviteIssue}`} disabled={busy} onClick={props.onInvite}>{t("coIssue")}</button>
          </div>
          {issued ? (
            <div className={m.issued} data-cohost-issued="">
              <div className={s.lbl}>{t("coOnce")}</div>
              <div className={`${s.row} ${m.issuedRow}`}><span className={s.lbl}>{t("coLink")}</span><span className={`${s.clamp1} ${s.grow}`}>{issued.link}</span><button type="button" className={`btn ${s.btn} ${s.sm}`} onClick={() => props.onCopy?.(issued.link)}><Icon name="copy" size={16} />{t("copy")}</button></div>
              <div className={`${s.row} ${m.issuedRow}`}><span className={s.lbl}>{t("coCode")}</span><span className={`${m.code} ${s.grow}`}>{issued.shortCode}</span><button type="button" className={`btn ${s.btn} ${s.sm}`} onClick={() => props.onCopy?.(issued.shortCode)}><Icon name="copy" size={16} />{t("copy")}</button></div>
              <div className={s.lbl}>{t("coExpires", { d: hostDateDay(issued.expiresAt, t) })}</div>
            </div>
          ) : null}
          {data.invites.map((invite) => (
            <div key={invite.inviteId} className={`${s.row} ${m.inviteItem}`} data-cohost-pending={invite.inviteId}>
              <span className={s.grow}><b>{invite.inviteeLabel ?? t("coLink")}</b><span className={s.lbl}> · {t("coPending", { role: t(ROLE_LABEL[invite.role]) })} · {t("coExpires", { d: hostDateDay(invite.expiresAt, t) })}</span></span>
              <button type="button" className={`btn ${s.btn} ${s.sm} ${s.ghost}`} disabled={busy} onClick={() => props.onRevoke?.(invite.inviteId)}>{t("coRevoke")}</button>
            </div>
          ))}
        </div>
      ) : null}
      <div className={`${s.card} ${m.coCard} ${m.coList}`}>
        {data.members.map((member) => (
          <MemberRow key={member.actorId} member={member} tone={tones.get(member.actorId)!} t={t} canManage={data.canManage} edit={edit} reason={reason} busy={busy}
            onEdit={props.onEdit} onReason={props.onReason} onSave={props.onSave} />
        ))}
      </div>
      <div className={`${s.card} ${m.coCard}`}>
        <b>{t("coRules")}</b>
        <table className={`${m.table} ${m.rule}`}>
          <thead><tr><th /><th className={m.thCenter}>{t("rManager")}</th><th className={m.thCenter}>{t("rCheckIn")}</th><th className={m.thCenter}>{t("rReadOnly")}</th></tr></thead>
          <tbody>
            {RULES.map(([key, ...cells]) => (
              <tr key={key}><td>{t(key)}</td>{cells.map((yes, column) => <td key={column} className={yes ? m.ruleYes : m.ruleNo}><span aria-hidden>{yes ? "✓" : "—"}</span><span className={m.srOnly}>{yes ? t("ruleYes") : t("ruleNo")}</span></td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={`${s.card} ${s.flat} ${m.coCard}`}>
        <b>{t("coHistory")}</b>
        {data.history.length ? data.history.map((item, key) => (
          <div key={key} className={m.tl}><time dateTime={item.at}>{hostDateShort(item.at, t)}</time><div><b>{historyText(item, t)}</b><div className={s.lbl}>{t("hMeta", { by: callName(item.byName), reason: item.reason })}</div></div></div>
        )) : <div className={`${s.lbl} ${m.ringLbl}`}>{t("hNone")}</div>}
      </div>
    </div>
  );
}

export function HostCohostsDrawer({ eventId, language, onClose, onChanged }: { eventId: string; language: OrbitLanguage; onClose: () => void; onChanged?: () => void }) {
  const t = useMemo(() => hostTranslator(language), [language]);
  const toast = useToast();
  const [data, setData] = useState<HostCohostsResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [inviteRole, setInviteRole] = useState<HostCohostRole>("check_in");
  const [target, setTarget] = useState("");
  const [issued, setIssued] = useState<HostCohostInviteResult | null>(null);
  const [edit, setEdit] = useState<CohostEdit | null>(null);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    const res = await hostApi.cohosts(eventId);
    if (res.ok) setData(res.data);
    else toast.error(t("loadError"));
  }, [eventId, t, toast]);
  useEffect(() => { void load(); }, [load]);

  const fail = async (reasonCode: ReturnType<typeof failureOf>) => {
    if (reasonCode === "conflict") { toast.error(t("conflictFirst")); setEdit(null); await load(); }
    else toast.error(t("saveError"));
  };

  const invite = async () => {
    setBusy(true);
    const res = await hostApi.invite(eventId, inviteRole, target);
    setBusy(false);
    if (!res.ok) { await fail(failureOf(res)); return; }
    setIssued(res.data);
    setTarget("");
    toast.success(t("coIssued"));
    await load();
  };

  const save = async () => {
    if (!data || !edit || !reason.trim()) return;
    const member = data.members.find((item) => item.actorId === edit.actorId);
    if (!member) return;
    setBusy(true);
    const res = edit.kind === "role"
      ? await hostApi.changeRole(eventId, member.actorId, edit.role, reason.trim(), member.revision)
      : await hostApi.removeCohost(eventId, member.actorId, reason.trim(), member.revision);
    setBusy(false);
    if (!res.ok) { await fail(failureOf(res)); return; }
    setData(res.data);
    setEdit(null);
    setReason("");
    toast.success(edit.kind === "role" ? t("coSaved") : t("coRemoved", { name: member.name }));
    onChanged?.();
  };

  const revoke = async (inviteId: string) => {
    setBusy(true);
    const res = await hostApi.revokeInvite(eventId, inviteId);
    setBusy(false);
    if (!res.ok) { await fail(failureOf(res)); return; }
    setData(res.data);
    toast.success(t("coRevoked"));
  };

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text.startsWith("/") ? `${window.location.origin}${text}` : text); toast.success(t("copied")); } catch { toast.error(t("saveError")); }
  };

  return (
    // R31b（R17-17 / RD-27）：共同運営者 = 组件 Drawer 的标题 + 副标题 + 白色圆底 ✕，520 宽、内边距 22（b6 #20）。
    <Drawer open onClose={onClose} title={t("coTitle")} subtitle={data ? t("coSub", { event: data.eventTitle, n: data.members.length }) : undefined} size="md">
      <div>
        {data ? (
          <HostCohostsView head={false} data={data} t={t} busy={busy} inviteRole={inviteRole} target={target} issued={issued} edit={edit} reason={reason}
            onClose={onClose} onTarget={setTarget} onInviteRole={setInviteRole} onInvite={() => void invite()} onCopy={(text) => void copy(text)} onRevoke={(inviteId) => void revoke(inviteId)}
            onEdit={(next) => { setEdit(next); setReason(""); }} onReason={(value) => setReason(value.slice(0, REASON_MAX))} onSave={() => void save()} />
        ) : null}
      </div>
    </Drawer>
  );
}
