// R23 ② メンバーを追加 (bottom sheet, two tabs). 人脈から選ぶ searches the existing
// contacts list; people tagged 共同創業者 come first, then people whose role or tags
// name a gap (「空き：デザイン」); up to 5 at once → POST …/members `mode: network`
// (the server estimates what they can do). 自分で書く needs only a name; it never calls
// AI and adds to 人脈 only when the switch is on → `mode: manual`.
import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";

import type { PlanGoalKind, PlanIntakeMembersRequest, PlanMemberRelation } from "../../api/contract/plan-v2";
import { PLAN_GOAL_TEMPLATES } from "../../api/compute/plan-templates";
import { BottomSheet, Button, Checkbox, FilterOption, SearchField, Segmented, Toggle, UiText } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import type { MessageKey } from "../../i18n/messages";
import { usePlanApi } from "./plan-api";
import { capabilityLabel, newIdempotencyKey, PLAN_NETWORK_ADD_LIMIT, PLAN_RELATIONS, rankCandidates, type ContactCandidate } from "./plan-model";
import { ChoiceChip, InlineProblem, Tag, usePlanStyles } from "./plan-ui";

export const RELATION_KEYS: Record<PlanMemberRelation, MessageKey> = {
  advisor: "plan.relation.advisor",
  cofounder: "plan.relation.cofounder",
  contractor: "plan.relation.contractor",
  employee: "plan.relation.employee",
};

const SEARCH_DEBOUNCE_MS = 300;

type MembersBody = PlanIntakeMembersRequest extends infer Request ? Request extends unknown ? Omit<Request, "idempotencyKey"> : never : never;

type Props = {
  visible: boolean;
  onClose: () => void;
  kind: PlanGoalKind;
  gaps: readonly string[];
  existingContactIds: ReadonlySet<string>;
  onAdd: (body: PlanIntakeMembersRequest) => Promise<boolean>;
  adding: boolean;
};

export function PlanAddMemberSheet({ visible, onClose, kind, gaps, existingContactIds, onAdd, adding }: Props) {
  const shared = usePlanStyles().styles;
  const { styles, colors } = useStyles();
  const { t, language } = useOrbitLocale();
  const api = usePlanApi();
  const [tab, setTab] = useState<"network" | "manual">("network");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ContactCandidate[] | null>(null);
  const [searchFailed, setSearchFailed] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [relation, setRelation] = useState<PlanMemberRelation>("contractor");
  const [capabilities, setCapabilities] = useState<string[]>([]);
  const [others, setOthers] = useState<string[]>([]);
  const [otherText, setOtherText] = useState("");
  const [otherOpen, setOtherOpen] = useState(false);
  const [alsoNetwork, setAlsoNetwork] = useState(false);
  const [failed, setFailed] = useState(false);
  const sequence = useRef(0);
  // The same tap retried after a network problem keeps its key.
  const pending = useRef<{ fingerprint: string; key: string } | null>(null);

  useEffect(() => {
    if (!visible || tab !== "network") return;
    const run = (sequence.current += 1);
    const timer = setTimeout(() => {
      void api.searchContacts(query.trim()).then((result) => {
        if (run !== sequence.current) return;
        setSearchFailed(!result.ok);
        setResults(result.ok ? result.data : []);
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [api, query, tab, visible]);

  useEffect(() => {
    if (visible) return;
    setSelected([]);
    setName("");
    setCapabilities([]);
    setOthers([]);
    setOtherText("");
    setOtherOpen(false);
    setAlsoNetwork(false);
    setFailed(false);
    pending.current = null;
  }, [visible]);

  const ranked = useMemo(() => rankCandidates(results ?? [], gaps, existingContactIds), [existingContactIds, gaps, results]);

  const submit = async (body: MembersBody) => {
    const fingerprint = JSON.stringify(body);
    if (pending.current?.fingerprint !== fingerprint) pending.current = { fingerprint, key: newIdempotencyKey("members") };
    setFailed(false);
    const ok = await onAdd({ ...body, idempotencyKey: pending.current.key } as PlanIntakeMembersRequest);
    if (ok) onClose();
    else setFailed(true);
  };

  const addOther = () => {
    const value = otherText.trim();
    if (value && !others.includes(value)) setOthers([...others, value]);
    setOtherText("");
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} accessibilityLabel={t("plan.member.sheetTitle")}>
      <View style={styles.sheet}>
        <View>
          <UiText accessibilityRole="header" style={shared.heading}>{t("plan.member.sheetTitle")}</UiText>
          <UiText style={shared.caption}>{t("plan.member.sheetNote")}</UiText>
        </View>
        <Segmented accessibilityLabel={t("plan.member.sheetTitle")} onChange={setTab} segments={[{ key: "network", label: t("plan.member.tabNetwork") }, { key: "manual", label: t("plan.member.tabManual") }]} value={tab} />
        {tab === "network" ? (
          <>
            <SearchField accessibilityLabel={t("plan.member.searchPlaceholder")} onChangeText={setQuery} placeholder={t("plan.member.searchPlaceholder")} value={query} />
            <UiText style={shared.caption}>{t("plan.member.candidatesNote")}</UiText>
            {results === null ? <UiText style={shared.caption}>{t("plan.member.searching")}</UiText> : null}
            {searchFailed ? <InlineProblem text={t("plan.member.searchFailed")} /> : null}
            {results !== null && !searchFailed && ranked.length === 0 ? <UiText style={shared.caption}>{t("plan.member.noResults")}</UiText> : null}
            {ranked.map((candidate) => {
              const on = selected.includes(candidate.id);
              const full = !on && selected.length >= PLAN_NETWORK_ADD_LIMIT;
              return (
                <View key={candidate.id} style={[shared.row, styles.candidate]}>
                  <Checkbox
                    accessibilityLabel={candidate.name}
                    checked={on}
                    onChange={(next) => { if (!full || !next) setSelected(next ? [...selected, candidate.id] : selected.filter((id) => id !== candidate.id)); }}
                  />
                  <View style={shared.grow}>
                    <UiText style={shared.title}>{candidate.name}</UiText>
                    <UiText numberOfLines={1} style={shared.caption}>{[candidate.role, candidate.organization].filter(Boolean).join(" · ")}</UiText>
                  </View>
                  {candidate.cofounder ? <Tag label={t("plan.relation.cofounder")} tone="accent" /> : null}
                  {candidate.fills[0] ? <Tag label={t("plan.member.fillsGap", { capability: capabilityLabel(candidate.fills[0], language) })} tone="gap" /> : null}
                </View>
              );
            })}
            {failed ? <InlineProblem text={t("plan.member.addFailed")} /> : null}
            <Button block disabled={selected.length === 0} label={t("plan.member.addCount", { count: selected.length })} loading={adding} onPress={() => void submit({ contactIds: selected, mode: "network" })} variant="primary" />
          </>
        ) : (
          <>
            <UiText style={shared.label}>{t("plan.member.nameLabel")}</UiText>
            <TextInput accessibilityLabel={t("plan.member.nameLabel")} onChangeText={setName} placeholder={t("plan.member.namePlaceholder")} placeholderTextColor={colors.ink3Text} style={shared.input} value={name} />
            <UiText style={shared.label}>{t("plan.member.relationLabel")}</UiText>
            <View accessibilityRole="radiogroup" accessibilityLabel={t("plan.member.relationLabel")} style={shared.wrap}>
              {PLAN_RELATIONS.map((item) => <ChoiceChip key={item} label={t(RELATION_KEYS[item])} selected={relation === item} onPress={() => setRelation(item)} />)}
            </View>
            <UiText style={shared.label}>{t("plan.member.canDoLabel")}</UiText>
            <View style={shared.wrap}>
              {PLAN_GOAL_TEMPLATES[kind].capabilities.map((capability) => (
                <FilterOption key={capability} label={capabilityLabel(capability, language)} selected={capabilities.includes(capability)} onToggle={() => setCapabilities(capabilities.includes(capability) ? capabilities.filter((id) => id !== capability) : [...capabilities, capability])} />
              ))}
              {others.map((other) => <FilterOption key={other} label={other} selected onToggle={() => setOthers(others.filter((item) => item !== other))} />)}
              <FilterOption label={t("plan.member.other")} selected={otherOpen} onToggle={() => setOtherOpen(!otherOpen)} />
            </View>
            {otherOpen ? (
              <View style={shared.row}>
                <TextInput accessibilityLabel={t("plan.member.otherLabel")} onChangeText={setOtherText} onSubmitEditing={addOther} placeholder={t("plan.member.otherLabel")} placeholderTextColor={colors.ink3Text} style={[shared.input, shared.grow]} value={otherText} />
                <Button disabled={!otherText.trim()} label={t("plan.member.otherAdd")} onPress={addOther} size="sm" />
              </View>
            ) : null}
            <View style={shared.row}>
              <View style={shared.grow}>
                <UiText style={shared.title}>{t("plan.member.alsoNetwork")}</UiText>
                <UiText style={shared.caption}>{t("plan.member.alsoNetworkNote")}</UiText>
              </View>
              <Toggle accessibilityLabel={t("plan.member.alsoNetwork")} onValueChange={setAlsoNetwork} value={alsoNetwork} />
            </View>
            {failed ? <InlineProblem text={t("plan.member.addFailed")} /> : null}
            <Button block disabled={!name.trim()} label={t("plan.member.addManual")} loading={adding} onPress={() => void submit({ alsoAddToNetwork: alsoNetwork, capabilities, mode: "manual", name: name.trim(), otherCapabilities: others, relation })} variant="primary" />
          </>
        )}
      </View>
    </BottomSheet>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  sheet: { gap: 12 },
  candidate: { paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.line },
}));
