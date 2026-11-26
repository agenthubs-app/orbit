// R17 共同運営者（App；b13 HM-T3「⋯ → 共同運営者」，内容同 Web HostCohostsDrawer / b6 #20）：底部弹层。
// 招待（邮箱或 Orbit ID 可空 + 角色）→ 链接与 H- 码只在这一次显示，可复制；未接受的招待可取消；
// 成员行「⋯」→ 改角色 / 移除（都要理由 1–100 字，带 revision；owner 不可改）；角色能做什么的表；变更履历。
import * as Clipboard from "expo-clipboard";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";

import type { HostCohostHistoryItem, HostCohostInviteResult, HostCohostMember, HostCohostRole, HostCohostsResponse } from "../../api/contract/host-cohosts";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { BottomSheet, Icon, presentActionSheet, UiPressable, UiText, useToast } from "../../components/ui";
import { avatarTone } from "../../components/ui/Avatar";
import { createThemedStyles } from "../../design/theme";
import { radius } from "../../design/tokens";
import { addDesignMock } from "../add/add-design-mock";
import { Avatar, Chip } from "../events/v2/venue-ui";
import type { HostApi } from "./host-api";
import { hostDateShort, type HostT } from "./host-model";
import { Btn, BtnSm, useHostStyles } from "./host-ui";

const ROLES: readonly HostCohostRole[] = ["manager", "check_in", "read_only_analyst"];
const ROLE_LABEL = { check_in: "rCheckIn", manager: "rManager", owner: "rOwnerFixed", read_only_analyst: "rReadOnly" } as const;
const ROLE_GAIN = { check_in: "coGainCheckIn", manager: "coGainManager", read_only_analyst: "coGainReadOnly" } as const;
export const REASON_MAX = 100;
/** 役割でできること（b6 #20 表）：管理者 / 受付 / 閲覧。 */
const RULES: readonly [string, boolean, boolean, boolean][] = [
  ["ruleSetup", true, false, false], ["ruleReview", true, false, false], ["ruleMatching", true, false, false], ["ruleCheckIn", true, true, false], ["ruleReport", true, true, true],
];

export type CohostEdit = { actorId: string; kind: "role"; role: HostCohostRole } | { actorId: string; kind: "remove" };

export function historyText(item: HostCohostHistoryItem, t: HostT): string {
  const role = item.role && item.role !== "owner" ? t(ROLE_LABEL[item.role]) : "";
  if (item.action === "invited") return t("hInvited", { name: item.subjectName, role });
  if (item.action === "revoked") return t("hRevoked", { name: item.subjectName });
  return t("hChanged", { name: item.subjectName, role });
}
const callName = (name: string) => name.trim().split(/[\s　]+/u)[0] ?? name;

export function HostCohostsSheet({ api, eventId, t, visible, onClose, onChanged }: { api: HostApi; eventId: string; t: HostT; visible: boolean; onClose: () => void; onChanged?: () => void }) {
  const toast = useToast();
  const { baseUrl } = useOrbitApiBaseUrl();
  const { styles: h, colors } = useHostStyles();
  const { styles } = useCohostStyles();
  const noKeyboard = addDesignMock("no-keyboard");
  const [data, setData] = useState<HostCohostsResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [inviteRole, setInviteRole] = useState<HostCohostRole>("check_in");
  const [target, setTarget] = useState("");
  const [issued, setIssued] = useState<HostCohostInviteResult | null>(null);
  const [edit, setEdit] = useState<CohostEdit | null>(null);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    const res = await api.cohosts(eventId);
    if (res.ok) setData(res.data); else toast.error(t("loadError"));
  }, [api, eventId, t, toast]);
  useEffect(() => { if (visible) void load(); else { setIssued(null); setEdit(null); setReason(""); } }, [load, visible]);

  const fail = async (reasonCode: string) => {
    if (reasonCode === "conflict") { toast.error(t("conflictFirst")); setEdit(null); await load(); } else toast.error(t("saveError"));
  };
  const invite = async () => {
    if (busy) return;
    setBusy(true);
    const res = await api.inviteCohost(eventId, inviteRole, target);
    setBusy(false);
    if (!res.ok) { await fail(res.reason); return; }
    setIssued(res.data); setTarget(""); toast.success(t("coIssued"));
    await load();
  };
  const save = async () => {
    if (!data || !edit || !reason.trim() || busy) return;
    const member = data.members.find((item) => item.actorId === edit.actorId);
    if (!member) return;
    setBusy(true);
    const res = edit.kind === "role" ? await api.changeRole(eventId, member.actorId, edit.role, reason.trim(), member.revision) : await api.removeCohost(eventId, member.actorId, reason.trim(), member.revision);
    setBusy(false);
    if (!res.ok) { await fail(res.reason); return; }
    setData(res.data); setEdit(null); setReason("");
    toast.success(edit.kind === "role" ? t("coSaved") : t("coRemoved", { name: member.name }));
    onChanged?.();
  };
  const revoke = async (inviteId: string) => {
    if (busy) return;
    setBusy(true);
    const res = await api.revokeInvite(eventId, inviteId);
    setBusy(false);
    if (!res.ok) { await fail(res.reason); return; }
    setData(res.data); toast.success(t("coRevoked"));
  };
  /** The invite link comes as a path: show and copy it as a full address. */
  const full = (text: string) => (text.startsWith("/") ? `${baseUrl.replace(/\/$/, "")}${text}` : text);
  const copy = async (text: string) => {
    try { await Clipboard.setStringAsync(full(text)); toast.success(t("copied")); } catch { toast.error(t("saveError")); }
  };
  const memberMenu = async (member: HostCohostMember) => {
    const key = await presentActionSheet({
      options: [...ROLES.filter((role) => role !== member.role).map((role) => ({ key: role, label: t("coMakeRole", { role: t(ROLE_LABEL[role]) }) })), { destructive: true, key: "remove", label: t("coRemove") }],
      title: t("coMemberMenu", { name: member.name }),
    });
    if (!key) return;
    setReason("");
    setEdit(key === "remove" ? { actorId: member.actorId, kind: "remove" } : { actorId: member.actorId, kind: "role", role: key as HostCohostRole });
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} accessibilityLabel={t("coTitle")}>
      <View style={styles.body} testID="host-cohosts">
        <View>
          <UiText style={styles.title}>{t("coTitle")}</UiText>
          {data ? <UiText style={h.lbl}>{t("coSub", { event: data.eventTitle, n: data.members.length })}</UiText> : null}
        </View>
        {data?.canManage ? (
          <View style={styles.card} testID="host-cohost-invite">
            <UiText style={styles.cardTitle}>{t("coInvite")}</UiText>
            <View style={[h.row, styles.input]}>
              <Icon name="mail" size={16} color={colors.ink3} />
              <TextInput value={target} onChangeText={setTarget} maxLength={200} placeholder={t("coTargetPh")} placeholderTextColor={colors.ink3} accessibilityLabel={t("coTarget")} autoCapitalize="none" keyboardType="email-address" showSoftInputOnFocus={!noKeyboard} style={styles.inputText} testID="host-cohost-target" />
            </View>
            <View style={[h.row, styles.roles]} accessibilityLabel={t("coRoleLabel")}>
              {ROLES.map((role) => {
                const on = role === inviteRole;
                return (
                  <UiPressable key={role} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={t(ROLE_LABEL[role])} onPress={() => setInviteRole(role)} style={[styles.role, on ? styles.roleOn : null]} testID={`host-cohost-role-${role}`}>
                    <UiText style={[styles.roleText, on ? { color: colors.bg } : null]}>{t(ROLE_LABEL[role])}</UiText>
                  </UiPressable>
                );
              })}
            </View>
            <UiText style={h.lbl}>{t("coInviteNote")}</UiText>
            <Btn label={t("coIssue")} variant="primary" height={44} onPress={() => void invite()} testID="host-cohost-issue" />
            {issued ? (
              <View style={styles.issued} testID="host-cohost-issued">
                <UiText style={h.lbl}>{t("coOnce")}</UiText>
                {([["coLink", full(issued.link)], ["coCode", issued.shortCode]] as const).map(([label, value]) => (
                  <View key={label} style={[h.row, { gap: 8 }]}>
                    <UiText style={h.lbl}>{t(label)}</UiText>
                    <UiText style={[label === "coCode" ? styles.code : styles.issuedText, h.grow]} numberOfLines={1}>{value}</UiText>
                    <BtnSm label={t("copy")} icon="copy" onPress={() => void copy(value)} />
                  </View>
                ))}
                <UiText style={h.lbl}>{t("coExpires", { d: hostDateShort(issued.expiresAt, t) })}</UiText>
              </View>
            ) : null}
            {data.invites.map((item) => (
              <View key={item.inviteId} style={[h.row, styles.pending]} testID={`host-cohost-pending-${item.inviteId}`}>
                <View style={h.grow}><UiText style={styles.name}>{item.inviteeLabel ?? t("coLink")}</UiText><UiText style={h.lbl}>{`${t("coPending", { role: t(ROLE_LABEL[item.role]) })} · ${t("coExpires", { d: hostDateShort(item.expiresAt, t) })}`}</UiText></View>
                <BtnSm label={t("coRevoke")} onPress={() => void revoke(item.inviteId)} />
              </View>
            ))}
          </View>
        ) : null}
        {data ? (
          <View style={styles.card}>
            {data.members.map((member, index) => {
              const editing = edit && edit.actorId === member.actorId ? edit : null;
              const owner = member.role === "owner";
              return (
                <View key={member.actorId} style={index ? styles.memberLine : null} testID={`host-cohost-${member.actorId}`}>
                  <View style={[h.row, { gap: 10 }]}>
                    <Avatar initial={member.initial} tone={avatarTone(member.name)} size="sm" />
                    <View style={h.grow}><UiText style={styles.name}>{member.isMe ? t("coYou", { name: member.name }) : member.name}</UiText>{member.org ? <UiText style={h.lbl} numberOfLines={1}>{member.org}</UiText> : null}</View>
                    <View><Chip label={t(ROLE_LABEL[member.role])} {...(member.role === "manager" ? { tone: "lav" as const } : {})} /></View>
                    {!owner && data.canManage && !editing ? (
                      <UiPressable accessibilityRole="button" accessibilityLabel={t("coMemberMenu", { name: member.name })} onPress={() => void memberMenu(member)} style={styles.lbtn} testID={`host-cohost-menu-${member.actorId}`}><Icon name="more" size={16} color={colors.ink2} /></UiPressable>
                    ) : null}
                  </View>
                  {editing ? (
                    <View style={styles.edit} testID="host-cohost-edit">
                      <UiText style={styles.name}>{editing.kind === "role" ? `${t(ROLE_LABEL[member.role as HostCohostRole])} → ${t(ROLE_LABEL[editing.role])}` : t("coRemove")}</UiText>
                      <UiText style={h.lbl}>{editing.kind === "role" ? t(ROLE_GAIN[editing.role]) : t("coRemoveSub")}</UiText>
                      <UiText style={[h.lbl, { marginTop: 6 }]}>{t("coReason")}</UiText>
                      <View style={[styles.input, reason.trim() ? styles.inputOk : null]}>
                        <TextInput value={reason} onChangeText={(value) => setReason(value.slice(0, REASON_MAX))} maxLength={REASON_MAX} placeholder={t("coReasonPh")} placeholderTextColor={colors.ink3} accessibilityLabel={t("coReason")} showSoftInputOnFocus={!noKeyboard} style={styles.inputText} testID="host-cohost-reason" />
                        <UiText style={h.lbl}>{t("coCounter", { n: [...reason].length })}</UiText>
                      </View>
                      {!reason.trim() ? <UiText style={[h.lbl, { color: colors.coralText }]}>{t("coReasonNeeded")}</UiText> : null}
                      <View style={[h.row, { gap: 8, justifyContent: "flex-end" }]}>
                        <BtnSm label={t("cancel")} onPress={() => setEdit(null)} />
                        <UiPressable accessibilityRole="button" accessibilityLabel={editing.kind === "role" ? t("coSave") : t("coRemoveConfirm")} accessibilityState={{ disabled: !reason.trim() || busy }} disabled={!reason.trim() || busy} onPress={() => void save()} style={[h.btnSm, h.primary, !reason.trim() || busy ? styles.off : null]} testID="host-cohost-save">
                          <UiText style={[h.btnSmText, { color: colors.bg }]}>{editing.kind === "role" ? t("coSave") : t("coRemoveConfirm")}</UiText>
                        </UiPressable>
                      </View>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : null}
        {data ? (
          <View style={styles.card}>
            <UiText style={styles.cardTitle}>{t("coRules")}</UiText>
            <View style={[h.row, styles.ruleHead]}><View style={h.grow} />{(["rManager", "rCheckIn", "rReadOnly"] as const).map((key) => <UiText key={key} style={[h.lbl, styles.ruleCell]}>{t(key)}</UiText>)}</View>
            {RULES.map(([key, ...cells]) => (
              <View key={key} style={[h.row, styles.ruleRow]}>
                <UiText style={[h.sub, h.grow]}>{t(key)}</UiText>
                {cells.map((yes, column) => <UiText key={column} accessibilityLabel={t(yes ? "ruleYes" : "ruleNo")} style={[styles.ruleCell, { color: yes ? colors.ok : colors.ink3 }]}>{yes ? "✓" : "—"}</UiText>)}
              </View>
            ))}
          </View>
        ) : null}
        {data ? (
          <View style={[styles.card, styles.flat]}>
            <UiText style={styles.cardTitle}>{t("coHistory")}</UiText>
            {data.history.length ? data.history.map((item, key) => (
              <View key={key} style={[h.row, { alignItems: "flex-start", gap: 10 }]}>
                <UiText style={[h.lbl, styles.when]}>{hostDateShort(item.at, t)}</UiText>
                <View style={h.grow}><UiText style={styles.name}>{historyText(item, t)}</UiText><UiText style={h.lbl}>{t("hMeta", { by: callName(item.byName), reason: item.reason })}</UiText></View>
              </View>
            )) : <UiText style={h.lbl}>{t("hNone")}</UiText>}
          </View>
        ) : null}
      </View>
    </BottomSheet>
  );
}

const useCohostStyles = createThemedStyles((colors) => StyleSheet.create({
  body: { gap: 12, paddingBottom: 12 },
  title: { color: colors.ink, fontSize: 20, fontWeight: "800", lineHeight: 28 },
  card: { backgroundColor: colors.surface2, borderRadius: radius.tile, gap: 10, padding: 14 },
  flat: { backgroundColor: "transparent", borderColor: colors.line, borderWidth: 1 },
  cardTitle: { color: colors.ink, fontSize: 16, fontWeight: "800", lineHeight: 23 },
  input: { alignItems: "center", backgroundColor: colors.surface, borderColor: "transparent", borderRadius: radius.tile, borderWidth: 1.5, flexDirection: "row", gap: 8, minHeight: 44, paddingHorizontal: 12 },
  inputOk: { borderColor: colors.plum300 },
  inputText: { color: colors.ink, flex: 1, fontSize: 16, minHeight: 44 },
  roles: { gap: 6 },
  role: { alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.pill, flex: 1, minHeight: 36, justifyContent: "center", paddingHorizontal: 8 },
  roleOn: { backgroundColor: colors.ink },
  roleText: { color: colors.ink2, fontSize: 14, fontWeight: "700", lineHeight: 20 },
  issued: { backgroundColor: colors.macLav, borderRadius: radius.tile, gap: 8, padding: 12 },
  issuedText: { color: colors.ink, fontSize: 14, lineHeight: 20 },
  code: { color: colors.ink, fontSize: 17, fontWeight: "800", letterSpacing: 1, lineHeight: 24 },
  pending: { gap: 8 },
  name: { color: colors.ink, fontSize: 15, fontWeight: "700", lineHeight: 22 },
  memberLine: { borderTopColor: colors.line, borderTopWidth: 1, paddingTop: 10 },
  lbtn: { alignItems: "center", height: 44, justifyContent: "center", width: 36 },
  edit: { backgroundColor: colors.macLav, borderRadius: radius.tile, gap: 6, marginTop: 10, padding: 12 },
  off: { opacity: 0.45 },
  ruleHead: { gap: 4 },
  ruleRow: { gap: 4, minHeight: 32 },
  ruleCell: { fontSize: 13, fontWeight: "700", textAlign: "center", width: 56 },
  when: { width: 56 },
}));
