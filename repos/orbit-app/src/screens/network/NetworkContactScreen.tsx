// R11a 連絡先詳細（App; app.html #29, b9 #20 / #21 / #22 招待でつながった人, b5 #42–#44 編集・削除）。
// 头卡（名片式）· 人物タイプの確認カード（fit candidate）· なぜこの人か（value-lines，联网增强）· 次の一手 · 力になれること /
// 求めていること · やりとり。招待でつながった人：本人入力 chip、本人入力的项目、同期停止的项目、⋯ 里的共有 / 解除（R15 sheet）。
// 以前の値（fieldHistory）。顶栏 ⋯：編集 / 共有する項目 / つながりを解除 / 削除。日历键打开 R20a「面談の日程提案」。
// 本机优先：详情读同步镜像，离线照常显示；value-lines / fit / 招待连接是联网增强，失败或「尚未実装」时整块隐藏（G18）。
import { useRouter, type Href } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Linking, StyleSheet, View } from "react-native";

import { whenNotImplemented } from "../../api/compute/not-implemented";
import type { InviteConnectionView } from "../../api/contract/invite-codes";
import type { PlanContactFit } from "../../api/contract/plan-v2";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { AppScreen } from "../../components/AppScreen";
import { ActionSheet, Avatar, Button, Chip, ConfirmDialog, Icon, IconButton, OfflineBar, RetryCard, Skeleton, UiPressable, UiText, useToast } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { useApiResource } from "../../hooks/useApiResource";
import { useLocalContacts } from "../../hooks/useLocalContacts";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { localContactDetail, withLegacyNetworkFields } from "../../view-models/contacts-local";
import { DensityDots } from "../add/add-ui";
import { InviteShareSheet, InviteUnlinkSheet } from "../add/invite/InviteConnectionSheets";
import { useInviteApi } from "../add/invite/invite-api";
import { MeetingProposalSheet } from "../calendar/MeetingProposalSheet";
import { ContactRelationshipInitializer, useContactInitialization } from "../contacts/ContactRelationshipInitializer";
import { NETWORK_CHIP_COPY } from "./NetworkScreen";
import { detailContactFrom, detailHeaderChips, fitCandidate, previousValues, recentSelfUpdates, tokyoMonthDay, type DetailContact, type DetailFieldHistoryEntry } from "./contact-detail-model";
import { useDeleteContact } from "./useDeleteContact";
import { useNetworkMerge } from "./useNetworkMerge";

interface ValueLine { relation?: string | null; evidence?: string[] }

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
  const toast = useToast();
  const auth = useOrbitAuthSession();
  const client = useOrbitApiClient();
  const inviteApi = useInviteApi();
  const local = useLocalContacts();
  const merge = useNetworkMerge();
  const remote = useApiResource<Record<string, unknown>>(`/api/contacts/${encodeURIComponent(contactId)}`, () => false, { scopeKey: contactId, cachePolicy: "network-only", enabled: !local.available });
  const row = useMemo(() => local.rows.find((candidate) => candidate.card?.id === contactId || candidate.id === contactId) ?? null, [local.rows, contactId]);
  const card = row ? withLegacyNetworkFields(row).card : null;
  const contact: DetailContact | null = useMemo(() => {
    if (local.available) return detailContactFrom(localContactDetail(local.rows, contactId));
    return remote.kind === "success" ? detailContactFrom(remote.data) : null;
  }, [local.available, local.rows, contactId, remote]);
  const goalLink = merge.links.get(contactId) ?? null;

  const [valueLine, setValueLine] = useState<ValueLine | null>(null);
  const [fit, setFit] = useState<PlanContactFit | null>(null);
  const [connection, setConnection] = useState<InviteConnectionView | null>(null);
  const [whyOpen, setWhyOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<View>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [unlinkOpen, setUnlinkOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [proposalOpen, setProposalOpen] = useState(false);
  const [openHistory, setOpenHistory] = useState<string | null>(null);
  const [deciding, setDeciding] = useState(false);

  useEffect(() => {
    let live = true;
    const lang = language === "zh" ? "zh" : "en";
    void client.get<{ lines: (ValueLine & { contactId: string })[] }>(`/api/contacts/value-lines?ids=${encodeURIComponent(contactId)}&lang=${lang}`).then((result) => {
      if (!live || whenNotImplemented(result, { use: "hide" }) || !result.success) return;
      setValueLine(result.data.lines.find((line) => line.contactId === contactId) ?? null);
    });
    void client.get<PlanContactFit>(`/api/agent/plans/v2/contacts/${encodeURIComponent(contactId)}/fit`).then((result) => {
      if (live && result.success && Array.isArray(result.data?.fits)) setFit(result.data);
    });
    void inviteApi.connection(contactId).then((result) => {
      if (live && result.ok) setConnection(result.data);
    });
    return () => { live = false; };
  }, [client, inviteApi, contactId, language]);

  const candidate = fitCandidate(fit);
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
    const loading = local.available ? local.freshness.loading : remote.kind === "loading";
    return (
      <AppScreen inset="kit" title="" backAccessibilityLabel={t("network.detail.back")}>
        <View testID="network-contact">
          {loading ? <View style={styles.card}><Skeleton lines={5} /></View> : <RetryCard title={local.available ? t("network.detail.notFound") : t("network.detail.loadFailed")} onRetry={() => (local.available ? local.refresh() : remote.refresh())} />}
        </View>
      </AppScreen>
    );
  }

  const chips = detailHeaderChips(contact, (city) => t(`network.city.${city}`));
  const self = card?.sourceChip === "self" || connection !== null;
  const nextStep = contact.nextAction.trim();
  const selfUpdate = recentSelfUpdates(contact.fieldHistory, now());
  const linkedNotes = [...contact.notes].sort((left, right) => (left.createdAt < right.createdAt ? 1 : -1));
  const openDraft = () => router.push({ pathname: "/ai/[id]", params: { id: "new", prefillIntent: t("network.detail.draftIntent", { name: contact.displayName, step: nextStep }) } } as unknown as Href);
  const menuOptions = [
    { key: "edit", label: t("network.detail.edit") },
    ...(connection ? [{ key: "share", label: t("network.detail.share") }, { key: "unlink", label: t("network.detail.unlink"), destructive: true }] : []),
    { key: "delete", label: t("network.detail.delete"), destructive: true },
  ];
  const history = (field: string) => previousValues(contact.fieldHistory, field);

  return (
    <AppScreen inset="kit" title="" backAccessibilityLabel={t("network.detail.back")}
      headerActions={<IconButton ref={menuButtonRef} icon="more" accessibilityLabel={t("network.detail.more")} onPress={() => setMenuOpen(true)} />}>
      <View testID="network-contact">
        {local.freshness.offline ? <View style={styles.gapBottom}><OfflineBar offline pending={0} /></View> : null}

        <View style={[styles.card, styles.head]} testID="network-contact-head">
          <Avatar name={contact.displayName} size="lg" />
          <UiText style={styles.name}>{contact.displayName}</UiText>
          {[contact.organization, contact.role].filter(Boolean).length ? <UiText style={styles.sub}>{[contact.organization, contact.role].filter(Boolean).join(" · ")}</UiText> : null}
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
              <IconButton icon="mail" accessibilityLabel={t("network.detail.mail")} onPress={() => { if (contact.primaryEmail) void Linking.openURL(`mailto:${contact.primaryEmail}`); }} />
              <IconButton icon="phone" accessibilityLabel={t("network.detail.call")} onPress={() => { if (contact.primaryPhone) void Linking.openURL(`tel:${contact.primaryPhone}`); }} />
              <IconButton icon="calendar" accessibilityLabel={t("network.detail.schedule")} onPress={() => setProposalOpen(true)} />
              <IconButton icon="pen" accessibilityLabel={t("network.detail.edit")} onPress={() => router.push(`/contacts/edit/${encodeURIComponent(contactId)}` as Href)} />
            </View>
          ) : null}
        </View>

        {card?.pendingInitialization && !local.freshness.offline ? <View style={styles.gapTop}><ContactRelationshipInitializer binding={initialization} /></View> : null}

        {candidate ? (
          <View style={[styles.card, styles.confirm, styles.gapTop]} testID="network-fit-card">
            <View style={styles.rowCenter}>
              <View style={[styles.emo, { backgroundColor: colors.macApricot }]}><UiText style={styles.emoText}>{candidate.emoji || "🎯"}</UiText></View>
              <UiText style={[styles.cardTitle, styles.grow]}>{t("network.detail.fitTitle", { label: candidate.shortLabel })}</UiText>
              {candidate.reason ? <IconButton icon="info" accessibilityLabel={t("network.detail.whyBasis", { basis: "" })} onPress={() => setWhyOpen((value) => !value)} /> : null}
            </View>
            {whyOpen && candidate.reason ? <UiText style={styles.lbl}>{t("network.detail.whyBasis", { basis: candidate.reason })}</UiText> : null}
            <View style={styles.rowCenter}>
              <Button variant="primary" size="sm" label={t("network.detail.fitYes")} onPress={() => void decide("accept")} disabled={deciding} />
              <Button variant="secondary" size="sm" label={t("network.detail.fitNo")} onPress={() => void decide("dismiss")} disabled={deciding} />
            </View>
          </View>
        ) : null}

        {selfUpdate ? (
          <View style={[styles.card, styles.gapTop]} testID="network-self-update">
            <View style={styles.rowCenter}>
              <View style={[styles.emo, { backgroundColor: colors.macLav }]}><UiText style={styles.emoText}>🔄</UiText></View>
              <View style={styles.grow}><UiText style={styles.cardTitle}>{t("network.detail.syncTitle", { name: contact.displayName })}</UiText><UiText style={styles.lbl}>{t("network.detail.syncSub", { date: tokyoMonthDay(selfUpdate.at) })}</UiText></View>
            </View>
            {selfUpdate.entries.map((entry) => <FieldChange key={`${entry.field}-${entry.at}`} entry={entry} />)}
            <UiText style={styles.lbl}>{t("network.detail.syncKeep")}</UiText>
          </View>
        ) : null}

        {!self && (valueLine?.relation || goalLink) ? (
          <View style={[styles.card, styles.gapTop]} testID="network-why-card">
            <View style={styles.rowCenter}>
              <View style={[styles.emo, { backgroundColor: colors.macPink }]}><UiText style={styles.emoText}>🎯</UiText></View>
              <UiText style={[styles.cardTitle, styles.grow]}>{t("network.detail.whyTitle", { name: contact.displayName })}</UiText>
              {valueLine?.evidence?.length ? <IconButton icon="info" accessibilityLabel={t("network.detail.whyBasis", { basis: "" })} onPress={() => setWhyOpen((value) => !value)} /> : null}
            </View>
            {valueLine?.relation ? <UiText style={styles.body}>{valueLine.relation}</UiText> : null}
            {whyOpen && valueLine?.evidence?.length ? <UiText style={styles.lbl}>{t("network.detail.whyBasis", { basis: valueLine.evidence.map((label) => evidenceLabel(label, t)).join(" · ") })}</UiText> : null}
            {goalLink ? <View style={styles.chips}><Chip label={t("network.detail.planChip", { label: goalLink.label })} tone="lav" /></View> : null}
          </View>
        ) : null}

        {connection ? (
          <View style={[styles.card, styles.gapTop]} testID="network-invite-fields">
            {(["organization", "role", "email", "offering", "seeking"] as const).map((field) => {
              const value = field === "organization" ? contact.organization : field === "role" ? contact.role : field === "email" ? contact.primaryEmail : field === "offering" ? contact.offering.join(" · ") : contact.seeking.join(" · ");
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

        {nextStep ? (
          <View style={[styles.card, styles.gapTop]} testID="network-next-card">
            <UiText style={styles.lbl}>{t("network.detail.nextTitle")}</UiText>
            <UiText style={styles.cardTitle}>{nextStep}</UiText>
            <View style={styles.gapSmall}><Button variant="primary" block icon="mail" label={t("network.detail.draft")} onPress={openDraft} /></View>
            <UiText style={[styles.lbl, styles.center]}>{t("network.detail.noSend")}</UiText>
          </View>
        ) : null}

        {!connection && (contact.offering.length || contact.seeking.length) ? (
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
            <UiPressable accessibilityRole="button" accessibilityLabel={t("network.detail.addMemo")} onPress={() => router.push(`/notes/new?contactId=${encodeURIComponent(contactId)}` as Href)}>
              <UiText style={styles.more}>{t("network.detail.addMemo")}</UiText>
            </UiPressable>
          </View>
          {linkedNotes.length || contact.lastInteraction ? (
            <>
              {contact.lastInteraction && !linkedNotes.some((note) => note.body === contact.lastInteraction!.summary) ? (
                <View style={styles.tl}><UiText style={styles.tlTime}>{tokyoMonthDay(contact.lastInteraction.occurredAt)}</UiText><UiText style={[styles.body, styles.grow]}>{contact.lastInteraction.summary}</UiText></View>
              ) : null}
              {linkedNotes.slice(0, 8).map((note) => (
                <View key={note.id} style={styles.tl}>
                  <UiText style={styles.tlTime}>{tokyoMonthDay(note.createdAt)}</UiText>
                  <View style={styles.grow}>{note.title ? <UiText style={styles.cardTitle}>{note.title}</UiText> : null}<UiText style={note.title ? styles.lbl : styles.body}>{note.body}</UiText></View>
                </View>
              ))}
            </>
          ) : <UiText style={styles.lbl}>{t("network.detail.noInteractions")}</UiText>}
        </View>
      </View>

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
      {/* R20a 面談の日程提案（D 线交付的组件；R11a 只挂载，见 REPORT 交接）。 */}
      <MeetingProposalSheet open={proposalOpen} contactId={contactId} onClose={() => setProposalOpen(false)} />
    </AppScreen>
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
  head: { alignItems: "center", gap: 6 },
  confirm: { borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.plum300, gap: 10 },
  name: { color: colors.ink, fontSize: 19, fontWeight: "800", marginTop: 6 },
  sub: { color: colors.ink3, fontSize: 12.5 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, justifyContent: "center", marginTop: 6 },
  actions: { flexDirection: "row", gap: 12, marginTop: 12 },
  rowCenter: { flexDirection: "row", alignItems: "center", gap: 8 },
  between: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  emo: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  emoText: { fontSize: 17 },
  cardTitle: { color: colors.ink, fontSize: 14, fontWeight: "700" },
  cardH: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  body: { color: colors.ink, fontSize: 13.5, lineHeight: 21, marginTop: 6 },
  lbl: { color: colors.ink3, fontSize: 11.5, fontWeight: "500", marginTop: 4 },
  center: { textAlign: "center" },
  more: { color: colors.ink2, fontSize: 12.5, fontWeight: "700" },
  grid2: { flexDirection: "row", gap: 10 },
  frow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  frowKey: { color: colors.ink3, fontSize: 12, width: 84 },
  frowValue: { color: colors.ink, fontSize: 13.5, fontWeight: "600" },
  strike: { textDecorationLine: "line-through", color: colors.ink3 },
  prev: { paddingVertical: 4, paddingLeft: 8 },
  tl: { flexDirection: "row", gap: 12, paddingVertical: 8 },
  tlTime: { color: colors.ink3, fontSize: 12, width: 38 },
}));
