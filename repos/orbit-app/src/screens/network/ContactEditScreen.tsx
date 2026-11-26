// R11a 連絡先の編集（App; b5 #42 ① 編集, #43 ② 業界・役職層, #44 ③ 削除の確認）。二級页 /contacts/edit/<id>。
// ✕ · 連絡先の編集；「保存」在底部（UR-E，2026-11-27 起不再是右上 ✓）。氏名・会社・役職・メール・電話 → PATCH /api/contacts/:id/fields（旧值进「以前の値」）；
// 業界・役職層・段階・タグ → PATCH /api/contacts/:id。段階只有 知り合い / 関係構築（代定 12）。出会った場所只显示。
// 编辑需要联网（离线时「保存」不可用并说明）；删除确认后软删，离线进队列（useDeleteContact）。
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";

import { seniorityGroup } from "../../api/compute/seniority-group";
import type { IndustryIdCode } from "../../api/contract/industries";
import { INDUSTRY_CATALOG, listSecondaryIndustries } from "../../api/domain/industries";
import { meetingNoteValue } from "../../api/compute/contact-source-chip";
import { mergeEditedContactTags, userFacingContactTags } from "../../api/compute/contact-tags";
import { FormScreen } from "../../components/FormScreen";
import { Avatar, Chip, ConfirmDialog, Icon, OfflineBar, RetryCard, Segmented, Skeleton, TextField, UiPressable, UiText, useToast } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { useApiResource } from "../../hooks/useApiResource";
import { useLocalContacts } from "../../hooks/useLocalContacts";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { localContactDetail } from "../../view-models/contacts-local";
import { detailContactFrom, localizedMeetingValue } from "./contact-detail-model";
import { GROUP_COPY, IndustryPickerSheet } from "./IndustryPickerSheet";
import { useDeleteContact } from "./useDeleteContact";
import { useNetworkDesignContacts } from "./network-design-fixture";

interface Draft {
  displayName: string; organization: string; role: string; email: string; phone: string;
  primaryIndustryId: string | null; secondaryIndustryId: string | null; seniorityLevel: string | null; status: string; tags: string[];
}

export function ContactEditScreen({ contactId, now = () => Date.now() }: { contactId: string; now?: () => number }) {
  const { styles, colors } = useStyles();
  const { t, language } = useOrbitLocale();
  const router = useRouter();
  const params = useLocalSearchParams<{ design?: string | string[] }>();
  const toast = useToast();
  const client = useOrbitApiClient();
  const local = useLocalContacts();
  const fixture = useNetworkDesignContacts();
  const localRows = fixture.enabled ? fixture.data?.rows ?? [] : local.rows;
  const remote = useApiResource<Record<string, unknown>>(`/api/contacts/${encodeURIComponent(contactId)}`, () => false, { scopeKey: `edit:${contactId}`, cachePolicy: "network-only", enabled: !fixture.enabled && !local.available });
  const contact = useMemo(() => (fixture.enabled || local.available ? detailContactFrom(localContactDetail(localRows, contactId)) : remote.kind === "success" ? detailContactFrom(remote.data) : null), [fixture.enabled, local.available, localRows, contactId, remote]);
  const initial: Draft | null = useMemo(() => contact ? {
    displayName: contact.displayName, organization: contact.organization, role: contact.role, email: contact.primaryEmail, phone: contact.primaryPhone,
    primaryIndustryId: contact.primaryIndustryId ?? null, secondaryIndustryId: contact.secondaryIndustryId ?? null, seniorityLevel: contact.seniorityLevel ?? null,
    status: contact.status, tags: userFacingContactTags(contact.tags),
  } : null, [contact]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const value = draft ?? initial;
  const [pickerOpen, setPickerOpen] = useState(fixture.enabled && params.design === "industry");
  const [deleteOpen, setDeleteOpen] = useState(fixture.enabled && params.design === "delete");
  const [tagInput, setTagInput] = useState("");
  const [saving, setSaving] = useState(false);
  const deletion = useDeleteContact();
  const offline = fixture.enabled ? fixture.offline : local.freshness.offline;

  if (!contact || !value || !initial) {
    return (
      <FormScreen title={t("network.edit.title")} cancelLabel={t("network.edit.cancel")} saveLabel={t("network.edit.save")} onCancel={() => router.back()} onSave={() => undefined} saveDisabled>
        <View testID="network-edit">
          {(fixture.enabled ? fixture.loading : local.available ? local.freshness.loading : remote.kind === "loading") ? <Skeleton lines={6} /> : <RetryCard title={t("network.detail.notFound")} onRetry={() => (fixture.enabled ? fixture.refresh() : local.available ? local.refresh() : remote.refresh())} />}
        </View>
      </FormScreen>
    );
  }
  const set = (patch: Partial<Draft>) => setDraft({ ...value, ...patch });
  const industryLine = [
    value.primaryIndustryId ? INDUSTRY_CATALOG.find((item) => item.id === value.primaryIndustryId)?.labels[language] : null,
    value.secondaryIndustryId ? listSecondaryIndustries(value.primaryIndustryId as IndustryIdCode).find((item) => item.id === value.secondaryIndustryId)?.labels[language] : null,
  ].filter(Boolean).join(" › ");
  const group = seniorityGroup(value.seniorityLevel);
  const pickLine = [industryLine || t("network.edit.industryUnset"), value.seniorityLevel ? t(GROUP_COPY[group]) : null].filter(Boolean).join(" · ");
  const met = meetingNoteValue(contact.cardNotes ?? null);

  const save = async () => {
    if (saving || offline) return;
    setSaving(true);
    const fields: Record<string, string | null> = {};
    for (const key of ["displayName", "organization", "role", "email", "phone"] as const) {
      if (value[key].trim() !== initial[key].trim()) fields[key] = value[key].trim() || (key === "displayName" ? value[key] : null);
    }
    const detail: Record<string, unknown> = {};
    if (value.primaryIndustryId !== initial.primaryIndustryId || value.secondaryIndustryId !== initial.secondaryIndustryId) {
      detail.primaryIndustryId = value.primaryIndustryId; detail.secondaryIndustryId = value.secondaryIndustryId;
    }
    if (value.seniorityLevel !== initial.seniorityLevel) detail.seniorityLevel = value.seniorityLevel;
    if (value.status !== initial.status) detail.status = value.status;
    if (JSON.stringify(value.tags) !== JSON.stringify(initial.tags)) detail.tags = mergeEditedContactTags(contact.tags, value.tags);
    const results = await Promise.all([
      Object.keys(fields).length ? client.patch(`/api/contacts/${encodeURIComponent(contactId)}/fields`, { body: { values: fields } }) : Promise.resolve({ success: true as const }),
      Object.keys(detail).length ? client.patch(`/api/contacts/${encodeURIComponent(contactId)}`, { body: detail }) : Promise.resolve({ success: true as const }),
    ]);
    setSaving(false);
    if (results.every((result) => result.success)) {
      toast.success(t("network.edit.saved"));
      local.refresh();
      router.back();
    } else toast.error(t("network.edit.saveFailed"));
  };

  return (
    <FormScreen title={t("network.edit.title")} cancelLabel={t("network.edit.cancel")} saveLabel={t("network.edit.save")} onCancel={() => router.back()}
      onSave={() => void save()} saveDisabled={offline || saving}>
      <View testID="network-edit">
        {offline ? <View style={styles.gapBottom}><OfflineBar offline pending={0} /><UiText style={styles.lbl}>{t("network.edit.needsNetwork")}</UiText></View> : null}
        {/* UR-E4/E5：头像在左；三组卡（基本情報 / 分類 / 連絡先），卡内栏位浅灰底；删除在最下面整行，先确认。 */}
        <View style={styles.head}><Avatar name={value.displayName || contact.displayName} size="lg" /></View>
        <View style={styles.card} testID="network-edit-basic">
          <UiText style={styles.cardTitle} accessibilityRole="header">{t("network.edit.groupBasic")}</UiText>
          <TextField onCard label={t("network.edit.name")} value={value.displayName} onChangeText={(text) => set({ displayName: text })} />
          <TextField onCard label={t("network.edit.company")} value={value.organization} onChangeText={(text) => set({ organization: text })} />
          <TextField onCard label={t("network.edit.role")} value={value.role} onChangeText={(text) => set({ role: text })} />
        </View>
        <View style={styles.card} testID="network-edit-class">
          <UiText style={styles.cardTitle} accessibilityRole="header">{t("network.edit.groupClass")}</UiText>
          <View style={styles.fld}>
            <UiText style={styles.fieldLabel}>{t("network.edit.industrySeniority")}</UiText>
            <UiPressable accessibilityRole="button" accessibilityLabel={t("network.edit.industrySeniority")} onPress={() => setPickerOpen(true)} style={styles.pick} testID="network-edit-industry">
              <UiText style={[styles.pickText, styles.grow]} numberOfLines={1}>{pickLine}</UiText><Icon name="down" size={16} color={colors.ink3} />
            </UiPressable>
          </View>
          <View style={styles.fld}>
            <UiText style={styles.fieldLabel}>{t("network.edit.stage")}</UiText>
            <Segmented accessibilityLabel={t("network.edit.stage")} value={value.status === "nurture" ? "nurture" : "active"} onChange={(status) => set({ status })}
              segments={[{ key: "active", label: t("network.stageActive") }, { key: "nurture", label: t("network.stageNurture") }]} />
          </View>
          <View style={styles.fld}>
            <UiText style={styles.fieldLabel}>{t("network.edit.tags")}</UiText>
            <View style={styles.chips}>
              {value.tags.map((tag) => (
                <UiPressable key={tag} accessibilityRole="button" accessibilityLabel={tag} onPress={() => set({ tags: value.tags.filter((item) => item !== tag) })}><Chip label={tag} tone="lav" /></UiPressable>
              ))}
              <TextInput accessibilityLabel={t("network.edit.tagPlaceholder")} value={tagInput} onChangeText={setTagInput} placeholder={t("network.edit.addTag")} placeholderTextColor={colors.ink3Text}
                onSubmitEditing={() => { const tag = tagInput.trim(); if (tag && !value.tags.includes(tag) && userFacingContactTags([tag]).length) set({ tags: [...value.tags, tag] }); setTagInput(""); }} style={styles.tagInput} />
            </View>
          </View>
        </View>
        <View style={styles.card} testID="network-edit-contact">
          <UiText style={styles.cardTitle} accessibilityRole="header">{t("network.edit.groupContact")}</UiText>
          <TextField onCard label={t("network.edit.email")} value={value.email} onChangeText={(text) => set({ email: text })} keyboardType="email-address" autoCapitalize="none" />
          <TextField onCard label={t("network.edit.phone")} value={value.phone} onChangeText={(text) => set({ phone: text })} keyboardType="phone-pad" />
          {/* QA-C / UR-E：出会った場所只读，写成一行文字（来自名片备注），只在知道时显示。 */}
          {met ? (
            <View style={[styles.row, styles.met]}>
              <Icon name="pin" size={16} color={colors.ink3} />
              <UiText style={[styles.metText, styles.grow]}>{`${t("network.edit.met")}：${localizedMeetingValue(met, { intro: t("network.metReferral"), formerColleague: t("add.completion.optionFormerColleague"), forgot: t("add.completion.optionUnknown") })}`}</UiText>
            </View>
          ) : null}
        </View>
        <UiPressable accessibilityRole="button" accessibilityLabel={t("network.edit.delete")} onPress={() => setDeleteOpen(true)} style={styles.deleteRow} testID="network-edit-delete">
          <Icon name="x" size={16} color={colors.coralText} />
          <UiText style={styles.deleteText}>{t("network.edit.delete")}</UiText>
        </UiPressable>
      </View>
      <IndustryPickerSheet visible={pickerOpen} onClose={() => setPickerOpen(false)} role={value.role}
        primary={value.primaryIndustryId} secondary={value.secondaryIndustryId} seniority={value.seniorityLevel}
        onDone={(next) => { set(next); setPickerOpen(false); }} />
      <ConfirmDialog visible={deleteOpen} destructive title={t("network.delete.title", { name: contact.displayName })}
        message={t("network.delete.body", { interactions: contact.lastInteraction ? 1 : 0, memos: contact.notes.length })}
        confirmLabel={t("network.delete.confirm")} cancelLabel={t("network.delete.cancel")}
        onConfirm={() => { setDeleteOpen(false); void deletion.remove(contactId, contact.displayName, now); }} onCancel={() => setDeleteOpen(false)} />
    </FormScreen>
  );
}

// UR-E（b5 E2 App 版 + 手机画板 E4–E6）：三组卡 .card（白、圆角 22、padding 18、gap 12）；卡内栏位 48 高浅灰底；
// 删除整行 48 高、珊瑚色文字、虚线框。字号按 UX-1 App 档。
const useStyles = createThemedStyles((colors) => StyleSheet.create({
  grow: { flex: 1, minWidth: 0 },
  row: { alignItems: "center", flexDirection: "row", gap: 8 },
  gapBottom: { marginBottom: 12, gap: 6 },
  head: { alignItems: "flex-start", marginBottom: 12 },
  card: { backgroundColor: colors.surface, borderRadius: 22, gap: 12, marginBottom: 12, padding: 18 },
  cardTitle: { color: colors.ink, fontSize: 15, fontWeight: "800", lineHeight: 22 },
  fld: { gap: 6 },
  lbl: { color: colors.ink3, fontSize: 13, fontWeight: "500" },
  // Same as the TextField label above the text fields (picker / segmented / tag rows read as one form).
  fieldLabel: { color: colors.ink2, fontSize: 14, fontWeight: "700" },
  pick: { minHeight: 48, borderRadius: 14, backgroundColor: colors.surface2, flexDirection: "row", alignItems: "center", paddingHorizontal: 14, gap: 8 },
  pickText: { color: colors.ink, fontSize: 17 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center" },
  tagInput: { minWidth: 80, color: colors.ink, fontSize: 15, paddingVertical: 4 },
  met: { paddingTop: 2 },
  metText: { color: colors.ink2, fontSize: 15, fontWeight: "600", lineHeight: 22 },
  deleteRow: { alignItems: "center", borderColor: colors.line, borderRadius: 14, borderStyle: "dashed", borderWidth: 1.5, flexDirection: "row", gap: 6, height: 48, justifyContent: "center", marginTop: 4 },
  deleteText: { color: colors.coralText, fontSize: 15, fontWeight: "700", lineHeight: 22 },
}));
