// R11a 連絡先詳細（App; app.html #29, b9 #20 / #21 / #22 招待でつながった人, b5 #42–#44 編集・削除）。
// 头卡（名片式）· 人物タイプの確認カード（fit candidate）· なぜこの人か（value-lines，联网增强）· 次の一手 · 力になれること /
// 求めていること · やりとり。招待でつながった人：本人入力 chip、本人入力的项目、同期停止的项目、⋯ 里的共有 / 解除（R15 sheet）。
// 以前の値（fieldHistory）。顶栏 📅（新建个人日程，带上这位联系人；所有联系人都有）· ⋯：編集 / 共有する項目 / つながりを解除 / 削除。
// contact-reach R42 ⑦：「次の一手」卡（无下一步时只剩按钮）的「連絡する」打开全屏写消息页，下面一行说明走站内信还是邮件草稿。
// 往来：联系人记录里的备忘 + 笔记里关联 / @ 到这个人的笔记（本机笔记镜像），按交流日期新的在上，点开进笔记。
// 「＋ 记一笔交流」（docs/designs/contact-log-2026-11 ⑤）：底部弹层 ContactLogSheet；自己记的前面是方式标签（lav），
// 名片原文 / 系统说明前面是灰色来源标签。
// 本机优先：详情读同步镜像，离线照常显示；value-lines / fit / 招待连接是联网增强，失败或「尚未実装」时整块隐藏（G18）。
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Linking, StyleSheet, View } from "react-native";

import { whenNotImplemented } from "../../api/compute/not-implemented";
import type { ProfileContactMethods } from "../../api/compute/profile-contact-methods";
import { ContactMethodRows } from "../../components/ContactMethodRows";
import type { InviteConnectionView } from "../../api/contract/invite-codes";
import type { PlanContactFit } from "../../api/contract/plan-v2";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { AppScreen } from "../../components/AppScreen";
import { ActionSheet, Avatar, Button, Chip, ConfirmDialog, Icon, IconButton, InlineChip, OfflineBar, RetryCard, Skeleton, UiPressable, UiText, useToast } from "../../components/ui";
import Svg, { Defs, Rect, Stop } from "../../components/ui/svg";
import { createThemedStyles } from "../../design/theme";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { useApiResource } from "../../hooks/useApiResource";
import { useLocalContacts } from "../../hooks/useLocalContacts";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { localContactDetail, withLegacyNetworkFields } from "../../view-models/contacts-local";
import { DensityDots } from "../add/add-ui";
import { InviteShareSheet, InviteUnlinkSheet } from "../add/invite/InviteConnectionSheets";
import { useInviteApi } from "../add/invite/invite-api";
import { LinearGradient } from "../plan/plan-svg";
import { ContactRelationshipInitializer, useContactInitialization } from "../contacts/ContactRelationshipInitializer";
import { useNotesListSource } from "../notes/notes-source";
import { NETWORK_CHIP_COPY } from "./NetworkScreen";
import { detailContactFrom, detailHeaderChips, fitCandidate, localizedCardNotes, previousValues, recentSelfUpdates, tokyoMonthDay, type DetailContact, type DetailFieldHistoryEntry } from "./contact-detail-model";
import { ContactLogSheet } from "./ContactLogSheet";
import { AppointmentProposalCard } from "../inbox/AppointmentProposalCard";
import { loadReachEligibility, reachPathOf, rememberReachEligibility, type ReachEligibility } from "./contact-reach-model";
import { monthDayOf, sortTimeline, timelineDay, type ContactLogPatch } from "./contact-log-model";
import { useDeleteContact } from "./useDeleteContact";
import { useNetworkMerge } from "./useNetworkMerge";
import { useNetworkDesignContacts } from "./network-design-fixture";

interface ValueLine { relation?: string | null; evidence?: string[]; meetingCount?: number }
const valueLineLang = (language: string) => (language === "zh" ? "zh" : "en");
// This app session's last answer per person (in memory only): reopening a person draws the line at once, no bone.
const valueLineCache = new Map<string, ValueLine | null>();
const cachedValueLine = (contactId: string, language: string): ValueLine | null | undefined => valueLineCache.get(`${contactId}:${valueLineLang(language)}`);

const STATUS_COPY = { active: "network.status.active", nurture: "network.status.nurture", needs_follow_up: "network.status.needs_follow_up", archived: "network.status.archived" } as const;
const FIELD_COPY: Record<string, "network.detail.fieldName" | "network.detail.fieldCompany" | "network.detail.fieldRole" | "network.detail.fieldEmail" | "network.detail.fieldPhone" | "network.detail.fieldOffering" | "network.detail.fieldSeeking"> = {
  displayName: "network.detail.fieldName", organization: "network.detail.fieldCompany", role: "network.detail.fieldRole", email: "network.detail.fieldEmail",
  phone: "network.detail.fieldPhone", offering: "network.detail.fieldOffering", seeking: "network.detail.fieldSeeking",
};
const INVITE_FIELD_TO_HISTORY: Record<string, string> = { organization: "organization", role: "role", email: "email", phone: "phone", offering: "offering", seeking: "seeking", displayName: "displayName" };

export function NetworkContactScreen({ contactId, now = () => Date.now() }: { contactId: string; now?: () => number }) {
  const { styles, colors } = useStyles();
  const { t, language } = useOrbitLocale();
  const router = useRouter();
  const params = useLocalSearchParams<{ design?: string | string[]; appointmentId?: string | string[] }>();
  // A meeting notification opens /contacts/{id}?appointmentId=… (server href): the meeting lives in the conversation.
  const appointmentId = (Array.isArray(params.appointmentId) ? params.appointmentId[0] : params.appointmentId) ?? "";
  const toast = useToast();
  const auth = useOrbitAuthSession();
  const client = useOrbitApiClient();
  const inviteApi = useInviteApi();
  const local = useLocalContacts();
  const fixture = useNetworkDesignContacts();
  const localRows = fixture.enabled ? fixture.data?.rows ?? [] : local.rows;
  const merge = useNetworkMerge();
  const remote = useApiResource<Record<string, unknown>>(`/api/contacts/${encodeURIComponent(contactId)}`, () => false, { scopeKey: contactId, cachePolicy: "network-only", enabled: !fixture.enabled && !local.available });
  const sharedMethods = useApiResource<ProfileContactMethods>(
    `/api/contacts/${encodeURIComponent(contactId)}/shared-contact-methods`, () => false,
    { scopeKey: `${auth.actorId ?? ""}:${contactId}`, cachePolicy: "network-only",
      enabled: !fixture.enabled && Boolean(auth.actorId) && contactId.startsWith("contact:event-consent:") },
  );
  const fixtureShared = fixture.enabled ? fixture.data?.sharedContactMethods?.[contactId] : undefined;
  const row = useMemo(() => localRows.find((candidate) => candidate.card?.id === contactId || candidate.id === contactId) ?? null, [localRows, contactId]);
  const card = row ? withLegacyNetworkFields(row).card : null;
  const contact: DetailContact | null = useMemo(() => {
    if (fixture.enabled || local.available) return detailContactFrom(localContactDetail(localRows, contactId));
    return remote.kind === "success" ? detailContactFrom(remote.data) : null;
  }, [fixture.enabled, local.available, localRows, contactId, remote]);
  const linkedSource = useNotesListSource({ actorId: auth.actorId ?? "", scopeKey: `network-contact:${contactId}`, association: "all", contactId, noteKind: "all", q: "" });
  const goalLink = fixture.enabled ? fixture.data?.links.find((link) => link.contactId === contactId) ?? null : merge.links.get(contactId) ?? null;

  // undefined = still reading: the why card holds a one-line bone instead of popping in later.
  const [valueLine, setValueLine] = useState<ValueLine | null | undefined>(() => (fixture.enabled ? null : cachedValueLine(contactId, language)));
  const [fit, setFit] = useState<PlanContactFit | null>(null);
  const [connection, setConnection] = useState<InviteConnectionView | null>(null);
  // contact-reach R42 (D1/D7): which way 連絡する goes — read for every contact. undefined = still reading (the button
  // waits and the path line is a bone, never a label that changes); null = not readable → e-mail draft, never blocks.
  const [reach, setReach] = useState<{ contactId: string; value: ReachEligibility | null } | null>(null);
  const [whyOpen, setWhyOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<View>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [unlinkOpen, setUnlinkOpen] = useState(fixture.enabled && params.design === "unlink");
  useEffect(() => { if (fixture.enabled) setUnlinkOpen(params.design === "unlink"); }, [fixture.enabled, params.design]);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  // 刚保存、同步镜像还没带回来的交流（同步回来后按正文去重，不会显示两次）。
  const [justLogged, setJustLogged] = useState<DetailContact["notes"]>([]);
  const [openHistory, setOpenHistory] = useState<string | null>(null);
  const [deciding, setDeciding] = useState(false);
  const [updateDismissed, setUpdateDismissed] = useState(false);

  useEffect(() => {
    let live = true;
    if (fixture.enabled) {
      if (fixture.data) {
        setValueLine(fixture.data.valueLines[contactId] ?? null);
        setFit(fixture.data.fits[contactId] ?? null);
        setConnection(fixture.data.connections[contactId] ?? null);
      }
      return () => { live = false; };
    }
    const lang = valueLineLang(language);
    setValueLine(cachedValueLine(contactId, language));
    void client.get<{ lines: (ValueLine & { contactId: string })[] }>(`/api/contacts/value-lines?ids=${encodeURIComponent(contactId)}&lang=${lang}`).then((result) => {
      if (!live) return;
      // Offline / failed / not implemented: keep the last answer, or hide the card (G18) — never hold the bone.
      if (whenNotImplemented(result, { use: "hide" }) || !result.success) { setValueLine((current) => current ?? null); return; }
      const line = result.data.lines.find((item) => item.contactId === contactId) ?? null;
      valueLineCache.set(`${contactId}:${lang}`, line);
      setValueLine(line);
    });
    void client.get<PlanContactFit>(`/api/agent/plans/v2/contacts/${encodeURIComponent(contactId)}/fit`).then((result) => {
      if (live && result.success && Array.isArray(result.data?.fits)) setFit(result.data);
    });
    void inviteApi.connection(contactId).then((result) => {
      if (live && result.ok) setConnection(result.data);
    });
    return () => { live = false; };
  }, [client, inviteApi, contactId, language, fixture.enabled, fixture.data]);

  useEffect(() => {
    if (fixture.enabled) return;
    const controller = new AbortController();
    void loadReachEligibility(client, contactId, controller.signal).then((value) => {
      if (controller.signal.aborted) return;
      if (auth.actorId) rememberReachEligibility(auth.accountId ?? auth.actorId, contactId, value);
      setReach({ contactId, value });
    });
    return () => controller.abort();
  }, [auth.accountId, auth.actorId, client, contactId, fixture.enabled]);
  const eligibility = fixture.enabled ? null : reach?.contactId === contactId ? reach.value : undefined;
  // The notification's meeting: shown in its conversation when there is one, otherwise on this page.
  const appointmentConversation = appointmentId && eligibility?.conversationId ? eligibility.conversationId : null;
  useEffect(() => {
    if (appointmentConversation) router.replace(`/inbox/${encodeURIComponent(appointmentConversation)}?appointmentId=${encodeURIComponent(appointmentId)}` as Href);
  }, [appointmentConversation, appointmentId, router]);

  const candidate = fixture.enabled && params.design === "sync" ? null : fitCandidate(fit);
  const decide = useCallback(async (decision: "accept" | "dismiss") => {
    if (!candidate || deciding) return;
    setDeciding(true);
    const result = await client.post(`/api/agent/plans/v2/${encodeURIComponent(candidate.planId)}/types/${encodeURIComponent(candidate.itemId)}/candidates/${encodeURIComponent(contactId)}/decision`,
      { body: { decision, idempotencyKey: `r11a-fit:${contactId}:${candidate.itemId}:${decision}` } });
    setDeciding(false);
    if (result.success) {
      setFit((current) => current ? { ...current, fits: current.fits.filter((item) => item.itemId !== candidate.itemId) } : current);
      toast.success(t("network.detail.fitDone"));
    } else toast.error(t("network.detail.fitFailed"));
  }, [candidate, client, contactId, deciding, t, toast]);

  const deletion = useDeleteContact(() => local.refresh());
  // 关系初期化（活动名单带来的待初期化联系人，旧组件原样挂上；R11a 设计稿无，见 REPORT）。
  const initialization = useContactInitialization(contactId, card?.pendingInitialization ? contact?.connectionId ?? null : undefined, `network:${contactId}`, () => true, () => local.refresh());

  if (!contact) {
    const loading = fixture.enabled ? fixture.loading : local.available ? local.freshness.loading : remote.kind === "loading";
    return (
      <AppScreen inset="kit" title="" backAccessibilityLabel={t("network.detail.back")}>
        <View testID="network-contact">
          {loading ? <View style={styles.card}><Skeleton lines={5} /></View> : <RetryCard title={local.available ? t("network.detail.notFound") : t("network.detail.loadFailed")} onRetry={() => (fixture.enabled ? fixture.refresh() : local.available ? local.refresh() : remote.refresh())} />}
        </View>
      </AppScreen>
    );
  }

  const chips = detailHeaderChips(contact, (city) => t(`network.city.${city}`), language);
  const self = card?.sourceChip === "self" || connection !== null;
  const nextStep = contact.nextAction.trim();
  const selfUpdate = fixture.enabled && params.design === "fit" || updateDismissed ? null : recentSelfUpdates(contact.fieldHistory, now());
  const stagedRole = fixture.enabled && params.design === "sync" ? t("network.detail.syncSampleRole") : contact.role;
  const stagedOffering = fixture.enabled && params.design === "sync" ? [...contact.offering, t("network.detail.syncSampleOffering")] : contact.offering;
  // QA-C: without any recorded interaction the server fills the note / last interaction with relationship context or a generated
  // placeholder ("Background generated from…", dated today) — not an interaction, so it is left out; card notes speak the UI language.
  const hasEvidence = contact.notes.some((note) => note.id.startsWith("note:relationship-evidence:"));
  const meetingLabels = { intro: t("network.metReferral"), formerColleague: t("add.completion.optionFormerColleague"), forgot: t("add.completion.optionUnknown") };
  const recordNotes = contact.notes.filter((note) => !note.id.startsWith("note:live-contact-detail:"))
    .map((note) => (note.id.startsWith("note:business-card-notes:") ? { ...note, body: localizedCardNotes(note.body, t("network.edit.met"), meetingLabels) } : note));
  const linkedNotes = mergeTimelineNotes([...recordNotes, ...justLogged.filter((pending) => !recordNotes.some((note) => note.origin === "user" && note.body === pending.body))], linkedSource.notes ?? []);
  const lastInteraction = hasEvidence ? contact.lastInteraction : null;
  const timeline = withSystemEntries(linkedNotes, lastInteraction, hasEvidence ? contact.generatedInteraction : null);
  // contact-reach R42 ⑦: 「連絡する」 opens the full-screen message / e-mail draft; the line under it says which.
  const reachPath = eligibility === undefined ? null : reachPathOf(eligibility);
  const reachCard = (
    <View style={[styles.card, styles.gapTop]} testID="network-next-card">
      {nextStep ? <><UiText style={styles.lbl}>{t("network.detail.nextTitle")}</UiText><UiText style={styles.cardTitle}>{nextStep}</UiText></> : null}
      <View style={nextStep ? styles.gapSmall : undefined} testID={`network-reach-${reachPath ?? "loading"}`}>
        <Button variant="primary" block icon="mail" label={t("network.reach.button")} disabled={eligibility === undefined} onPress={() => router.push(`/contacts/reach/${encodeURIComponent(contactId)}` as Href)} />
      </View>
      {reachPath ? <UiText style={[styles.lbl, styles.center]} testID="network-reach-path">{t(reachPath === "orbit" ? "network.reach.pathOrbit" : "network.reach.pathEmail")}</UiText>
        : <View style={styles.pathBone} testID="network-reach-path-loading"><View style={styles.pathBoneBar} /></View>}
    </View>
  );
  const reachOut = (value: string, scheme: "mailto" | "tel", missing: "network.detail.noEmail" | "network.detail.noPhone") => { if (value) Linking.openURL(`${scheme}:${value}`).catch(() => toast.info(t("network.detail.openFailed", { value }))); else toast.info(t(missing)); };
  const menuOptions = [
    { key: "edit", label: t("network.detail.edit") },
    ...(connection ? [{ key: "share", label: t("network.detail.share") }, { key: "unlink", label: t("network.detail.unlink"), destructive: true }] : []),
    { key: "delete", label: t("network.detail.delete"), destructive: true },
  ];
  const history = (field: string) => previousValues(contact.fieldHistory, field);
  const logOffline = fixture.enabled ? fixture.offline : local.available ? local.freshness.offline : false;
  const logTarget = { id: contactId, displayName: contact.displayName, offering: contact.offering, seeking: contact.seeking,
    industry: [contact.primaryIndustryLabel, contact.secondaryIndustryLabel].filter(Boolean).join(" · ") || contact.profileIndustry || "" };
  const logged = (patch: ContactLogPatch) => {
    setLogOpen(false);
    const at = new Date(now()).toISOString();
    setJustLogged((current) => [{ id: `pending-log:${at}`, body: patch.note.body, kind: "memo", createdAt: at, title: "", origin: "user", occurredAt: patch.note.occurredAt, channel: patch.note.channel, ...(patch.note.topics ? { topics: patch.note.topics } : {}) }, ...current]);
    toast.success(t("network.log.saved"));
    if (local.available) local.refresh(); else if (!fixture.enabled) remote.refresh();
  };
  const logButton = (
    <UiPressable accessibilityRole="button" accessibilityLabel={t("network.log.add")} onPress={() => setLogOpen(true)} testID="network-log-open">
      <UiText style={styles.more}>{t("network.log.add")}</UiText>
    </UiPressable>
  );

  return (
    <AppScreen inset="kit" title="" backAccessibilityLabel={t("network.detail.back")}
      headerActions={<>
        {/* R42 (D7): 📅 予定を追加 sits in the header for every contact (invite-linked ones included). */}
        <IconButton icon="calendar" accessibilityLabel={t("network.detail.schedule")} onPress={() => router.push(`/schedule/personal/new?contactId=${encodeURIComponent(contactId)}` as Href)} />
        <IconButton ref={menuButtonRef} icon="more" accessibilityLabel={t("network.detail.more")} onPress={() => setMenuOpen(true)} />
      </>}>
      <View testID="network-contact">
        {(fixture.enabled ? fixture.offline : local.freshness.offline) ? <View style={styles.gapBottom}><OfflineBar offline pending={0} /></View> : null}

        <View style={[styles.card, styles.head, self ? styles.headSelf : styles.headPerson]} testID="network-contact-head">
          <Avatar name={contact.displayName} size="lg" />
          <UiText style={styles.name}>{contact.displayName}</UiText>
          {[contact.organization, stagedRole].filter(Boolean).length ? <UiText style={styles.sub}>{[contact.organization, stagedRole].filter(Boolean).join(" · ")}</UiText> : null}
          {self ? (
            <>
              <View style={styles.rowCenter}><DensityDots level={3} /><Chip label={t("network.chipSelf")} tone="teal" /></View>
              <UiText style={styles.lbl}>{t("network.detail.selfHint")}</UiText>
            </>
          ) : (
            <View style={styles.chips}>
              <Chip label={t(STATUS_COPY[contact.status as keyof typeof STATUS_COPY] ?? "network.status.active")} tone="lav" />
              {chips.industry ? <Chip label={chips.industry} /> : null}
              {chips.city ? <Chip label={chips.city} /> : null}
            </View>
          )}
          {!self ? (
            <View style={styles.actions}>
              <View style={[styles.actionCircle, !contact.primaryEmail && styles.actionEmpty]}><IconButton icon="mail" accessibilityLabel={t("network.detail.mail")} onPress={() => reachOut(contact.primaryEmail, "mailto", "network.detail.noEmail")} /></View>
              <View style={[styles.actionCircle, !contact.primaryPhone && styles.actionEmpty]}><IconButton icon="phone" accessibilityLabel={t("network.detail.call")} onPress={() => reachOut(contact.primaryPhone, "tel", "network.detail.noPhone")} /></View>
              <View style={styles.actionCircle}><IconButton icon="pen" accessibilityLabel={t("network.detail.edit")} onPress={() => router.push(`/contacts/edit/${encodeURIComponent(contactId)}` as Href)} /></View>
            </View>
          ) : null}
        </View>

        {appointmentId && !appointmentConversation && eligibility !== undefined ? (
          <View style={styles.gapTop} testID="network-appointment">
            <AppointmentProposalCard appointmentId={appointmentId} peerName={contact.displayName} highlighted offline={fixture.enabled ? fixture.offline : local.freshness.offline} />
          </View>
        ) : null}

        {card?.pendingInitialization && !(fixture.enabled ? fixture.offline : local.freshness.offline) ? <View style={styles.gapTop}><ContactRelationshipInitializer binding={initialization} /></View> : null}

        {candidate ? (
          <View style={[styles.card, styles.confirm, styles.gapTop]} testID="network-fit-card">
            <View style={styles.rowCenter}>
              <View style={[styles.emo, { backgroundColor: colors.macApricot }]}><UiText style={styles.emoText}>{candidate.emoji || "🎯"}</UiText></View>
              <UiText style={[styles.cardTitle, styles.grow]}>{t("network.detail.fitTitle", { label: candidate.shortLabel })}</UiText>
              {candidate.reason ? <IconButton icon="info" accessibilityLabel={t("network.detail.whyBasis", { basis: "" })} onPress={() => setWhyOpen((value) => !value)} /> : null}
            </View>
            {whyOpen && candidate.reason ? <UiText style={styles.lbl}>{t("network.detail.whyBasis", { basis: candidate.reason })}</UiText> : null}
            <View style={styles.rowCenter}>
              <Button variant="primary" size="sm" icon="check" label={t("network.detail.fitYes")} onPress={() => void decide("accept")} disabled={deciding} />
              <Button variant="secondary" size="sm" icon="x" label={t("network.detail.fitNo")} onPress={() => void decide("dismiss")} disabled={deciding} />
            </View>
          </View>
        ) : null}

        {selfUpdate ? (
          <View style={[styles.card, styles.gapTop, styles.syncCard]} testID="network-self-update">
            <View style={styles.rowCenter}>
              <View style={[styles.emo, { backgroundColor: colors.macLav }]}><UiText style={styles.emoText}>🔄</UiText></View>
              <View style={styles.grow}><UiText style={styles.cardTitle}>{t("network.detail.syncTitle", { name: contact.displayName })}</UiText><UiText style={styles.lbl}>{t("network.detail.syncSub", { date: tokyoMonthDay(selfUpdate.at) })}</UiText></View>
              <IconButton icon="x" accessibilityLabel={t("network.detail.dismissUpdate")} onPress={() => setUpdateDismissed(true)} />
            </View>
            {selfUpdate.entries.map((entry) => <FieldChange key={`${entry.field}-${entry.at}`} entry={entry} />)}
            <UiText style={styles.lbl}>{t("network.detail.syncKeep")}</UiText>
          </View>
        ) : null}

        {!self && (valueLine === undefined || valueLine?.relation || goalLink) ? (
          <View style={[styles.card, styles.whyCard, styles.gapTop]} testID="network-why-card">
            <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} pointerEvents="none">
              <Defs><LinearGradient id="networkWhyGradient" x1="0%" y1="0%" x2="100%" y2="100%"><Stop offset="0%" stopColor={colors.macPink} /><Stop offset="65%" stopColor={colors.surface} /></LinearGradient></Defs>
              <Rect x={0} y={0} width="100%" height="100%" fill="url(#networkWhyGradient)" />
            </Svg>
            <View style={styles.rowCenter}>
              <View style={[styles.emo, { backgroundColor: colors.macPink }]}><UiText style={styles.emoText}>🎯</UiText></View>
              <UiText style={[styles.cardTitle, styles.grow]}>{t("network.detail.whyTitle", { name: contact.displayName })}</UiText>
              {valueLine?.evidence?.length ? <IconButton icon="info" accessibilityLabel={t("network.detail.whyBasis", { basis: "" })} onPress={() => setWhyOpen((value) => !value)} /> : null}
            </View>
            {valueLine === undefined ? <View style={styles.whyBone} testID="network-why-loading"><View style={styles.whyBoneBar} /></View>
              : valueLine?.relation ? <UiText style={[styles.body, styles.whyBody]}>{valueLine.relation}</UiText> : null}
            {whyOpen && valueLine?.evidence?.length ? <UiText style={styles.lbl}>{t("network.detail.whyBasis", { basis: valueLine.evidence.map((label) => evidenceLabel(label, t)).join(" · ") })}</UiText> : null}
            {goalLink || valueLine?.meetingCount ? <View style={styles.whyChips}>
              {goalLink ? <Chip label={t("network.detail.planChip", { label: goalLink.label })} tone="lav" /> : null}
              {valueLine?.meetingCount ? <Chip label={t("network.detail.meetingChip", { count: valueLine.meetingCount })} /> : null}
            </View> : null}
          </View>
        ) : null}

        {/* contact-reach: the invite card arrives with its own read; keep it below 「連絡する」 (same order as the Web drawer) so the button never moves. */}
        {reachCard}

        {/* UR-S9：对方共享给人脉的联系方式。每行名称 + 值 + 能做的事；一个都没有时一行说明。 */}
        {/* 样例模式（network）从 fixture 取，不问服务器；不是交换来的人没有这张卡（同 Web networkApi.sharedMethods）。 */}
        {(fixture.enabled ? fixtureShared != null : sharedMethods.kind === "success") ? (
          <View style={[styles.card, styles.gapTop, styles.contactCard]} testID="network-shared-contact-methods">
            <UiText style={[styles.cardTitle, styles.contactTitle]} accessibilityRole="header">{t("network.contactMethods.title")}</UiText>
            <ContactMethodRows methods={fixture.enabled ? fixtureShared : sharedMethods.kind === "success" ? sharedMethods.data : null} />
          </View>
        ) : null}
        {connection ? (
          <View style={[styles.card, styles.gapTop]} testID="network-invite-fields">
            {(["organization", "role", "email", "phone", "offering", "seeking"] as const).map((field) => {
              if (fixture.enabled && contactId === "design-person-032" && field === "email") return null;
              const value = field === "organization" ? contact.organization : field === "role" ? stagedRole : field === "email" ? contact.primaryEmail : field === "phone" ? contact.primaryPhone : field === "offering" ? stagedOffering.join(" · ") : contact.seeking.join(" · ");
              if (!value) return null;
              const paused = connection.pausedFields.includes(field as never);
              return (
                <View key={field} style={styles.frow}>
                  <UiText style={styles.frowKey}>{t(FIELD_COPY[field]!)}</UiText>
                  <UiText style={[styles.frowValue, styles.grow]}>{value}</UiText>
                  <Chip label={paused ? t("network.detail.paused") : t("network.detail.selfChip")} tone={paused ? "apricot" : "teal"} />
                </View>
              );
            })}
            {connection.pausedFields.length ? <UiText style={styles.lbl}>{t("network.detail.pausedHint")}</UiText> : null}
            <View style={styles.frow}>
              <UiText style={styles.frowKey}>{t("network.detail.connectedVia")}</UiText>
              <UiText style={[styles.frowValue, styles.grow]}>{t("network.detail.connectedViaValue", { code: connection.via.code, date: tokyoMonthDay(connection.connectedAt) })}</UiText>
            </View>
          </View>
        ) : null}

        {!connection &&(contact.offering.length || contact.seeking.length) ? (
          <View style={[styles.grid2, styles.gapTop]}>
            {(["offering", "seeking"] as const).map((field) => (
              <View key={field} style={[styles.card, styles.grow]}>
                <UiText style={styles.lbl}>{t(field === "offering" ? "network.detail.offering" : "network.detail.seeking")}</UiText>
                <UiText style={styles.body}>{(field === "offering" ? contact.offering : contact.seeking).join(" · ") || "—"}</UiText>
                {history(field).length ? <PreviousToggle field={field} open={openHistory === field} onToggle={() => setOpenHistory(openHistory === field ? null : field)} entries={history(field)} /> : null}
              </View>
            ))}
          </View>
        ) : null}

        {(["displayName", "organization", "role", "email", "phone"] as const).some((field) => history(field).length) ? (
          <View style={[styles.card, styles.gapTop]} testID="network-previous-values">
            {(["displayName", "organization", "role", "email", "phone"] as const).filter((field) => history(field).length).map((field) => (
              <View key={field}>
                <View style={styles.frow}>
                  <UiText style={styles.frowKey}>{t(FIELD_COPY[field]!)}</UiText>
                  <UiText style={[styles.frowValue, styles.grow]}>{history(field)[0]!.next ?? "—"}</UiText>
                </View>
                <PreviousToggle field={field} open={openHistory === field} onToggle={() => setOpenHistory(openHistory === field ? null : field)} entries={history(field)} />
              </View>
            ))}
          </View>
        ) : null}

        <View style={[styles.card, styles.gapTop]} testID="network-interactions">
          <View style={styles.between}>
            <UiText style={styles.cardH}>{t("network.detail.interactions")}</UiText>
            {timeline.length ? logButton : null}
          </View>
          {timeline.length ? (
            <>
              {timeline.slice(0, 8).map((note) => {
                const row = <>
                  <UiText style={styles.tlTime}>{note.occurredAt ? monthDayOf(timelineDay(note)) : tokyoMonthDay(note.createdAt)}</UiText>
                  <View style={styles.grow}>{note.title ? <UiText style={styles.cardTitle}>{note.title}</UiText> : null}<TimelineBody note={note} /></View>
                  {note.linked ? <Icon name="right" size={16} color={colors.ink3} /> : null}
                </>;
                return note.linked
                  ? <UiPressable key={note.id} accessibilityRole="button" accessibilityLabel={note.title || note.body.slice(0, 40)} onPress={() => router.push(`/notes/${encodeURIComponent(note.id)}` as Href)} style={styles.tl} testID={`network-note-${note.id}`}>{row}</UiPressable>
                  : <View key={note.id} style={styles.tl} testID={`network-timeline-${note.origin}`}>{row}</View>;
              })}
            </>
          ) : (
            <>
              <UiText style={styles.lbl}>{t("network.detail.noInteractions")}</UiText>
              <View style={styles.emptyAdd}><Button variant="secondary" size="sm" label={t("network.log.add")} onPress={() => setLogOpen(true)} /></View>
            </>
          )}
        </View>
      </View>

      <ContactLogSheet visible={logOpen} contact={logTarget} offline={logOffline} onClose={() => setLogOpen(false)} onSaved={logged} />
      <ActionSheet visible={menuOpen} title={contact.displayName} options={menuOptions} onClose={() => setMenuOpen(false)}
        onSelect={(key) => { setMenuOpen(false); if (key === "edit") router.push(`/contacts/edit/${encodeURIComponent(contactId)}` as Href); else if (key === "share") setShareOpen(true); else if (key === "unlink") setUnlinkOpen(true); else if (key === "delete") setDeleteOpen(true); }} />
      <ConfirmDialog visible={deleteOpen} destructive title={t("network.delete.title", { name: contact.displayName })}
        message={t("network.delete.body", { interactions: contact.lastInteraction ? 1 : 0, memos: contact.notes.length })}
        confirmLabel={t("network.delete.confirm")} cancelLabel={t("network.delete.cancel")} onConfirm={() => { setDeleteOpen(false); void deletion.remove(contactId, contact.displayName, now); }} onCancel={() => setDeleteOpen(false)} />
      {connection ? (
        <>
          {shareOpen ? <InviteShareSheet visible={shareOpen} contactId={contactId} name={contact.displayName} onClose={() => setShareOpen(false)} onSaved={setConnection}
            onMerged={(merged) => { setShareOpen(false); router.replace(`/contacts/${encodeURIComponent(merged.contactId)}` as Href); }} /> : null}
          {unlinkOpen ? <InviteUnlinkSheet visible={unlinkOpen} contactId={contactId} name={contact.displayName} onClose={() => setUnlinkOpen(false)} returnFocusTo={menuButtonRef}
            onUnlinked={() => { setUnlinkOpen(false); setConnection(null); local.refresh(); }} /> : null}
        </>
      ) : null}
    </AppScreen>
  );
}

type TimelineNote = DetailContact["notes"][number] & { linked: boolean };
/**
 * 往来：联系人记录里的备忘 + 笔记镜像里关联到这个人的笔记（同一 id 以笔记为准、可点开）。
 * 按交流日期倒序（memo 用所选东京日期，其余用 createdAt 的东京日），同一天按记下的时间倒序。
 */
export function mergeTimelineNotes(recordNotes: DetailContact["notes"], linked: readonly { id: string; title?: string | null; body: string; createdAt: string; noteKind?: string | null; sample?: true }[]): TimelineNote[] {
  const byId = new Map<string, TimelineNote>();
  for (const note of recordNotes) byId.set(note.id, { ...note, linked: false });
  for (const note of linked) {
    if (note.sample) continue;
    const body = note.body.trim(), title = note.title?.trim() ?? "";
    // A note without its own title is named by its first line: show the body once, not the line twice.
    byId.set(note.id, { id: note.id, body, kind: note.noteKind ?? "", createdAt: note.createdAt, title: title && !body.startsWith(title.replace(/…$/u, "")) ? title : "", origin: "user", linked: true });
  }
  return sortTimeline([...byId.values()]);
}

/**
 * 往来 = 记录 + 系统条目，按交流日期排序（同 Web timelineWithSystemEntries）：
 * 「上次互动」摘要与某条记录是同一件事时不重复；系统背景说明一直保留。
 */
export function withSystemEntries(notes: readonly TimelineNote[], lastInteraction: { occurredAt: string; summary: string } | null, generatedInteraction: { occurredAt: string; summary: string } | null): TimelineNote[] {
  const entries: TimelineNote[] = [...notes];
  const candidates: [string, { occurredAt: string; summary: string } | null][] = [["system:last-interaction", lastInteraction], ["system:generated", generatedInteraction]];
  for (const [id, item] of candidates) {
    if (!item || !item.summary.trim() || entries.some((entry) => sameLine(entry.body, item.summary))) continue;
    entries.push({ id, body: item.summary, title: "", kind: "", createdAt: item.occurredAt, origin: "system", linked: false });
  }
  return sortTimeline(entries);
}

/** 「上次互动」的摘要是某条记录正文（或其第一行）时不再单列一行。 */
function sameLine(body: string, summary: string): boolean {
  const first = body.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? "";
  return body === summary || (summary.trim() !== "" && first.startsWith(summary.trim()));
}

const WAY_KEY = { meeting: "network.log.channelMeeting", call: "network.log.channelCall", event: "network.log.channelEvent", other: "network.log.channelOther" } as const;

/** 往来一行的正文：自己记的交流前面是方式标签（lav，补充换行接在下面），名片原文 / 系统说明前面是灰色来源标签。 */
function TimelineBody({ note }: { note: TimelineNote }) {
  const { styles } = useStyles();
  const { t } = useOrbitLocale();
  const textStyle = note.title ? styles.lbl : styles.body;
  const lines = note.linked ? 3 : undefined;
  if (note.origin !== "user") {
    return <UiText style={[textStyle, styles.dim]}><InlineChip label={t(note.origin === "card" ? "network.log.sourceCard" : "network.log.sourceSystem")} />{` ${note.body}`}</UiText>;
  }
  if (!note.channel) return <UiText numberOfLines={lines} style={textStyle}>{note.body}</UiText>;
  const [head = "", ...rest] = note.body.split(/\r?\n/);
  const extra = rest.join("\n").trim();
  return (
    <>
      <UiText numberOfLines={lines} style={textStyle}><InlineChip label={t(WAY_KEY[note.channel])} tone="lav" />{` ${extra ? head : note.body}`}</UiText>
      {extra ? <UiText style={[styles.lbl, styles.dim]}>{extra}</UiText> : null}
    </>
  );
}

function evidenceLabel(label: string, t: ReturnType<typeof useOrbitLocale>["t"]): string {
  if (label === "card") return t("network.detail.evidenceCard");
  if (label === "entry") return t("network.detail.evidenceEntry");
  if (label.startsWith("memo:")) return t("network.detail.evidenceMemo", { title: label.slice(5) });
  if (label.startsWith("need:")) return t("network.detail.evidenceNeed", { title: label.slice(5) });
  return label;
}

function FieldChange({ entry }: { entry: DetailFieldHistoryEntry }) {
  const { styles } = useStyles();
  const { t } = useOrbitLocale();
  const added = entry.field === "offering" || entry.field === "seeking";
  return (
    <View style={styles.frow}>
      <UiText style={styles.frowKey}>{t(FIELD_COPY[INVITE_FIELD_TO_HISTORY[entry.field] ?? "role"] ?? "network.detail.fieldRole")}</UiText>
      <UiText style={[styles.frowValue, styles.grow]}>
        {added ? `＋ ${entry.next ?? ""}` : <><UiText style={styles.strike}>{entry.previous ?? ""}</UiText>{` → ${entry.next ?? ""}`}</>}
      </UiText>
    </View>
  );
}

function PreviousToggle({ field, open, onToggle, entries }: { field: string; open: boolean; onToggle: () => void; entries: DetailFieldHistoryEntry[] }) {
  const { styles, colors } = useStyles();
  const { t } = useOrbitLocale();
  const source = (value: string) => value === "manual" ? t("network.detail.sourceManual") : value.startsWith("invite") ? t("network.detail.sourceInvite") : value === "completion" ? t("network.detail.sourceCompletion") : value;
  return (
    <View testID={`network-previous-${field}`}>
      <UiPressable accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={t("network.detail.previous")} onPress={onToggle} style={styles.rowCenter}>
        <UiText style={styles.more}>{t("network.detail.previous")}</UiText><Icon name={open ? "down" : "right"} size={16} color={colors.ink2} />
      </UiPressable>
      {open ? entries.map((entry) => (
        <View key={`${entry.at}-${entry.previous}`} style={styles.prev}>
          <UiText style={[styles.body, styles.strike]}>{entry.previous}</UiText>
          <UiText style={styles.lbl}>{t("network.detail.previousEntry", { date: tokyoMonthDay(entry.at), source: source(entry.source) })}</UiText>
        </View>
      )) : null}
    </View>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  grow: { flex: 1, minWidth: 0 },
  gapTop: { marginTop: 12 },
  gapSmall: { marginTop: 10, marginBottom: 8 },
  gapBottom: { marginBottom: 12 },
  card: { backgroundColor: colors.surface, borderRadius: 22, padding: 18 },
  // UR-S9 .card.k-sc：padding 6 18 8，标题上 12。
  contactCard: { paddingBottom: 8, paddingTop: 6 },
  contactTitle: { marginTop: 12 },
  head: { alignItems: "center", gap: 6 },
  headPerson: { paddingBottom: 24 },
  headSelf: { paddingBottom: 34 },
  confirm: { borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.plum300, gap: 10, paddingVertical: 14 },
  syncCard: { borderWidth: 1.5, borderColor: colors.plum300, paddingBottom: 24 },
  name: { color: colors.ink, fontSize: 21, fontWeight: "800", marginTop: 6 },
  sub: { color: colors.ink3, fontSize: 15 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, justifyContent: "center", marginTop: 6 },
  actions: { flexDirection: "row", gap: 12, marginTop: 12 },
  actionCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  actionEmpty: { opacity: 0.4 },
  whyCard: { overflow: "hidden" },
  whyBody: { fontSize: 17, lineHeight: 25, fontWeight: "700" },
  whyBone: { height: 25, justifyContent: "center", marginTop: 6 },
  whyBoneBar: { width: "72%", height: 15, borderRadius: 999, backgroundColor: colors.surface2 },
  whyChips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 12 },
  rowCenter: { flexDirection: "row", alignItems: "center", gap: 8 },
  pathBone: { height: 17, alignItems: "center", justifyContent: "center", marginTop: 4 },
  pathBoneBar: { width: "46%", height: 12, borderRadius: 999, backgroundColor: colors.surface2 },
  between: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  emo: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  emoText: { fontSize: 19 },
  cardTitle: { color: colors.ink, fontSize: 17, fontWeight: "700" },
  cardH: { color: colors.ink, fontSize: 17, fontWeight: "800" },
  body: { color: colors.ink, fontSize: 16, lineHeight: 25, marginTop: 6 },
  lbl: { color: colors.ink3, fontSize: 13, fontWeight: "500", marginTop: 4 },
  center: { textAlign: "center" },
  more: { color: colors.ink2, fontSize: 15, fontWeight: "700" },
  grid2: { flexDirection: "row", gap: 10 },
  frow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  frowKey: { color: colors.ink3, fontSize: 14, width: 84 },
  frowValue: { color: colors.ink, fontSize: 16, fontWeight: "600" },
  strike: { textDecorationLine: "line-through", color: colors.ink3 },
  prev: { paddingVertical: 4, paddingLeft: 8 },
  tl: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 8 },
  tlTime: { color: colors.ink3, fontSize: 14, width: 38 },
  dim: { color: colors.ink2 },
  emptyAdd: { alignSelf: "flex-start", marginTop: 12 },
}));
