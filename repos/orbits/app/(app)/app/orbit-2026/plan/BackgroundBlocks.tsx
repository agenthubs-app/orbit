"use client";

import { useEffect, useId, useState } from "react";

import type { PlanIntakeMembersRequest, PlanIntakeView, PlanMemberRelation, PlanStance, PlanTeamMember } from "../../../../../shared/contract/plan-v2";
import { PLAN_GOAL_TEMPLATES } from "../../../../../shared/compute/plan-templates";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { planFlowCopy } from "../copy/plan";
import type { OrbitCopyEntry } from "../copy/types";
import { Avatar, Button, Checkbox, Chip, FilterOption, Icon, Modal, SearchField, Segmented, Toggle, WhyDisclosure } from "../ui";
import { rankCandidates, searchNetwork, type PersonCandidate } from "./plan-api";
import {
  STANCES,
  capabilityLabel,
  coverCount,
  isGoalKind,
  ladderRungs,
  teamGaps,
  toggleCapability,
  type TeamDraft,
} from "./plan-model";
import type { Translate } from "./PlanParts";
import styles from "./plan.module.css";

export type BlockKey = "me" | "team" | "purpose";
export const BLOCK_ORDER: readonly BlockKey[] = ["me", "team", "purpose"];

export const STANCE_COPY: Record<PlanStance, OrbitCopyEntry> = {
  cofounder: planFlowCopy.stanceCofounder,
  employee: planFlowCopy.stanceEmployee,
  individual: planFlowCopy.stanceIndividual,
  owner: planFlowCopy.stanceOwner,
};

const RELATION_COPY: Record<PlanMemberRelation, OrbitCopyEntry> = {
  advisor: planFlowCopy.relationAdvisor,
  cofounder: planFlowCopy.relationCofounder,
  contractor: planFlowCopy.relationContractor,
  employee: planFlowCopy.relationEmployee,
};

const RELATIONS: readonly PlanMemberRelation[] = ["cofounder", "employee", "contractor", "advisor"];

const SOURCE_COPY: Record<PlanTeamMember["source"], OrbitCopyEntry> = {
  manual: planFlowCopy.sourceManual,
  network: planFlowCopy.sourceNetwork,
  profile: planFlowCopy.sourceProfile,
};

const BLOCK_COPY: Record<BlockKey, OrbitCopyEntry> = { me: planFlowCopy.blockMe, purpose: planFlowCopy.blockPurpose, team: planFlowCopy.blockTeam };

export type MeDraft = { stance: PlanStance | null; wants: string };

export type BackgroundProps = {
  intake: PlanIntakeView;
  language: OrbitLanguage;
  t: Translate;
  me: MeDraft;
  onMe: (next: MeDraft) => void;
  team: TeamDraft;
  onTeam: (next: TeamDraft) => void;
  purposeLevel: number | null;
  onPurpose: (level: number) => void;
  editing: BlockKey | null;
  onEdit: (block: BlockKey) => void;
  busy: string | null;
  onConfirm: (block: BlockKey) => void;
  onAddMembers: (body: PlanIntakeMembersRequest) => Promise<boolean>;
};

/** The block the person is on: the one being re-opened, else the first not confirmed. */
export function currentBlock(intake: PlanIntakeView, editing: BlockKey | null): BlockKey | null {
  if (editing) return editing;
  return BLOCK_ORDER.find((block) => !intake.background[block].confirmedAt) ?? null;
}

export function teamSummary(intake: PlanIntakeView, team: TeamDraft, t: Translate, language: OrbitLanguage): string {
  const self = intake.background.team.value.members.find((member) => member.isSelf);
  const names = new Map(intake.background.team.value.members.map((member) => [member.memberId, member.name]));
  const members = team.mode === "solo" ? team.members.filter((member) => member.memberId === self?.memberId) : team.members;
  const setup = team.mode === "solo" || members.length <= 1 ? t(planFlowCopy.railSolo) : t(planFlowCopy.railTeam, { count: members.length, names: members.map((member) => names.get(member.memberId) ?? "").join(" · ") });
  const gaps = teamGaps(intake.goalKind, team, self?.memberId ?? null);
  return gaps.length ? `${setup} · ${t(planFlowCopy.gapChip, { label: gaps.map((gap) => capabilityLabel(gap, language)).join(t(planFlowCopy.listSeparator)) })}` : setup;
}

function blockSummary(block: BlockKey, props: Pick<BackgroundProps, "intake" | "me" | "team" | "purposeLevel" | "t" | "language">): string {
  const { intake, t } = props;
  if (block === "me") {
    const value = intake.background.me.value;
    return [value.name, props.me.stance ? t(STANCE_COPY[props.me.stance]) : null, props.me.wants].filter(Boolean).join(" · ");
  }
  if (block === "team") return teamSummary(intake, props.team, t, props.language);
  const rung = intake.background.purpose.value.rungs.find((item) => item.level === props.purposeLevel);
  return rung?.text ?? "";
}

/** ② 背景: わたし → チーム → 目的, in order (current open, confirmed folded, later dashed). */
export function BackgroundBlocks(props: BackgroundProps) {
  const { intake, t } = props;
  const current = currentBlock(intake, props.editing);
  const canEdit = intake.status === "background";
  const frame = (block: BlockKey, body: React.ReactNode) => {
    if (block === current) return <section key={block} className={styles.block} data-plan-block={block} data-state="current">{body}</section>;
    if (intake.background[block].confirmedAt) {
      return (
        <section key={block} className={styles.blockDone} data-plan-block={block} data-state="done">
          <Icon name="check" size={16} />
          <span className={styles.blockName}>{t(BLOCK_COPY[block])}</span>
          <span className={styles.blockSummary}>{blockSummary(block, props)}</span>
          {canEdit ? <button type="button" className={`btn ${styles.iconButton}`} aria-label={t(planFlowCopy.editBlock, { block: t(BLOCK_COPY[block]) })} onClick={() => props.onEdit(block)}><Icon name="pen" size={16} /></button> : null}
        </section>
      );
    }
    return (
      <section key={block} className={styles.blockLater} data-plan-block={block} data-state="later">
        <b>{t(BLOCK_COPY[block])}</b> · {t(planFlowCopy.draftSummary, { text: blockSummary(block, props) })}
      </section>
    );
  };
  return (
    <div className={styles.stack} data-plan-background="">
      {frame("me", <MeBlock {...props} />)}
      {frame("team", <TeamBlock {...props} />)}
      {frame("purpose", <PurposeBlock {...props} />)}
    </div>
  );
}

function BlockHead({ block, t }: { block: BlockKey; t: Translate }) {
  return (
    <div className={styles.blockHead}>
      <span className={styles.blockName}>{t(BLOCK_COPY[block])}</span>
      <Chip label={t(planFlowCopy.checking)} tone="lav" />
    </div>
  );
}

function MeBlock({ intake, t, me, onMe, busy, onConfirm }: BackgroundProps) {
  const wantsId = useId();
  const value = intake.background.me.value;
  return (
    <>
      <BlockHead block="me" t={t} />
      <div className={styles.row}>
        <b>{value.name}</b>
        {value.headline ? <span className={styles.muted}>{value.headline}</span> : null}
        <Chip label={t(planFlowCopy.fromProfile)} />
      </div>
      <div className={styles.field}>
        <span className={styles.fieldHead}>{t(planFlowCopy.stanceLabel)}</span>
        <div className={styles.options} role="group" aria-label={t(planFlowCopy.stanceLabel)}>
          {STANCES.map((stance) => <FilterOption key={stance} label={t(STANCE_COPY[stance])} selected={me.stance === stance} onToggle={() => onMe({ ...me, stance })} />)}
        </div>
      </div>
      <div className={styles.field}>
        <label className={styles.fieldHead} htmlFor={wantsId}>{t(planFlowCopy.wantsLabel)} <Chip label={t(planFlowCopy.fromGoal)} /></label>
        <input id={wantsId} className={styles.textInput} value={me.wants} maxLength={300} onChange={(event) => onMe({ ...me, wants: event.target.value })} />
      </div>
      <div className={styles.blockActions}>
        <Button variant="primary" label={t(planFlowCopy.confirmMe)} loading={busy === "me"} disabled={!me.stance || !me.wants.trim() || Boolean(busy)} onClick={() => onConfirm("me")} />
      </div>
    </>
  );
}

function TeamBlock(props: BackgroundProps) {
  const { intake, t, language, team, onTeam, busy, onConfirm } = props;
  const [adding, setAdding] = useState(false);
  const members = intake.background.team.value.members;
  const self = members.find((member) => member.isSelf) ?? null;
  const shown = team.mode === "solo" ? members.filter((member) => member.isSelf) : members;
  const capabilities = isGoalKind(intake.goalKind) ? PLAN_GOAL_TEMPLATES[intake.goalKind].capabilities : [];
  const drafts = new Map(team.members.map((member) => [member.memberId, member]));
  const gaps = teamGaps(intake.goalKind, team, self?.memberId ?? null);
  return (
    <>
      <BlockHead block="team" t={t} />
      <Segmented<"solo" | "team"> label={t(planFlowCopy.teamMode)} value={team.mode} onChange={(mode) => onTeam({ ...team, mode })}
        segments={[{ key: "solo", label: t(planFlowCopy.teamSolo) }, { key: "team", label: t(planFlowCopy.teamTeam) }]} />
      {capabilities.length ? (
        <div className={`${styles.tableWrap} ${styles.field}`}>
          <table className={styles.teamTable} data-plan-team-table="">
            <thead>
              <tr>
                <th scope="col"><span className={styles.row}>{t(planFlowCopy.capabilitiesHead, { count: capabilities.length })}<WhyDisclosure reason={t(planFlowCopy.capabilitiesWhy, { count: capabilities.length })} /></span></th>
                {shown.map((member) => (
                  <th key={member.memberId} scope="col">
                    <span className={styles.memberHead}>
                      <Avatar name={member.name} size="sm" />
                      <span>{member.name}</span>
                      <Chip label={t(SOURCE_COPY[member.source])} tone={member.source === "network" ? "teal" : member.source === "manual" ? "apricot" : "neutral"} />
                      {member.basis ? <span className={styles.label} title={member.basis}>{t(planFlowCopy.basisNetwork)}</span> : null}
                    </span>
                  </th>
                ))}
                <th scope="col"><Button size="sm" icon="plus" label={t(planFlowCopy.addMember)} onClick={() => setAdding(true)} /></th>
              </tr>
            </thead>
            <tbody>
              {capabilities.map((capability) => {
                const count = coverCount(team, capability, self?.memberId ?? null);
                return (
                  <tr key={capability} data-capability={capability}>
                    <th scope="row">{capabilityLabel(capability, language)}</th>
                    {shown.map((member) => {
                      const on = Boolean(drafts.get(member.memberId)?.capabilities.includes(capability));
                      return (
                        <td key={member.memberId}>
                          <button type="button" className={`btn ${styles.cell} ${on ? styles.cellOn : ""}`} aria-pressed={on}
                            aria-label={t(planFlowCopy.toggleCapability, { capability: capabilityLabel(capability, language), name: member.name })}
                            onClick={() => onTeam(toggleCapability(team, member.memberId, capability))}>
                            {on ? <Icon name="check" size={16} /> : null}
                          </button>
                        </td>
                      );
                    })}
                    <td data-plan-cover="">{gaps.includes(capability) ? <span className={styles.gapText}>{t(planFlowCopy.gap)}</span> : <span className={styles.coverText}>{t(planFlowCopy.covered, { count })}</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className={styles.label}>{t(planFlowCopy.teamHint)}</p>
        </div>
      ) : null}
      <div className={styles.blockActions}>
        <Button variant="primary" label={t(planFlowCopy.confirmTeam)} loading={busy === "team"} disabled={Boolean(busy)} onClick={() => onConfirm("team")} />
      </div>
      <AddMemberModal open={adding} onClose={() => setAdding(false)} {...props} gaps={gaps} />
    </>
  );
}

function PurposeBlock({ intake, t, purposeLevel, onPurpose, busy, onConfirm }: BackgroundProps) {
  const purpose = intake.background.purpose.value;
  const rungs = ladderRungs(purpose);
  return (
    <>
      <BlockHead block="purpose" t={t} />
      <b className={styles.h3}>{t(planFlowCopy.purposeQuestion)}</b>
      <p className={styles.label}>{t(planFlowCopy.purposeHint)}</p>
      <ul className={styles.ladder} role="radiogroup" aria-label={t(planFlowCopy.purposeQuestion)}>
        {rungs.map((rung, index) => {
          const on = purposeLevel === rung.level;
          const tags = [
            rung.level === 4 ? planFlowCopy.rungBig : null,
            rung.level === 1 ? planFlowCopy.rungSmall : null,
            rung.level === 2 ? planFlowCopy.rungOriginal : null,
            purpose.suggestedLevel === rung.level ? planFlowCopy.rungSuggested : null,
          ].filter((tag): tag is NonNullable<typeof tag> => Boolean(tag));
          return (
            <li key={rung.level} className={styles[`indent${rungs.length === 1 ? 0 : Math.min(index, 3)}`]}>
              <button type="button" role="radio" aria-checked={on} className={`btn ${styles.rung} ${on ? styles.rungOn : ""}`} onClick={() => onPurpose(rung.level)}>
                <span className={`${styles.num} ${on ? styles.numOn : ""}`}>{rung.level}</span>
                <span className={styles.rungText}>{rung.text}</span>
                <span className={styles.rungTags}>{tags.map((tag) => <Chip key={tag.en} label={t(tag)} tone={tag === planFlowCopy.rungSuggested ? "lav" : "neutral"} />)}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {purpose.reason ? <p className={styles.reason}><span aria-hidden>🧭</span><span>{purpose.reason}</span><WhyDisclosure reason={t(planFlowCopy.purposeWhy)} /></p> : null}
      <div className={styles.blockActions}>
        <Button variant="primary" label={t(planFlowCopy.confirmPurpose)} loading={busy === "purpose"} disabled={purposeLevel === null || Boolean(busy)} onClick={() => onConfirm("purpose")} />
      </div>
    </>
  );
}

/* ---------- メンバーを追加（人脈から選ぶ / 自分で書く） ---------- */

function AddMemberModal({ open, onClose, intake, t, language, onAddMembers, gaps }: BackgroundProps & { open: boolean; onClose: () => void; gaps: string[] }) {
  const [tab, setTab] = useState<"network" | "manual">("network");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PersonCandidate[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [relation, setRelation] = useState<PlanMemberRelation | null>(null);
  const [caps, setCaps] = useState<string[]>([]);
  const [otherOpen, setOtherOpen] = useState(false);
  const [other, setOther] = useState("");
  const [alsoNetwork, setAlsoNetwork] = useState(false);
  const [saving, setSaving] = useState(false);
  const nameId = useId();
  const otherId = useId();
  const existing = new Set(intake.background.team.value.members.map((member) => member.contactId).filter(Boolean));
  const capabilities = isGoalKind(intake.goalKind) ? PLAN_GOAL_TEMPLATES[intake.goalKind].capabilities : [];

  useEffect(() => {
    if (!open || tab !== "network") return;
    const trimmed = query.trim();
    if (!trimmed) { setResults(null); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void searchNetwork(trimmed, controller.signal).then(setResults).catch(() => undefined);
    }, 300);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [open, tab, query]);

  useEffect(() => {
    if (open) return;
    setQuery(""); setResults(null); setPicked([]); setName(""); setRelation(null); setCaps([]); setOther(""); setOtherOpen(false); setAlsoNetwork(false);
  }, [open]);

  const ranked = rankCandidates((results ?? []).filter((candidate) => !existing.has(candidate.contactId)), gaps.map((id) => ({ id, label: capabilityLabel(id, language) })));
  const submit = async () => {
    if (saving) return;
    setSaving(true);
    const otherCapabilities = other.split(/[、,，]/u).map((item) => item.trim()).filter(Boolean).slice(0, 10);
    const ok = await onAddMembers(tab === "network"
      ? { contactIds: picked, idempotencyKey: "", mode: "network" }
      : { alsoAddToNetwork: alsoNetwork, capabilities: caps, idempotencyKey: "", mode: "manual", name: name.trim(), otherCapabilities: otherOpen ? otherCapabilities : [], relation: relation! });
    setSaving(false);
    if (ok) onClose();
  };
  const canSubmit = tab === "network" ? picked.length > 0 : Boolean(name.trim() && relation);

  return (
    <Modal open={open} onClose={onClose} title={t(planFlowCopy.addMemberTitle)} size={560}
      actions={<Button variant="primary" loading={saving} disabled={!canSubmit} label={tab === "network" ? t(planFlowCopy.addSelected, { count: picked.length }) : t(planFlowCopy.addManual)} onClick={() => void submit()} />}>
      <div className={styles.modalBody}>
        <Segmented<"network" | "manual"> label={t(planFlowCopy.addMemberTabs)} value={tab} onChange={setTab} wide
          segments={[{ key: "network", label: t(planFlowCopy.tabNetwork) }, { key: "manual", label: t(planFlowCopy.tabManual) }]} />
        {tab === "network" ? (
          <div data-plan-add="network">
            <SearchField value={query} onChange={setQuery} placeholder={t(planFlowCopy.searchPlaceholder)} />
            {results === null ? <p className={styles.label}>{t(planFlowCopy.searchEmpty)}</p> : ranked.length === 0 ? <p className={styles.label}>{t(planFlowCopy.searchNone)}</p> : (
              <ul className={styles.candidates}>
                {ranked.map((candidate) => {
                  const on = picked.includes(candidate.contactId);
                  return (
                    <li key={candidate.contactId} className={styles.candidate}>
                      <Checkbox checked={on} label={candidate.name} onChange={(next) => setPicked((current) => next ? (current.length >= 5 ? current : [...current, candidate.contactId]) : current.filter((id) => id !== candidate.contactId))} />
                      <Avatar name={candidate.name} size="sm" />
                      <span className={styles.candidateBody}>
                        <b>{candidate.name}</b>
                        <span className={styles.label}>{[candidate.organization, candidate.role].filter(Boolean).join(" · ")}</span>
                      </span>
                      {candidate.cofounder ? <Chip label={t(planFlowCopy.cofounderChip)} tone="lav" /> : null}
                      {candidate.fills.slice(0, 1).map((label) => <Chip key={label} label={t(planFlowCopy.gapChip, { label })} tone="coral" />)}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : (
          <div data-plan-add="manual" className={styles.stack}>
            <div className={styles.field}>
              <label className={styles.fieldHead} htmlFor={nameId}>{t(planFlowCopy.nameLabel)}</label>
              <input id={nameId} className={styles.textInput} value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />
            </div>
            <div className={styles.field}>
              <span className={styles.fieldHead}>{t(planFlowCopy.relationLabel)}</span>
              <div className={styles.options} role="group" aria-label={t(planFlowCopy.relationLabel)}>
                {RELATIONS.map((key) => (
                  <FilterOption key={key} label={t(RELATION_COPY[key])} selected={relation === key} onToggle={() => setRelation(key)} />
                ))}
              </div>
            </div>
            <div className={styles.field}>
              <span className={styles.fieldHead}>{t(planFlowCopy.canDoLabel)}</span>
              <div className={styles.options} role="group" aria-label={t(planFlowCopy.canDoLabel)}>
                {capabilities.map((capability) => (
                  <FilterOption key={capability} label={capabilityLabel(capability, language)} selected={caps.includes(capability)}
                    onToggle={() => setCaps((current) => current.includes(capability) ? current.filter((item) => item !== capability) : [...current, capability])} />
                ))}
                <FilterOption label={t(planFlowCopy.otherCapability)} selected={otherOpen} onToggle={() => setOtherOpen(!otherOpen)} />
              </div>
              {otherOpen ? <input id={otherId} aria-label={t(planFlowCopy.otherPlaceholder)} className={styles.textInput} value={other} placeholder={t(planFlowCopy.otherPlaceholder)} onChange={(event) => setOther(event.target.value)} /> : null}
            </div>
            <div className={styles.switchRow}>
              <Toggle checked={alsoNetwork} onChange={setAlsoNetwork} label={t(planFlowCopy.alsoNetwork)} />
              <span><b className={styles.muted}>{t(planFlowCopy.alsoNetwork)}</b><br /><span className={styles.label}>{t(planFlowCopy.alsoNetworkHint)}</span></span>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
