// R24 面談を提案 (b4 A2 ①, UI-SPEC 面談を提案): three time options (date + time,
// 30 minutes), then one draft per person. The server answers `kind: "draft"` for
// everyone for now (the in-app request waits for the inbox Sprints), so the sheet
// shows the draft with コピー / メールアプリで開く only — never a send button.
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import type { PlanProposalResult } from "../../api/contract/plan-v2";
import { Avatar, BottomSheet, Button, Chip, IconButton, UiText } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import { radius } from "../../design/tokens";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { usePlanApi } from "./plan-api";
import { newIdempotencyKey } from "./plan-model";
import { defaultProposalSlots, shiftSlot } from "./plan-overview-model";
import { MailDraftView } from "./plan-overview-ui";
import { InlineProblem, useFailureText } from "./plan-ui";

export type ProposalPerson = { contactId: string; name: string; isOrbitUser: boolean };

type Props = {
  visible: boolean;
  onClose: () => void;
  planId: string;
  itemId: string;
  people: readonly ProposalPerson[];
};

export function PlanProposalSheet({ visible, onClose, planId, itemId, people }: Props) {
  const { styles } = useStyles();
  const { t, language } = useOrbitLocale();
  const failureText = useFailureText();
  const api = usePlanApi();
  const [slots, setSlots] = useState<Date[]>(() => defaultProposalSlots(new Date()));
  const [drafts, setDrafts] = useState<Record<string, NonNullable<PlanProposalResult["draft"]>>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setSlots(defaultProposalSlots(new Date()));
    setDrafts({});
    setProblem(null);
  }, [visible]);

  const locale = language === "en" ? "en-US" : language === "zh" ? "zh-CN" : "ja-JP";
  const dayText = (slot: Date) => slot.toLocaleDateString(locale, { day: "numeric", month: "numeric", weekday: "short" });
  const timeText = (slot: Date) => slot.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  const move = (index: number, unit: "day" | "time", delta: -1 | 1) => setSlots((list) => list.map((slot, at) => (at === index ? shiftSlot(slot, unit, delta, new Date()) : slot)));

  const make = async (person: ProposalPerson) => {
    setBusy(person.contactId);
    setProblem(null);
    const result = await api.proposal(planId, itemId, person.contactId, slots.map((slot) => slot.toISOString()), newIdempotencyKey("proposal"));
    setBusy(null);
    if (!result.ok) { setProblem(failureText(result.failure)); return; }
    if (result.data.draft) setDrafts((map) => ({ ...map, [person.contactId]: result.data.draft! }));
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} accessibilityLabel={t("plan.proposal.title")}>
      <View style={styles.body} testID="proposal-sheet">
        <UiText accessibilityRole="header" style={styles.title}>{t("plan.proposal.title")}</UiText>
        <UiText style={styles.note}>{t("plan.proposal.slotsNote")}</UiText>
        {slots.map((slot, index) => {
          const number = index + 1;
          return (
            <View key={index} style={styles.slot}>
              <UiText style={styles.slotLabel}>{t("plan.proposal.slot", { number })}</UiText>
              <View style={styles.stepper}>
                <IconButton icon="left" size={34} soft accessibilityLabel={t("plan.proposal.prevDay", { number })} onPress={() => move(index, "day", -1)} />
                <UiText style={styles.value}>{dayText(slot)}</UiText>
                <IconButton icon="right" size={34} soft accessibilityLabel={t("plan.proposal.nextDay", { number })} onPress={() => move(index, "day", 1)} />
              </View>
              <View style={styles.stepper}>
                <IconButton icon="minus" size={34} soft accessibilityLabel={t("plan.proposal.earlier", { number })} onPress={() => move(index, "time", -1)} />
                <UiText style={styles.value}>{timeText(slot)}</UiText>
                <IconButton icon="plus" size={34} soft accessibilityLabel={t("plan.proposal.later", { number })} onPress={() => move(index, "time", 1)} />
              </View>
            </View>
          );
        })}
        {people.map((person) => {
          const draft = drafts[person.contactId];
          return (
            <View key={person.contactId} style={styles.person}>
              <View style={styles.personHead}>
                <Avatar name={person.name} size="sm" />
                <UiText style={styles.name}>{person.name}</UiText>
                {person.isOrbitUser ? <Chip label={t("plan.type.orbitUser")} tone="teal" /> : null}
              </View>
              <UiText style={styles.note}>{person.isOrbitUser ? t("plan.proposal.orbitUser") : t("plan.proposal.notOrbit")}</UiText>
              {draft ? <MailDraftView to={person.name} subject={draft.subject} body={draft.body} /> : (
                <Button label={t("plan.proposal.make")} accessibilityLabel={t("plan.proposal.makeA11y", { name: person.name })} icon="pen" onPress={() => void make(person)} variant="primary" loading={busy === person.contactId} disabled={busy !== null} />
              )}
            </View>
          );
        })}
        {problem ? <InlineProblem text={problem} /> : null}
      </View>
    </BottomSheet>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  body: { gap: 12, paddingBottom: 8 },
  title: { color: colors.ink, fontSize: 17, fontWeight: "800" },
  note: { color: colors.ink3Text, fontSize: 12, lineHeight: 17 },
  slot: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap", backgroundColor: colors.surface2, borderRadius: radius.md, padding: 8 },
  slotLabel: { color: colors.ink2, fontSize: 12, fontWeight: "700", minWidth: 52 },
  stepper: { flexDirection: "row", alignItems: "center", gap: 4 },
  value: { color: colors.ink, fontSize: 14, fontWeight: "700", minWidth: 64, textAlign: "center" },
  person: { gap: 8, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 12 },
  personHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  name: { color: colors.ink, fontSize: 14, fontWeight: "800" },
}));
