// R11a 業界・役職層を選ぶ (b5 #43 ②): the bottom sheet the contact edit page opens. 0146: shared with
// 手入力, which asks only the primary industry (`primaryOnly`: no 詳細 list, no 役職層 tab).
import { useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";

import { seniorityGroup, type SeniorityGroup } from "../../api/compute/seniority-group";
import type { IndustryIdCode } from "../../api/contract/industries";
import { INDUSTRY_CATALOG, listSecondaryIndustries } from "../../api/domain/industries";
import { BottomSheet, Button, CategoryTabs, Icon, Segmented, UiPressable, UiText } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";

const GROUP_LEVEL: Record<SeniorityGroup, string | null> = { decision: "c_level", manager: "manager", staff: "individual_contributor", other: null };
export const GROUP_COPY = { decision: "network.edit.seniorityDecision", manager: "network.edit.seniorityManager", staff: "network.edit.seniorityStaff", other: "network.edit.seniorityOther" } as const;

export function IndustryPickerSheet({ visible, onClose, onDone, primary, secondary, seniority, role, primaryOnly = false, title }: {
  visible: boolean; onClose: () => void; role: string;
  primary: string | null; secondary: string | null; seniority: string | null;
  onDone: (next: { primaryIndustryId: string | null; secondaryIndustryId: string | null; seniorityLevel: string | null }) => void;
  /** 0146 手入力: only the primary industry. */
  primaryOnly?: boolean;
  title?: string;
}) {
  const { styles, colors } = useStyles();
  const { t, language } = useOrbitLocale();
  const [tab, setTab] = useState<"industry" | "seniority">("industry");
  const [picked, setPicked] = useState({ primary, secondary, seniority });
  const [query, setQuery] = useState("");
  const industries = INDUSTRY_CATALOG.filter((item) => !query.trim() || item.labels[language].includes(query.trim()));
  const subs = picked.primary && !primaryOnly ? listSecondaryIndustries(picked.primary as IndustryIdCode) : [];
  const sheetTitle = title ?? t("network.edit.pickerTitle");
  return (
    <BottomSheet visible={visible} onClose={onClose} accessibilityLabel={sheetTitle}>
      <View testID="network-industry-picker" style={styles.sheet}>
        <View style={styles.between}>
          <UiText style={styles.sheetTitle}>{sheetTitle}</UiText>
          <Button variant="primary" size="sm" label={t("network.edit.pickerDone")} onPress={() => onDone({ primaryIndustryId: picked.primary, secondaryIndustryId: picked.secondary, seniorityLevel: picked.seniority })} />
        </View>
        {primaryOnly ? null : <Segmented accessibilityLabel={sheetTitle} value={tab} onChange={setTab} segments={[{ key: "industry", label: t("network.edit.pickerIndustry") }, { key: "seniority", label: t("network.edit.pickerSeniority") }]} />}
        {tab === "industry" ? (
          <>
            <TextInput accessibilityLabel={t("network.edit.industrySearch")} value={query} onChangeText={setQuery} placeholder={t("network.edit.industrySearch")} placeholderTextColor={colors.ink3Text} style={styles.search} />
            <CategoryTabs accessibilityLabel={t("network.edit.pickerIndustry")} value={(picked.primary ?? "") as string} onChange={(key) => setPicked({ ...picked, primary: key, secondary: null })}
              options={industries.map((item) => ({ key: item.id as string, label: item.labels[language] }))} />
            {picked.primary && !primaryOnly ? <UiText style={styles.lbl}>{t("network.edit.pickerDetail", { industry: INDUSTRY_CATALOG.find((item) => item.id === picked.primary)?.labels[language] ?? "" })}</UiText> : null}
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
        {picked.seniority && role && !primaryOnly ? <UiText style={styles.lbl}>{t("network.edit.seniorityGuess", { level: t(GROUP_COPY[seniorityGroup(picked.seniority)]), role })}</UiText> : null}
      </View>
    </BottomSheet>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  grow: { flex: 1, minWidth: 0 },
  lbl: { color: colors.ink3, fontSize: 13, fontWeight: "500" },
  pickText: { color: colors.ink, fontSize: 17 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center" },
  sheet: { gap: 12 },
  between: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sheetTitle: { color: colors.ink, fontSize: 18, fontWeight: "800" },
  search: { height: 40, borderRadius: 20, backgroundColor: colors.surface2, paddingHorizontal: 14, color: colors.ink },
  pickRow: { minHeight: 44, borderRadius: 14, backgroundColor: colors.surface2, flexDirection: "row", alignItems: "center", paddingHorizontal: 14 },
  pickRowOn: { backgroundColor: colors.accentSoft },
}));
