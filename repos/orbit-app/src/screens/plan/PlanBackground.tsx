// R23 ② 背景確認: わたし → チーム → 目的, confirmed in order. The current block is
// open (「確認中」), confirmed blocks fold to one line with ✎ (only while the status is
// still `background`), later blocks are dashed with the AI's 「下書き：…」. Ticking a
// capability, switching 一人 / チーム or picking a rung never sends anything; the
// requests are the block confirmations (PATCH), members (POST …/members), the
// ladder (only when やりたいこと changed) and the questions.
import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";

import type { PlanGoalKind, PlanIntakeView, PlanStance, PlanTeamMember } from "../../api/contract/plan-v2";
import { PLAN_GOAL_KIND_COPY, planCopy } from "../../api/compute/plan-template-copy";
import { PLAN_GOAL_TEMPLATES } from "../../api/compute/plan-templates";
import { Avatar, Icon, UiPressable, UiText } from "../../components/ui";
import { avatarTone } from "../../components/ui/Avatar";
import { createThemedStyles } from "../../design/theme";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import type { MessageKey } from "../../i18n/messages";
import type { PlanApi, PlanFailure } from "./plan-api";
import {
  activeMembers,
  capabilityLabel,
  currentBlock,
  mergeTeamDraft,
  newIdempotencyKey,
  PLAN_STANCES,
  teamDraftOf,
  teamGaps,
  toggleCapability,
  type BackgroundBlock,
  type TeamMemberDraft,
} from "./plan-model";
import { PlanAddMemberSheet } from "./PlanAddMemberSheet";
import { FailureNote, LimitNote } from "./plan-ui";
import { KitButton, KitChip, KitEmo, kitText, useKitStyles, useKitWhy } from "./plan-kit";
import { BlockSection, BlockStack, Bubble, FieldLabel, FlowFoot, FootButton, Fopt, FoptRow, GhostRow, SegFull, StairRow } from "./plan-flow-kit";

export const STANCE_KEYS: Record<PlanStance, MessageKey> = {
  cofounder: "plan.stance.cofounder",
  employee: "plan.stance.employee",
  individual: "plan.stance.individual",
  owner: "plan.stance.owner",
};

const SOURCE_KEYS: Record<PlanTeamMember["source"], MessageKey> = {
  manual: "plan.member.sourceManual",
  network: "plan.member.sourceNetwork",
  profile: "plan.member.sourceProfile",
};

type Props = {
  intake: PlanIntakeView;
  kind: PlanGoalKind;
  api: PlanApi;
  onIntake: (intake: PlanIntakeView) => void;
  onReload: () => void;
};

export function PlanBackground({ intake, kind, api, onIntake, onReload }: Props) {
  const { styles, colors } = useStyles();
  const kit = useKitStyles().styles;
  const { t, language } = useOrbitLocale();
  const { me, team, purpose } = intake.background;
  const locked = intake.status !== "background";
  const [editing, setEditing] = useState<BackgroundBlock | null>(null);
  const [stance, setStance] = useState<PlanStance | null>(me.value.stance);
  const [wants, setWants] = useState(me.value.wants);
  const [mode, setMode] = useState<"solo" | "team">(team.value.mode);
  const [teamDraft, setTeamDraft] = useState<Record<string, TeamMemberDraft>>(() => teamDraftOf(team.value.members));
  const [level, setLevel] = useState<number | null>(purpose.value.selectedLevel ?? purpose.value.suggestedLevel);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<PlanFailure | null>(null);
  const [adding, setAdding] = useState(false);
  const seen = useRef(intake.updatedAt);

  // A new answer from the server (ours or another device's) resets the local fields;
  // capability ticks of people already in the team are kept (members added meanwhile).
  useEffect(() => {
    if (seen.current === intake.updatedAt) return;
    seen.current = intake.updatedAt;
    setStance(me.value.stance);
    setWants(me.value.wants);
    setMode(team.value.mode);
    setTeamDraft((previous) => mergeTeamDraft(previous, team.value.members));
    setLevel(purpose.value.selectedLevel ?? purpose.value.suggestedLevel);
  }, [intake.updatedAt, me.value.stance, me.value.wants, purpose.value.selectedLevel, purpose.value.suggestedLevel, team.value.members, team.value.mode]);

  const members = team.value.members;
  const shown = activeMembers(mode, members);
  const gaps = useMemo(() => teamGaps(kind, mode, members, teamDraft), [kind, members, mode, teamDraft]);
  const active = locked ? null : editing ?? currentBlock(intake);
  const allConfirmed = !currentBlock(intake) && editing === null;

  async function step(name: string, action: () => Promise<{ ok: true; data: PlanIntakeView } | { ok: false; failure: PlanFailure }>): Promise<boolean> {
    setBusy(name);
    setFailure(null);
    const result = await action();
    setBusy(null);
    if (!result.ok) {
      setFailure(result.failure);
      return false;
    }
    onIntake(result.data);
    return true;
  }

  const confirmMe = async () => {
    if (!stance) return;
    const nextWants = wants.trim() || me.value.wants;
    let expectedUpdatedAt = intake.updatedAt;
    setBusy("me");
    setFailure(null);
    // 「やりたいこと」 changed → rebuild the ladder first (light AI, not counted); its fallback stays quiet.
    if (nextWants !== me.value.wants && intake.limits.ladderLeft > 0) {
      const ladder = await api.ladder(intake.intakeId, nextWants, newIdempotencyKey("ladder"));
      if (ladder.ok) {
        onIntake(ladder.data);
        expectedUpdatedAt = ladder.data.updatedAt;
      } else if (ladder.failure.kind === "network" || ladder.failure.kind === "stale") {
        setBusy(null);
        setFailure(ladder.failure);
        return;
      }
    }
    const done = await step("me", () => api.confirmBlock(intake.intakeId, { block: "me", expectedUpdatedAt, idempotencyKey: newIdempotencyKey("me"), me: { stance, wants: nextWants } }));
    if (done) setEditing(null);
  };

  const confirmTeam = async () => {
    const done = await step("team", () => api.confirmBlock(intake.intakeId, {
      block: "team",
      expectedUpdatedAt: intake.updatedAt,
      idempotencyKey: newIdempotencyKey("team"),
      team: {
        members: shown.map((member) => {
          const draft = teamDraft[member.memberId];
          return { capabilities: [...(draft?.capabilities ?? member.capabilities)], memberId: member.memberId, otherCapabilities: [...(draft?.otherCapabilities ?? member.otherCapabilities)], relation: member.isSelf ? null : draft?.relation ?? member.relation };
        }),
        mode,
      },
    }));
    if (done) setEditing(null);
  };

  const toQuestions = () => void step("questions", () => api.questions(intake.intakeId, newIdempotencyKey("questions")));
  /** b10 ⑥：目的が最後の块なので、確定と「質問へ」を 1 つの主按钮で（直す時は確定だけ）。 */
  const confirmPurposeThen = async () => {
    if (level === null) return;
    const again = Boolean(purpose.confirmedAt) || editing === "purpose";
    const result = await (async () => {
      setBusy("purpose");
      setFailure(null);
      const done = await api.confirmBlock(intake.intakeId, { block: "purpose", expectedUpdatedAt: intake.updatedAt, idempotencyKey: newIdempotencyKey("purpose"), purpose: { selectedLevel: level } });
      setBusy(null);
      return done;
    })();
    if (!result.ok) return setFailure(result.failure);
    onIntake(result.data);
    setEditing(null);
    if (!again && !currentBlock(result.data)) void step("questions", () => api.questions(result.data.intakeId, newIdempotencyKey("questions")));
  };

  const backgroundStep = intake.aiSteps.background;
  const gapNames = (list: readonly string[]) => {
    const names = list.slice(0, 2).map((capability) => capabilityLabel(capability, language)).join(t("plan.team.gapJoin"));
    return list.length > 2 ? t("plan.team.gapMore", { names }) : names;
  };
  const savedGaps = teamGaps(kind, team.value.mode, members, teamDraftOf(members));
  const shownLevel = purpose.value.selectedLevel ?? purpose.value.suggestedLevel;
  const summaries: Record<BackgroundBlock, string> = {
    me: [me.value.name, me.value.stance ? t(STANCE_KEYS[me.value.stance]) : null, me.value.wants].filter(Boolean).join(" · "),
    purpose: shownLevel
      ? t(purpose.value.rungs.length === 1 ? "plan.purpose.summaryOne" : "plan.purpose.summary", { level: shownLevel, text: purpose.value.rungs.find((rung) => rung.level === shownLevel)?.text ?? "" })
      : t("plan.purpose.summaryNone"),
    team: savedGaps.length
      ? t(team.value.mode === "solo" ? "plan.team.summarySoloNames" : "plan.team.summaryNames", { count: activeMembers(team.value.mode, members).length, gaps: savedGaps.length, names: gapNames(savedGaps) })
      : t(team.value.mode === "solo" ? "plan.team.summarySolo" : "plan.team.summary", { count: activeMembers(team.value.mode, members).length, gaps: 0 }),
  };

  const blockTitle = (block: BackgroundBlock) => t(block === "me" ? "plan.block.me" : block === "team" ? "plan.block.team" : "plan.block.purpose");
  const degraded = !locked && (backgroundStep.state === "fallback" || backgroundStep.state === "failed");
  const rungs = [...purpose.value.rungs].sort((left, right) => right.level - left.level);

  // 底部主按钮（kit .foot）：当前块的「確定」，三块都确定后「この背景で質問へ」。
  const foot = locked ? null : active === "me"
    ? <FootButton label={t("plan.me.confirm")} loading={busy === "me"} disabled={!wants.trim() || !stance} onPress={() => void confirmMe()} testID="bg-confirm-me" />
    : active === "team"
      ? <FootButton label={t("plan.team.confirm")} loading={busy === "team"} onPress={() => void confirmTeam()} testID="bg-confirm-team" />
      : active === "purpose"
        ? <FootButton label={t(intake.background.purpose.confirmedAt || editing === "purpose" ? "plan.purpose.confirm" : "plan.background.toQuestions")} loading={busy === "purpose" || busy === "questions"} disabled={level === null} onPress={() => void confirmPurposeThen()} testID="bg-confirm-purpose" />
        : allConfirmed ? <FootButton label={t("plan.background.toQuestions")} loading={busy === "questions"} onPress={toQuestions} testID="bg-to-questions" /> : null;

  return (
    <>
      {degraded ? (
        backgroundStep.limit
          ? <LimitNote failure={{ kind: "aiLimit", limit: backgroundStep.limit, retryOn: backgroundStep.retryOn ?? null }} />
          : (
            <View accessibilityRole="alert" style={styles.degrade} testID="bg-fallback">
              <Icon name="alert" size={16} color={colors.ink2} />
              <View style={styles.grow}>
                <UiText style={styles.degradeTitle}>{t("plan.background.fallback")}</UiText>
                <KitButton sm icon="refresh" label={t("plan.common.again")} disabled={busy === "background"} onPress={() => void step("background", () => api.retryBackground(intake.intakeId, newIdempotencyKey("background")))} style={styles.degradeBtn} />
              </View>
            </View>
          )
      ) : null}
      {!locked && !degraded ? <Bubble>{t("plan.background.intro")}</Bubble> : null}
      <BlockStack>
        {(["me", "team", "purpose"] as const).map((block, index) => {
          const confirmed = Boolean(intake.background[block].confirmedAt);
          if (block === active) {
            return (
              <BlockSection key={block} n={index + 1} title={blockTitle(block)} state="open" chip={t("plan.block.checking")} testID={`bg-${block}`}>
                {block === "me" ? (
                  <>
                    <View style={styles.row10}>
                      <Avatar name={me.value.name} size="sm" />
                      <View style={styles.grow}>
                        <UiText style={styles.name14}>{me.value.name}</UiText>
                        {me.value.headline ? <UiText style={kit.lbl}>{me.value.headline}</UiText> : null}
                      </View>
                      <KitChip label={t("plan.me.fromProfile")} />
                    </View>
                    <FieldLabel>{t("plan.me.stanceLabel")}</FieldLabel>
                    <FoptRow label={t("plan.me.stanceLabel")}>
                      {PLAN_STANCES.map((item) => <Fopt key={item} label={t(STANCE_KEYS[item])} on={stance === item} onPress={() => setStance(item)} />)}
                    </FoptRow>
                    <FieldLabel chip={t("plan.me.fromGoal")}>{t("plan.me.wantsLabel")}</FieldLabel>
                    <View style={styles.fld}>
                      <TextInput accessibilityLabel={t("plan.me.wantsLabel")} onChangeText={setWants} placeholderTextColor={colors.ink4} selectionColor={colors.plum700} style={styles.fldInput} value={wants} />
                      <Icon name="pen" size={16} color={colors.ink2} />
                    </View>
                  </>
                ) : null}
                {block === "team" ? (
                  <>
                    <SegFull label={t("plan.team.modeLabel")} value={mode} onChange={setMode} options={[{ key: "solo", label: t("plan.team.solo") }, { key: "team", label: t("plan.team.team") }]} />
                    <View style={styles.members}>
                      {shown.map((member, n) => (
                        <View key={member.memberId} style={[styles.mem, n > 0 && styles.line]}>
                          <Avatar name={member.name} size="sm" />
                          <View style={styles.grow}>
                            <UiText style={styles.memName}>{member.name}</UiText>
                            <UiText style={kit.lbl}>{[member.isSelf ? t("plan.member.you") : null, member.isSelf && me.value.stance ? t(STANCE_KEYS[me.value.stance]) : member.headline].filter(Boolean).join(" · ")}</UiText>
                          </View>
                          <KitChip label={t(SOURCE_KEYS[member.source])} tone={member.source === "network" ? "lav" : "neutral"} style={styles.memChip} />
                        </View>
                      ))}
                    </View>
                    {mode === "team" ? <View style={styles.addMem}><GhostRow height={40} icon="user-plus" label={t("plan.team.addLong")} onPress={() => setAdding(true)} /></View> : null}
                    <CapabilityBox kind={kind} shown={shown} teamDraft={teamDraft} gaps={gaps} onToggle={(memberId, capability) => setTeamDraft((draft) => toggleCapability(draft, memberId, capability))} />
                    <PlanAddMemberSheet
                      visible={adding}
                      onClose={() => setAdding(false)}
                      kind={kind}
                      gaps={gaps}
                      existingContactIds={new Set(members.map((member) => member.contactId).filter((id): id is string => Boolean(id)))}
                      onAdd={async (body) => {
                        const ok = await step("members", () => api.addMembers(intake.intakeId, body));
                        if (ok) setMode("team");
                        return ok;
                      }}
                      adding={busy === "members"}
                    />
                  </>
                ) : null}
                {block === "purpose" ? (
                  <>
                    <UiText style={[kit.lbl, styles.purposeHint]}>{t("plan.purpose.hint")}</UiText>
                    <View accessibilityRole="radiogroup" accessibilityLabel={t("plan.block.purpose")} style={styles.stair}>
                      {rungs.map((rung, n) => {
                        const tag = purpose.value.suggestedLevel === rung.level && rungs.length > 1 ? t("plan.purpose.closest") : rung.level === 2 || rungs.length === 1 ? t("plan.purpose.original") : null;
                        const small = rung.level === 4 ? t("plan.purpose.big") : rung.level === 1 && rungs.length > 1 ? t("plan.purpose.small") : null;
                        return <StairRow key={rung.level} index={n} level={rung.level} text={rung.text} small={tag ? null : small} tag={tag} tagTone={tag === t("plan.purpose.original") ? "blue" : "lav"} on={level === rung.level} onPress={() => setLevel(rung.level)} />;
                      })}
                    </View>
                    {purpose.value.reason ? <AiSay text={purpose.value.reason} why={t("plan.purpose.why")} /> : null}
                  </>
                ) : null}
              </BlockSection>
            );
          }
          if (confirmed) {
            return <BlockSection key={block} n={index + 1} title={blockTitle(block)} state="done" summary={summaries[block]} onEdit={!locked ? () => setEditing(block) : undefined} editLabel={t("plan.block.edit", { block: blockTitle(block) })} testID={`bg-${block}`} />;
          }
          return <BlockSection key={block} n={index + 1} title={blockTitle(block)} state="draft" summary={t("plan.block.draft", { summary: summaries[block] })} testID={`bg-${block}`} />;
        })}
      </BlockStack>
      {failure ? <FailureNote failure={failure} onReload={() => { setFailure(null); onReload(); }} /> : null}
      {foot ? <FlowFoot>{foot}</FlowFoot> : null}
    </>
  );
}

/** 必要な力 · 誰ができる？（.capm）：8 项固定、顔をタップで付け外し、誰もいない力が「空き」。 */
function CapabilityBox({ kind, shown, teamDraft, gaps, onToggle }: {
  kind: PlanGoalKind;
  shown: readonly PlanTeamMember[];
  teamDraft: Record<string, TeamMemberDraft>;
  gaps: readonly string[];
  onToggle: (memberId: string, capability: string) => void;
}) {
  const { styles } = useStyles();
  const kit = useKitStyles().styles;
  const { t, language } = useOrbitLocale();
  const why = useKitWhy(t("plan.team.capabilitiesWhy"));
  return (
    <View style={styles.capBox}>
      <View style={styles.row6}>
        <UiText style={styles.capTitle}>{t("plan.team.capabilitiesTitle", { kind: planCopy(PLAN_GOAL_KIND_COPY[kind], language) })}</UiText>
        {why.button}
      </View>
      {why.body}
      <UiText style={[kit.lbl, styles.capHint]}>{t("plan.team.capabilitiesHint")}</UiText>
      {PLAN_GOAL_TEMPLATES[kind].capabilities.map((capability, n) => {
        const holders = shown.filter((member) => (teamDraft[member.memberId]?.capabilities ?? member.capabilities).includes(capability));
        const gap = gaps.includes(capability);
        const label = capabilityLabel(capability, language);
        return (
          <View key={capability} accessibilityLabel={label} style={[styles.caprow, n > 0 && styles.line]}>
            <UiText numberOfLines={1} style={[styles.capn, gap && styles.gapText]}>{label}</UiText>
            <View style={styles.capa}>
              {shown.map((member) => {
                const on = holders.includes(member);
                return (
                  <UiPressable
                    key={member.memberId}
                    accessibilityRole="checkbox"
                    accessibilityLabel={t("plan.team.toggle", { capability: label, name: member.name })}
                    accessibilityState={{ checked: on }}
                    aria-checked={on}
                    hitSlop={9}
                    onPress={() => onToggle(member.memberId, capability)}
                  >
                    <AvatarToken name={member.name} on={on} />
                  </UiPressable>
                );
              })}
            </View>
            <UiText style={[styles.caps, gap && styles.gapText]}>{gap ? t("plan.team.gap") : t("plan.team.people", { count: holders.length })}</UiText>
          </View>
        );
      })}
    </View>
  );
}

/** .avt：26 圆；on = 头像色（同 Avatar 的名字配色），off = 虚线 + ink-4。 */
function AvatarToken({ name, on }: { name: string; on: boolean }) {
  const { styles, colors } = useStyles();
  const tone = avatarTone(name);
  const background = { lav: colors.macLav, pink: colors.macPink, blue: colors.macBlue, teal: colors.macTeal, apricot: colors.macApricot }[tone];
  return (
    <View style={[styles.avt, on && { backgroundColor: background, borderWidth: 0 }]}>
      <UiText style={[styles.avtText, on && styles.avtTextOn]}>{initialOf(name)}</UiText>
    </View>
  );
}

/** .aisay：🧭 + iOrbit 的一句 + 「?」（根拠）。 */
function AiSay({ text, why }: { text: string; why: string }) {
  const { styles } = useStyles();
  const box = useKitWhy(why);
  return (
    <>
      <View style={styles.aisay}>
        <KitEmo emoji="🧭" tone="teal" sm />
        <UiText style={styles.aisayText}>{text}</UiText>
        {box.button ? <View style={styles.aisayWhy}>{box.button}</View> : null}
      </View>
      {box.body}
    </>
  );
}

export function initialOf(name: string): string {
  return [...name.trim()][0] ?? "?";
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  grow: { flex: 1, minWidth: 0 },
  row10: { flexDirection: "row", alignItems: "center", gap: 10 },
  row6: { flexDirection: "row", alignItems: "center", gap: 6 },
  line: { borderTopWidth: 1, borderTopColor: colors.line },
  name14: { color: colors.ink, ...kitText(14, "700") },
  fld: { minHeight: 46, borderRadius: 14, backgroundColor: colors.surface2, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, borderWidth: 1.5, borderColor: "transparent" },
  fldInput: { flex: 1, minWidth: 0, color: colors.ink, fontSize: 14, lineHeight: 21, padding: 0 },
  degrade: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 16, backgroundColor: colors.surface2 },
  degradeTitle: { color: colors.ink, ...kitText(12, "700") },
  degradeBtn: { alignSelf: "flex-start", marginTop: 8, backgroundColor: colors.surface },
  members: { marginTop: 8 },
  mem: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 9 },
  memName: { color: colors.ink, ...kitText(13, "700") },
  memChip: { alignSelf: "center" },
  addMem: { marginTop: 4 },
  capBox: { marginTop: 12 },
  capTitle: { flex: 1, color: colors.ink, ...kitText(12.5, "700") },
  capHint: { marginTop: 3, marginBottom: 4 },
  caprow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 },
  capn: { flex: 1, minWidth: 0, color: colors.ink, ...kitText(12.5, "700") },
  capa: { flexDirection: "row", gap: 6 },
  caps: { width: 34, textAlign: "right", color: colors.ink3, ...kitText(11, "800") },
  gapText: { color: colors.rose700 },
  avt: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.surface3 },
  avtText: { color: colors.ink4, ...kitText(10.5, "800") },
  avtTextOn: { color: colors.ink },
  purposeHint: { marginBottom: 8 },
  stair: { gap: 6, marginTop: 4 },
  aisay: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: 10 },
  aisayText: { flex: 1, color: colors.ink2, ...kitText(12, "400", 1.6) },
  aisayWhy: { marginTop: 1 },
}));
