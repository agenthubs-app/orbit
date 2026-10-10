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
import { Button, IconButton, Segmented, UiPressable, UiText, WhyDisclosure } from "../../components/ui";
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
import { ChoiceChip, InlineProblem, isLimitFailure, LimitNote, StaleNote, Tag, useFailureText, usePlanStyles } from "./plan-ui";

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
  const shared = usePlanStyles().styles;
  const { styles, colors } = useStyles();
  const { t, language } = useOrbitLocale();
  const failureText = useFailureText();
  const { me, team, purpose } = intake.background;
  const locked = intake.status !== "background";
  const [editing, setEditing] = useState<BackgroundBlock | null>(null);
  const [stance, setStance] = useState<PlanStance>(me.value.stance ?? "owner");
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
    setStance(me.value.stance ?? "owner");
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

  const confirmPurpose = async () => {
    if (level === null) return;
    const done = await step("purpose", () => api.confirmBlock(intake.intakeId, { block: "purpose", expectedUpdatedAt: intake.updatedAt, idempotencyKey: newIdempotencyKey("purpose"), purpose: { selectedLevel: level } }));
    if (done) setEditing(null);
  };

  const toQuestions = () => void step("questions", () => api.questions(intake.intakeId, newIdempotencyKey("questions")));

  const backgroundStep = intake.aiSteps.background;
  const summaries: Record<BackgroundBlock, string> = {
    me: [me.value.name, me.value.stance ? t(STANCE_KEYS[me.value.stance]) : null, me.value.wants].filter(Boolean).join(" · "),
    purpose: purpose.value.selectedLevel ?? purpose.value.suggestedLevel
      ? t("plan.purpose.summary", { level: (purpose.value.selectedLevel ?? purpose.value.suggestedLevel)!, text: purpose.value.rungs.find((rung) => rung.level === (purpose.value.selectedLevel ?? purpose.value.suggestedLevel))?.text ?? "" })
      : t("plan.purpose.summaryNone"),
    team: t(team.value.mode === "solo" ? "plan.team.summarySolo" : "plan.team.summary", { count: activeMembers(team.value.mode, members).length, gaps: teamGaps(kind, team.value.mode, members, teamDraftOf(members)).length }),
  };

  const blockTitle = (block: BackgroundBlock) => t(block === "me" ? "plan.block.me" : block === "team" ? "plan.block.team" : "plan.block.purpose");

  return (
    <View style={styles.blocks}>
      {!locked && (backgroundStep.state === "fallback" || backgroundStep.state === "failed") ? (
        backgroundStep.limit
          ? <LimitNote failure={{ kind: "aiLimit", limit: backgroundStep.limit, retryOn: backgroundStep.retryOn ?? null }} />
          : (
            <View style={[shared.softCard]}>
              <UiText style={shared.body2}>{t("plan.background.fallback")}</UiText>
              <Button label={t("plan.common.again")} loading={busy === "background"} onPress={() => void step("background", () => api.retryBackground(intake.intakeId, newIdempotencyKey("background")))} size="sm" variant="secondary" />
            </View>
          )
      ) : null}
      {!locked ? <UiText style={shared.body2}>{t("plan.background.intro")}</UiText> : null}
      {(["me", "team", "purpose"] as const).map((block, index) => {
        const confirmed = Boolean(intake.background[block].confirmedAt);
        if (block === active) {
          return (
            <View key={block} accessibilityLabel={blockTitle(block)} style={shared.card}>
              <View style={shared.row}>
                <View style={[shared.number, shared.numberNow]}><UiText style={[shared.numberText, shared.numberTextNow]}>{index + 1}</UiText></View>
                <UiText accessibilityRole="header" style={[shared.title, shared.grow]}>{blockTitle(block)}</UiText>
                <Tag label={t("plan.block.checking")} tone="accent" />
              </View>
              {block === "me" ? (
                <>
                  <View style={shared.rowTop}>
                    <Initial name={me.value.name} on />
                    <View style={shared.grow}>
                      <UiText style={shared.title}>{me.value.name}</UiText>
                      {me.value.headline ? <UiText style={shared.body2}>{me.value.headline}</UiText> : null}
                    </View>
                    <Tag label={t("plan.me.fromProfile")} />
                  </View>
                  <UiText style={shared.label}>{t("plan.me.stanceLabel")}</UiText>
                  <View accessibilityRole="radiogroup" accessibilityLabel={t("plan.me.stanceLabel")} style={shared.wrap}>
                    {PLAN_STANCES.map((item) => <ChoiceChip key={item} label={t(STANCE_KEYS[item])} selected={stance === item} onPress={() => setStance(item)} />)}
                  </View>
                  <View style={shared.row}>
                    <UiText style={shared.label}>{t("plan.me.wantsLabel")}</UiText>
                    <Tag label={t("plan.me.fromGoal")} />
                  </View>
                  <TextInput accessibilityLabel={t("plan.me.wantsLabel")} onChangeText={setWants} placeholderTextColor={colors.ink3Text} style={shared.input} value={wants} />
                  <Button block label={t("plan.me.confirm")} loading={busy === "me"} disabled={!wants.trim()} onPress={() => void confirmMe()} variant="primary" />
                </>
              ) : null}
              {block === "team" ? (
                <>
                  <Segmented
                    accessibilityLabel={t("plan.team.modeLabel")}
                    onChange={setMode}
                    segments={[{ key: "solo", label: t("plan.team.solo") }, { key: "team", label: t("plan.team.team") }]}
                    value={mode}
                  />
                  {shown.map((member) => (
                    <View key={member.memberId} style={shared.rowTop}>
                      <Initial name={member.name} on />
                      <View style={shared.grow}>
                        <UiText style={shared.title}>{member.name}</UiText>
                        <UiText style={shared.caption}>{[member.isSelf ? t("plan.member.you") : null, member.headline].filter(Boolean).join(" · ")}</UiText>
                        {member.source === "network" && member.basis ? <UiText style={shared.caption}>{member.basis}</UiText> : null}
                      </View>
                      <View style={styles.memberTags}>
                        <Tag label={t(SOURCE_KEYS[member.source])} />
                        {member.source === "network" && member.basis ? <Tag label={t("plan.member.fromCards")} tone="accent" /> : null}
                      </View>
                    </View>
                  ))}
                  {mode === "team" ? <Button icon="user-plus" label={t("plan.team.add")} onPress={() => setAdding(true)} variant="secondary" /> : null}
                  <View style={shared.divider} />
                  <View style={shared.row}>
                    <UiText style={[shared.title, shared.grow]}>{t("plan.team.capabilitiesTitle", { kind: planCopy(PLAN_GOAL_KIND_COPY[kind], language) })}</UiText>
                  </View>
                  <WhyDisclosure reason={t("plan.team.capabilitiesWhy")} />
                  <UiText style={shared.caption}>{t("plan.team.capabilitiesHint")}</UiText>
                  {PLAN_GOAL_TEMPLATES[kind].capabilities.map((capability) => {
                    const holders = shown.filter((member) => (teamDraft[member.memberId]?.capabilities ?? member.capabilities).includes(capability));
                    const gap = gaps.includes(capability);
                    const label = capabilityLabel(capability, language);
                    return (
                      <View key={capability} accessibilityLabel={label} style={styles.capRow}>
                        <UiText numberOfLines={2} style={[shared.body, styles.capLabel]}>{label}</UiText>
                        <View style={styles.capPeople}>
                          {shown.map((member) => {
                            const on = holders.includes(member);
                            return (
                              <UiPressable
                                key={member.memberId}
                                accessibilityRole="checkbox"
                                accessibilityLabel={t("plan.team.toggle", { capability: label, name: member.name })}
                                accessibilityState={{ checked: on }}
                                hitSlop={6}
                                onPress={() => setTeamDraft((draft) => toggleCapability(draft, member.memberId, capability))}
                                style={[shared.avatar, on && shared.avatarOn]}
                              >
                                <UiText style={[shared.avatarText, on && shared.avatarTextOn]}>{initialOf(member.name)}</UiText>
                              </UiPressable>
                            );
                          })}
                        </View>
                        {gap ? <Tag label={t("plan.team.gap")} tone="gap" /> : <UiText style={styles.capCount}>{t("plan.team.people", { count: holders.length })}</UiText>}
                      </View>
                    );
                  })}
                  <Button block label={t("plan.team.confirm")} loading={busy === "team"} onPress={() => void confirmTeam()} variant="primary" />
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
                  <UiText style={shared.body2}>{t("plan.purpose.hint")}</UiText>
                  <View accessibilityRole="radiogroup" accessibilityLabel={t("plan.block.purpose")} style={styles.ladder}>
                    {[...purpose.value.rungs].sort((left, right) => right.level - left.level).map((rung) => {
                      const selected = level === rung.level;
                      const tags = [
                        rung.level === 4 ? t("plan.purpose.big") : null,
                        rung.level === 1 ? t("plan.purpose.small") : null,
                        rung.level === 2 ? t("plan.purpose.original") : null,
                        purpose.value.suggestedLevel === rung.level ? t("plan.purpose.closest") : null,
                      ].filter((item): item is string => Boolean(item));
                      return (
                        <UiPressable
                          key={rung.level}
                          accessibilityRole="radio"
                          accessibilityLabel={`${rung.level} ${rung.text}`}
                          accessibilityState={{ checked: selected, selected }}
                          onPress={() => setLevel(rung.level)}
                          style={[styles.rung, { marginLeft: purpose.value.rungs.length > 1 ? (4 - rung.level) * 12 : 0 }, selected && styles.rungOn]}
                        >
                          <View style={[shared.number, selected && shared.numberNow]}><UiText style={[shared.numberText, selected && shared.numberTextNow]}>{rung.level}</UiText></View>
                          <View style={shared.grow}>
                            <UiText style={shared.body}>{rung.text}</UiText>
                            {tags.length ? <View style={shared.wrap}>{tags.map((tag) => <Tag key={tag} label={tag} tone={tag === t("plan.purpose.closest") ? "accent" : "neutral"} />)}</View> : null}
                          </View>
                        </UiPressable>
                      );
                    })}
                  </View>
                  {purpose.value.reason ? (
                    <View style={shared.rowTop}>
                      <UiText style={shared.emoji}>🧭</UiText>
                      <UiText style={[shared.body2, shared.grow]}>{purpose.value.reason}</UiText>
                    </View>
                  ) : null}
                  <WhyDisclosure reason={t("plan.purpose.why")} />
                  <Button block disabled={level === null} label={t("plan.purpose.confirm")} loading={busy === "purpose"} onPress={() => void confirmPurpose()} variant="primary" />
                </>
              ) : null}
            </View>
          );
        }
        if (confirmed) {
          return (
            <View key={block} accessibilityLabel={blockTitle(block)} style={[shared.softCard, shared.row]}>
              <UiText style={shared.label}>{blockTitle(block)}</UiText>
              <UiText numberOfLines={2} style={[shared.body2, shared.grow]}>{summaries[block]}</UiText>
              {!locked ? <IconButton icon="pen" accessibilityLabel={t("plan.block.edit", { block: blockTitle(block) })} onPress={() => setEditing(block)} size={34} /> : null}
            </View>
          );
        }
        return (
          <View key={block} accessibilityLabel={blockTitle(block)} style={shared.dashedCard}>
            <View style={shared.row}>
              <View style={shared.number}><UiText style={shared.numberText}>{index + 1}</UiText></View>
              <UiText style={shared.title}>{blockTitle(block)}</UiText>
            </View>
            <UiText numberOfLines={2} style={shared.caption}>{t("plan.block.draft", { summary: summaries[block] })}</UiText>
          </View>
        );
      })}
      {failure ? failure.kind === "stale" ? <StaleNote onReload={onReload} /> : isLimitFailure(failure) ? <LimitNote failure={failure} /> : <InlineProblem text={failureText(failure)} /> : null}
      {!locked && allConfirmed ? <Button block label={t("plan.background.toQuestions")} loading={busy === "questions"} onPress={toQuestions} variant="primary" /> : null}
    </View>
  );
}

export function initialOf(name: string): string {
  return [...name.trim()][0] ?? "?";
}

function Initial({ name, on = false }: { name: string; on?: boolean }) {
  const shared = usePlanStyles().styles;
  return <View style={[shared.avatar, on && shared.avatarOn]}><UiText style={[shared.avatarText, on && shared.avatarTextOn]}>{initialOf(name)}</UiText></View>;
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  blocks: { gap: 12 },
  memberTags: { alignItems: "flex-end", gap: 4 },
  capRow: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 40 },
  capLabel: { width: 104 },
  capPeople: { flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 6 },
  capCount: { color: colors.ink3Text, fontSize: 12, fontWeight: "700" },
  ladder: { gap: 8 },
  rung: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 12, borderRadius: 16, backgroundColor: colors.surface2, borderWidth: 1.5, borderColor: "transparent" },
  rungOn: { backgroundColor: colors.accentSoft, borderColor: colors.plum500 },
}));
