// R11a 連絡先の編集（App; b5 #42 ① 編集, #43 ② 業界・役職層, #44 ③ 削除の確認）。二級页 /contacts/edit/<id>。
// ✕ · 連絡先の編集 · ✓（保存）。氏名・会社・役職・メール・電話 → PATCH /api/contacts/:id/fields（旧值进「以前の値」）；
// 業界・役職層・段階・タグ → PATCH /api/contacts/:id。段階只有 知り合い / 関係構築（代定 12）。出会った場所只显示。
// 编辑需要联网（离线时 ✓ 不可用并说明）；删除确认后软删，离线进队列（useDeleteContact）。
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";

import { seniorityGroup, type SeniorityGroup } from "../../api/compute/seniority-group";
import type { IndustryIdCode } from "../../api/contract/industries";
import { INDUSTRY_CATALOG, listSecondaryIndustries } from "../../api/domain/industries";
import { meetingNoteValue } from "../../api/compute/contact-source-chip";
import { AppScreen } from "../../components/AppScreen";
import { Avatar, BottomSheet, Button, CategoryTabs, Chip, ConfirmDialog, Icon, OfflineBar, RetryCard, Segmented, Skeleton, TextField, UiPressable, UiText, useToast } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { useApiResource } from "../../hooks/useApiResource";
import { useLocalContacts } from "../../hooks/useLocalContacts";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { localContactDetail } from "../../view-models/contacts-local";
import { detailContactFrom } from "./contact-detail-model";
import { useDeleteContact } from "./useDeleteContact";

const GROUP_LEVEL: Record<SeniorityGroup, string | null> = { decision: "c_level", manager: "manager", staff: "individual_contributor", other: null };
const GROUP_COPY = { decision: "network.edit.seniorityDecision", manager: "network.edit.seniorityManager", staff: "network.edit.seniorityStaff", other: "network.edit.seniorityOther" } as const;

interface Draft {
  displayName: string; organization: string; role: string; email: string; phone: string;
  primaryIndustryId: string | null; secondaryIndustryId: string | null; seniorityLevel: string | null; status: string; tags: string[];
}

export function ContactEditScreen({ contactId, now = () => Date.now() }: { contactId: string; now?: () => number }) {
  const { styles, colors } = useStyles();
  const { t, language } = useOrbitLocale();
  const router = useRouter();
  const toast = useToast();
  const client = useOrbitApiClient();
  const local = useLocalContacts();
  const remote = useApiResource<Record<string, unknown>>(`/api/contacts/${encodeURIComponent(contactId)}`, () => false, { scopeKey: `edit:${contactId}`, cachePolicy: "network-only", enabled: !local.available });
  const contact = useMemo(() => (local.available ? detailContactFrom(localContactDetail(local.rows, contactId)) : remote.kind === "success" ? detailContactFrom(remote.data) : null), [local.available, local.rows, contactId, remote]);
  const initial: Draft | null = useMemo(() => contact ? {
    displayName: contact.displayName, organization: contact.organization, role: contact.role, email: contact.primaryEmail, phone: contact.primaryPhone,
    primaryIndustryId: contact.primaryIndustryId ?? null, secondaryIndustryId: contact.secondaryIndustryId ?? null, seniorityLevel: contact.seniorityLevel ?? null,
    status: contact.status, tags: contact.tags,
  } : null, [contact]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const value = draft ?? initial;
  const [pickerOpen, setPickerOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [saving, setSaving] = useState(false);
  const deletion = useDeleteContact();
  const offline = local.freshness.offline;

  if (!contact || !value || !initial) {
    return (
      <AppScreen inset="kit" title={t("network.edit.title")} backIcon="x" backAccessibilityLabel={t("network.edit.cancel")}>
        <View testID="network-edit">
          {(local.available ? local.freshness.loading : remote.kind === "loading") ? <Skeleton lines={6} /> : <RetryCard title={t("network.detail.notFound")} onRetry={() => (local.available ? local.refresh() : remote.refresh())} />}
        </View>
      </AppScreen>
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
    if (JSON.stringify(value.tags) !== JSON.stringify(initial.tags)) detail.tags = value.tags;
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
    <AppScreen inset="kit" title={t("network.edit.title")} backIcon="x" backAccessibilityLabel={t("network.edit.cancel")}
      headerActions={<UiPressable accessibilityRole="button" accessibilityLabel={t("network.edit.save")} accessibilityState={{ disabled: offline || saving }} disabled={offline || saving} onPress={() => void save()} style={[styles.saveButton, (offline || saving) && styles.disabled]}><Icon name="check" size={20} color={colors.bg} /></UiPressable>}>
      <View testID="network-edit">
        {offline ? <View style={styles.gapBottom}><OfflineBar offline pending={0} /><UiText style={styles.lbl}>{t("network.edit.needsNetwork")}</UiText></View> : null}
        <View style={styles.center}><Avatar name={value.displayName || contact.displayName} size="lg" /></View>
        <View style={styles.form}>
          <TextField label={t("network.edit.name")} value={value.displayName} onChangeText={(text) => set({ displayName: text })} />
          <TextField label={t("network.edit.company")} value={value.organization} onChangeText={(text) => set({ organization: text })} />
          <TextField label={t("network.edit.role")} value={value.role} onChangeText={(text) => set({ role: text })} />
          <View style={styles.fld}>
            <UiText style={styles.fieldLabel}>{t("network.edit.industrySeniority")}</UiText>
            <UiPressable accessibilityRole="button" accessibilityLabel={t("network.edit.industrySeniority")} onPress={() => setPickerOpen(true)} style={styles.pick} testID="network-edit-industry">
              <UiText style={[styles.pickText, styles.grow]} numberOfLines={1}>{pickLine}</UiText><Icon name="right" size={16} color={colors.ink3} />
            </UiPressable>
          </View>
          <View style={styles.fld}>
            <UiText style={styles.fieldLabel}>{t("network.edit.stage")}</UiText>
            <Segmented accessibilityLabel={t("network.edit.stage")} value={value.status === "nurture" ? "nurture" : "active"} onChange={(status) => set({ status })}
              segments={[{ key: "active", label: t("network.stageActive") }, { key: "nurture", label: t("network.stageNurture") }]} />
          </View>
          <TextField label={t("network.edit.email")} value={value.email} onChangeText={(text) => set({ email: text })} keyboardType="email-address" autoCapitalize="none" />
          <TextField label={t("network.edit.phone")} value={value.phone} onChangeText={(text) => set({ phone: text })} keyboardType="phone-pad" />
          <View style={styles.fld}>
            <UiText style={styles.fieldLabel}>{t("network.edit.met")}</UiText>
            <View style={styles.pick}><UiText style={styles.pickText}>{met ?? t("network.edit.metUnknown")}</UiText></View>
          </View>
          <View style={styles.fld}>
            <UiText style={styles.fieldLabel}>{t("network.edit.tags")}</UiText>
            <View style={styles.chips}>
              {value.tags.map((tag) => (
                <UiPressable key={tag} accessibilityRole="button" accessibilityLabel={tag} onPress={() => set({ tags: value.tags.filter((item) => item !== tag) })}><Chip label={tag} tone="lav" /></UiPressable>
              ))}
              <TextInput accessibilityLabel={t("network.edit.tagPlaceholder")} value={tagInput} onChangeText={setTagInput} placeholder={t("network.edit.addTag")} placeholderTextColor={colors.ink3Text}
                onSubmitEditing={() => { const tag = tagInput.trim(); if (tag && !value.tags.includes(tag)) set({ tags: [...value.tags, tag] }); setTagInput(""); }} style={styles.tagInput} />
            </View>
          </View>
        </View>
        <View style={styles.deleteRow}><Button variant="dangerGhost" block icon="x" label={t("network.edit.delete")} onPress={() => setDeleteOpen(true)} /></View>
      </View>
      <IndustryPickerSheet visible={pickerOpen} onClose={() => setPickerOpen(false)} role={value.role}
        primary={value.primaryIndustryId} secondary={value.secondaryIndustryId} seniority={value.seniorityLevel}
        onDone={(next) => { set(next); setPickerOpen(false); }} />
      <ConfirmDialog visible={deleteOpen} destructive title={t("network.delete.title", { name: contact.displayName })}
        message={t("network.delete.body", { interactions: contact.lastInteraction ? 1 : 0, memos: contact.notes.length })}
        confirmLabel={t("network.delete.confirm")} cancelLabel={t("network.delete.cancel")}
        onConfirm={() => { setDeleteOpen(false); void deletion.remove(contactId, contact.displayName, now); }} onCancel={() => setDeleteOpen(false)} />
    </AppScreen>
  );
}

function IndustryPickerSheet({ visible, onClose, onDone, primary, secondary, seniority, role }: {
  visible: boolean; onClose: () => void; role: string;
  primary: string | null; secondary: string | null; seniority: string | null;
  onDone: (next: { primaryIndustryId: string | null; secondaryIndustryId: string | null; seniorityLevel: string | null }) => void;
}) {
  const { styles, colors } = useStyles();
  const { t, language } = useOrbitLocale();
  const [tab, setTab] = useState<"industry" | "seniority">("industry");
  const [picked, setPicked] = useState({ primary, secondary, seniority });
  const [query, setQuery] = useState("");
  const industries = INDUSTRY_CATALOG.filter((item) => !query.trim() || item.labels[language].includes(query.trim()));
  const subs = picked.primary ? listSecondaryIndustries(picked.primary as IndustryIdCode) : [];
  return (
    <BottomSheet visible={visible} onClose={onClose} accessibilityLabel={t("network.edit.pickerTitle")}>
      <View testID="network-industry-picker" style={styles.sheet}>
        <View style={styles.between}>
          <UiText style={styles.sheetTitle}>{t("network.edit.pickerTitle")}</UiText>
          <Button variant="primary" size="sm" label={t("network.edit.pickerDone")} onPress={() => onDone({ primaryIndustryId: picked.primary, secondaryIndustryId: picked.secondary, seniorityLevel: picked.seniority })} />
        </View>
        <Segmented accessibilityLabel={t("network.edit.pickerTitle")} value={tab} onChange={setTab} segments={[{ key: "industry", label: t("network.edit.pickerIndustry") }, { key: "seniority", label: t("network.edit.pickerSeniority") }]} />
        {tab === "industry" ? (
          <>
            <TextInput accessibilityLabel={t("network.edit.industrySearch")} value={query} onChangeText={setQuery} placeholder={t("network.edit.industrySearch")} placeholderTextColor={colors.ink3Text} style={styles.search} />
            <CategoryTabs accessibilityLabel={t("network.edit.pickerIndustry")} value={(picked.primary ?? "") as string} onChange={(key) => setPicked({ ...picked, primary: key, secondary: null })}
              options={industries.map((item) => ({ key: item.id as string, label: item.labels[language] }))} />
            {picked.primary ? <UiText style={styles.lbl}>{t("network.edit.pickerDetail", { industry: INDUSTRY_CATALOG.find((item) => item.id === picked.primary)?.labels[language] ?? "" })}</UiText> : null}
            {subs.map((item) => {
              const on = picked.secondary === item.id;
              return (
                <UiPressable key={item.id} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={item.labels[language]} onPress={() => setPicked({ ...picked, secondary: item.id })} style={[styles.pickRow, on && styles.pickRowOn]}>
                  <UiText style={[styles.pickText, styles.grow]}>{item.labels[language]}</UiText>{on ? <Icon name="check" size={16} color={colors.plum700} /> : null}
                </UiPressable>
              );
            })}
          </>
        ) : (
          <View style={styles.chips}>
            {(["decision", "manager", "staff", "other"] as const).map((key) => {
              const on = seniorityGroup(picked.seniority) === key && (key !== "other" || picked.seniority === null);
              return <UiPressable key={key} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={t(GROUP_COPY[key])} onPress={() => setPicked({ ...picked, seniority: GROUP_LEVEL[key] })} style={[styles.pickRow, on && styles.pickRowOn]}><UiText style={styles.pickText}>{t(GROUP_COPY[key])}</UiText></UiPressable>;
            })}
          </View>
        )}
        {picked.seniority && role ? <UiText style={styles.lbl}>{t("network.edit.seniorityGuess", { level: t(GROUP_COPY[seniorityGroup(picked.seniority)]), role })}</UiText> : null}
      </View>
    </BottomSheet>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  grow: { flex: 1, minWidth: 0 },
  gapBottom: { marginBottom: 12, gap: 6 },
  center: { alignItems: "center", marginBottom: 12 },
  form: { gap: 12 },
  fld: { gap: 6 },
  lbl: { color: colors.ink3, fontSize: 11.5, fontWeight: "500" },
  // Same as the TextField label above the text fields (picker / segmented / tag rows read as one form).
  fieldLabel: { color: colors.ink2, fontSize: 12, fontWeight: "700" },
  pick: { minHeight: 44, borderRadius: 14, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", paddingHorizontal: 14, gap: 8 },
  pickText: { color: colors.ink, fontSize: 14 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center" },
  tagInput: { minWidth: 80, color: colors.ink, fontSize: 12.5, paddingVertical: 4 },
  deleteRow: { marginTop: 22 },
  saveButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" },
  disabled: { opacity: 0.4 },
  sheet: { gap: 12 },
  between: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sheetTitle: { color: colors.ink, fontSize: 16, fontWeight: "800" },
  search: { height: 40, borderRadius: 20, backgroundColor: colors.surface2, paddingHorizontal: 14, color: colors.ink },
  pickRow: { minHeight: 44, borderRadius: 14, backgroundColor: colors.surface2, flexDirection: "row", alignItems: "center", paddingHorizontal: 14 },
  pickRowOn: { backgroundColor: colors.accentSoft },
}));
