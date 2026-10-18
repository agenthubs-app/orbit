"use client";

import { useEffect, useId, useState } from "react";

import type { PlanIntakeMembersRequest, PlanIntakeView, PlanMemberCandidatesResponse, PlanMemberRelation, PlanStance, PlanTeamMember } from "../../../../../shared/contract/plan-v2";
import { PLAN_GOAL_TEMPLATES } from "../../../../../shared/compute/plan-templates";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { planFlowCopy } from "../copy/plan";
import type { OrbitCopyEntry } from "../copy/types";
import { standardCopyFor } from "../copy/standard";
import { Icon, Segmented } from "../ui";
import { DialogActs, FlowDialog } from "./FlowParts";
import { planApi, rankCandidates, searchNetwork, type PersonCandidate } from "./plan-api";
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
import k from "./FlowKit.module.css";

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
const SOURCE_TONE: Record<PlanTeamMember["source"], string> = { manual: k.chipApricot!, network: k.chipLav!, profile: "" };
const AV_TONES = [k.av1, k.av3, k.av2, k.av4, k.av5];

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
  /** Background draft failed: the rule draft (b12 W-R23-09) — わたし first, the rest still drafts. */
  fallback?: boolean;
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

function meSummary(props: Pick<BackgroundProps, "intake" | "me" | "t">): string {
  const value = props.intake.background.me.value;
  return [value.name, props.me.stance ? props.t(STANCE_COPY[props.me.stance]) : null, props.me.wants].filter(Boolean).join(" · ");
}

/** わたし opens when re-opened with ✎, or while it has no role yet (the rule draft has none). */
export function meIsOpen(intake: PlanIntakeView, me: MeDraft, editing: BlockKey | null): boolean {
  return editing === "me" || (!intake.background.me.confirmedAt && !me.stance);
}

/**
 * ② 背景 · Web (b10 「② 背景確認 · Web」): one screen, three blocks — left わたし (folded with ✎,
 * or open) over the チーム table, right the 目的 stair. The page confirms all three with one
 * button under them (「この背景で質問へ」).
 */
export function BackgroundBlocks(props: BackgroundProps) {
  const { intake, t } = props;
  const canEdit = intake.status === "background";
  const meOpen = meIsOpen(intake, props.me, props.editing);
  return (
    <div className={`${k.bgGrid} ${props.fallback ? k.bgGridStart : ""}`} data-plan-background="">
      <div className={k.bgCol}>
        <div className={k.bstack}>
          {meOpen ? (
            <section className={`${k.bsec} ${k.bsecOpen}`} data-plan-block="me" data-state="current">
              <div className={k.bsh}><span className={k.bsn}>1</span><b>{t(BLOCK_COPY.me)}</b><span className={`${k.chip} ${k.chipLav}`}>{t(planFlowCopy.checking)}</span></div>
              <div className={k.bsb}><MeBlock {...props} /></div>
            </section>
          ) : (
            <section className={`${k.bsec} ${k.bsecDone}`} data-plan-block="me" data-state="done">
              <div className={k.bsh}>
                <span className={k.bsn}><Icon name="check" size={16} /></span>
                <b>{t(BLOCK_COPY.me)}</b>
                <span className={k.bss}>{meSummary(props)}</span>
                {canEdit ? <button type="button" className={`btn ${k.lbtn}`} aria-label={t(planFlowCopy.editBlock, { block: t(BLOCK_COPY.me) })} onClick={() => props.onEdit("me")}><Icon name="pen" size={16} /></button> : null}
              </div>
            </section>
          )}
          {props.fallback && meOpen ? (
            <section className={`${k.bsec} ${k.bsecDraft}`} data-plan-block="team" data-state="later">
              <div className={k.bsh}><span className={k.bsn}>2</span><b>{t(BLOCK_COPY.team)}</b><span className={k.bss}>{t(planFlowCopy.draftSummary, { text: teamSummary(intake, props.team, t, props.language) })}</span></div>
            </section>
          ) : null}
        </div>
        {props.fallback && meOpen ? null : <TeamCard {...props} />}
      </div>
      <PurposeCard {...props} />
    </div>
  );
}

function MeBlock({ intake, t, me, onMe }: BackgroundProps) {
  const value = intake.background.me.value;
  return (
    <>
      <div className={`${k.row} ${k.meHead}`}>
        <span className={`${k.av} ${k.av1}`} aria-hidden>{[...value.name][0] ?? ""}</span>
        <div className={k.grow}><b className={k.meName}>{value.name}</b>{value.headline ? <div className={k.lbl}>{value.headline}</div> : null}</div>
        <span className={k.chip}>{t(planFlowCopy.fromProfile)}</span>
      </div>
      <div className={`${k.lbl} ${k.fieldLbl}`}>{t(planFlowCopy.stanceQuestion)}</div>
      <div className={k.chips} role="group" aria-label={t(planFlowCopy.stanceLabel)}>
        {STANCES.map((stance) => (
          <button key={stance} type="button" aria-pressed={me.stance === stance} className={`btn ${k.fopt} ${me.stance === stance ? k.on : ""}`} onClick={() => onMe({ ...me, stance })}>{t(STANCE_COPY[stance])}</button>
        ))}
      </div>
      <div className={`${k.lbl} ${k.fieldLbl}`}>{t(planFlowCopy.wantsLabel)} <span className={`${k.chip} ${k.chipLav} ${k.chipGap}`}>{t(planFlowCopy.fromGoal)}</span></div>
      <label className={k.wantIn}>
        <input aria-label={t(planFlowCopy.wantsLabel)} value={me.wants} maxLength={300} onChange={(event) => onMe({ ...me, wants: event.target.value })} />
        <Icon name="pen" size={16} />
      </label>
    </>
  );
}

function TeamCard(props: BackgroundProps) {
  const { intake, t, language, team, onTeam } = props;
  const [adding, setAdding] = useState(false);
  const members = intake.background.team.value.members;
  const self = members.find((member) => member.isSelf) ?? null;
  const shown = team.mode === "solo" ? members.filter((member) => member.isSelf) : members;
  const capabilities = isGoalKind(intake.goalKind) ? PLAN_GOAL_TEMPLATES[intake.goalKind].capabilities : [];
  const drafts = new Map(team.members.map((member) => [member.memberId, member]));
  const gaps = teamGaps(intake.goalKind, team, self?.memberId ?? null);
  return (
    <div className={`${k.card} ${k.teamCard}`} data-plan-block="team" data-state="current">
      <div className={`${k.cardH} ${k.cardHTight}`}>
        <h3><span className={`${k.bsn} ${k.bsnInline}`}>2</span>{t(BLOCK_COPY.team)}</h3>
        <div className={k.seg} role="radiogroup" aria-label={t(planFlowCopy.teamMode)}>
          {(["solo", "team"] as const).map((mode) => (
            <button key={mode} type="button" role="radio" aria-checked={team.mode === mode} className={`btn ${k.segBtn} ${team.mode === mode ? k.segOn : ""}`} onClick={() => onTeam({ ...team, mode })}>
              {t(mode === "solo" ? planFlowCopy.teamSolo : planFlowCopy.teamTeam)}
            </button>
          ))}
        </div>
      </div>
      {capabilities.length ? (
        <table className={k.captab} data-plan-team-table="">
          <thead>
            <tr>
              <th scope="col">{t(planFlowCopy.capHead)} <span className={k.lbl}>{t(planFlowCopy.capFixed, { count: capabilities.length })}</span></th>
              {shown.map((member, index) => (
                <th key={member.memberId} scope="col">
                  <div className={`${k.row} ${k.capHead}`}><span className={`${k.av} ${k.avXs} ${AV_TONES[index % AV_TONES.length]}`} aria-hidden>{[...member.name][0] ?? ""}</span>{member.name.split(/\s/u)[0]}</div>
                  <span className={`${k.chip} ${SOURCE_TONE[member.source]}`}>{t(SOURCE_COPY[member.source])}</span>
                </th>
              ))}
              <th scope="col"><button type="button" className={`btn ${k.btn} ${k.sm} ${k.ghost} ${k.addCol}`} onClick={() => setAdding(true)} aria-label={t(planFlowCopy.addMember)}><Icon name="plus" size={16} />{t(planFlowCopy.addColumn)}</button></th>
              <th scope="col" />
            </tr>
          </thead>
          <tbody>
            {capabilities.map((capability) => {
              const count = coverCount(team, capability, self?.memberId ?? null);
              const gap = gaps.includes(capability);
              return (
                <tr key={capability} data-capability={capability} className={gap ? k.gapRow : undefined}>
                  <td><b>{capabilityLabel(capability, language)}</b></td>
                  {shown.map((member) => {
                    const on = Boolean(drafts.get(member.memberId)?.capabilities.includes(capability));
                    return (
                      <td key={member.memberId}>
                        <button type="button" className={`btn ${k.ckr} ${on ? k.ckrOn : ""}`} aria-pressed={on}
                          aria-label={t(planFlowCopy.toggleCapability, { capability: capabilityLabel(capability, language), name: member.name })}
                          onClick={() => onTeam(toggleCapability(team, member.memberId, capability))}>
                          <Icon name="check" size={16} />
                        </button>
                      </td>
                    );
                  })}
                  <td />
                  <td data-plan-cover="">{gap ? <span className={k.gapc}>{t(planFlowCopy.gap)}</span> : <span className={k.lbl}>{t(planFlowCopy.covered, { count })}</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : null}
      <div className={`${k.lbl} ${k.teamHint}`}>{t(planFlowCopy.teamHint)}</div>
      <AddMemberModal open={adding} onClose={() => setAdding(false)} {...props} gaps={gaps} />
    </div>
  );
}

function PurposeCard({ intake, t, purposeLevel, onPurpose, fallback }: BackgroundProps) {
  const [why, setWhy] = useState(false);
  const whyId = useId();
  const purpose = intake.background.purpose.value;
  const rungs = ladderRungs(purpose);
  const one = rungs.length === 1;
  return (
    <div className={`${k.card} ${k.stairCard}`} data-plan-block="purpose" data-state="current">
      <div className={`${k.cardH} ${k.cardHTight6}`}>
        <h3><span className={`${k.bsn} ${k.bsnInline}`}>3</span>{t(planFlowCopy.purposeQuestion)}</h3>
        <span className={`${k.chip} ${fallback ? "" : k.chipLav}`}>{t(fallback ? planFlowCopy.draftChip : planFlowCopy.checking)}</span>
      </div>
      <div className={`${k.lbl} ${k.stairLead}`}>{t(planFlowCopy.purposeHint)}</div>
      <ul className={k.stair} role="radiogroup" aria-label={t(planFlowCopy.purposeQuestion)}>
        {rungs.map((rung) => {
          const on = purposeLevel === rung.level;
          const suggested = purpose.suggestedLevel === rung.level && !one;
          const original = one || rung.level === 2;
          return (
            <li key={rung.level}>
              <button type="button" role="radio" aria-checked={on} className={`btn ${k.str} ${on ? k.strOn : ""}`} onClick={() => onPurpose(rung.level)}>
                <span className={k.lv}>{one ? 1 : rung.level}</span>
                <span className={k.stx}>
                  {rung.text}
                  {!one && rung.level === 4 ? <small>{t(planFlowCopy.rungBig)}</small>
                    : !one && rung.level === 1 ? <small>{t(planFlowCopy.rungSmall)}</small>
                    : suggested ? <span className={`${k.chip} ${k.chipLav}`}>{t(planFlowCopy.rungSuggested)}</span>
                    : original ? <span className={`${k.chip} ${k.chipBlue}`}>{t(planFlowCopy.rungOriginal)}</span> : null}
                </span>
                <span className={`${k.ckr} ${k.ckrSm} ${on ? k.ckrOn : ""}`} aria-hidden><Icon name="check" size={16} /></span>
              </button>
            </li>
          );
        })}
      </ul>
      {one ? (
        <div className={k.aisay}><span className={`${k.emo} ${k.emoPlain}`} aria-hidden>📝</span><span className={k.grow}>{t(planFlowCopy.stairOneNote)}</span></div>
      ) : purpose.reason ? (
        <>
          <div className={k.aisay}>
            <span className={`${k.emo} ${k.emoTeal}`} aria-hidden>🧭</span>
            <span className={k.grow}>{purpose.reason}</span>
            <button type="button" className={`btn ${k.why}`} aria-expanded={why} aria-controls={whyId} aria-label={t(planFlowCopy.purposeWhy)} onClick={() => setWhy(!why)}>?</button>
          </div>
          {why ? <div id={whyId} className={k.whyBody}>{t(planFlowCopy.purposeWhy)}</div> : null}
        </>
      ) : null}
    </div>
  );
}

/* ---------- メンバーを追加（人脈から選ぶ / 自分で書く） ---------- */

function AddMemberModal({ open, onClose, intake, t, language, onAddMembers, gaps }: BackgroundProps & { open: boolean; onClose: () => void; gaps: string[] }) {
  const [tab, setTab] = useState<"network" | "manual">("network");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PersonCandidate[] | null>(null);
  // The default list (no query yet): GET …/member-candidates — read-only, no AI, ranked like 空き.
  const [defaults, setDefaults] = useState<PlanMemberCandidatesResponse["candidates"] | null>(null);
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
    if (!open || defaults) return;
    let alive = true;
    void planApi<PlanMemberCandidatesResponse>(`/intakes/${encodeURIComponent(intake.intakeId)}/member-candidates`, { language }).then((result) => { if (alive && result.ok) setDefaults(result.data.candidates); });
    return () => { alive = false; };
  }, [open, defaults, intake.intakeId, language]);

  useEffect(() => {
    if (open) return;
    setQuery(""); setResults(null); setPicked([]); setName(""); setRelation(null); setCaps([]); setOther(""); setOtherOpen(false); setAlsoNetwork(false);
  }, [open]);

  const searched = rankCandidates((results ?? []).filter((candidate) => !existing.has(candidate.contactId)), gaps.map((id) => ({ id, label: capabilityLabel(id, language) })));
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

  const std = standardCopyFor(language);
  const searching = Boolean(query.trim());
  const ranked: { contactId: string; name: string; organization: string | null; role: string | null; cofounder: boolean; fills: string[]; capabilities: string[] }[] = searching
    ? searched.map((candidate) => ({ ...candidate, capabilities: [] }))
    : (defaults ?? []).filter((candidate) => !existing.has(candidate.contactId)).map((candidate) => ({ ...candidate, capabilities: [...candidate.capabilities], fills: candidate.fills.map((id) => capabilityLabel(id, language)) }));
  const pickedPerson = ranked.find((candidate) => candidate.contactId === picked[picked.length - 1]) ?? null;
  // b12 #140: the default list opens with the people already in the team (「メンバー」, not pickable), then the candidates.
  const members = searching ? [] : intake.background.team.value.members.filter((member) => !member.isSelf);
  return (
    <FlowDialog open={open} onClose={onClose} width={520} label={t(planFlowCopy.addMemberTitle)} data={{ "data-plan-add-modal": tab }}>
      <div className={k.row}>
        <div className={k.grow}><b className={k.addTitle}>{t(planFlowCopy.addMemberTitle)}</b><div className={k.lbl}>{t(planFlowCopy.addMemberSub)}</div></div>
        <button type="button" className={`btn ${k.lbtn}`} aria-label={std.action.close} onClick={onClose}><Icon name="x" size={16} /></button>
      </div>
      <Segmented<"network" | "manual"> variant="seg" wide className={k.addTabs} label={t(planFlowCopy.addMemberTabs)} value={tab} onChange={setTab}
        segments={(["network", "manual"] as const).map((key) => ({ key, label: t(key === "network" ? planFlowCopy.tabNetwork : planFlowCopy.tabManual) }))} />
      {tab === "network" ? (
        <div data-plan-add="network">
          <label className={k.input}><Icon name="search" size={16} /><input aria-label={t(planFlowCopy.searchPlaceholder)} placeholder={t(planFlowCopy.searchPlaceholder)} value={query} onChange={(event) => setQuery(event.target.value)} data-autofocus="" /></label>
          <div className={`${k.lbl} ${k.addHint}`}>{searching && results === null ? t(planFlowCopy.searchEmpty) : ranked.length === 0 ? t(searching ? planFlowCopy.searchNone : planFlowCopy.searchEmpty) : t(planFlowCopy.candidatesHint)}</div>
          {members.map((member, index) => (
            <div key={member.memberId} className={k.mem} data-plan-add-member={member.memberId}>
              <span className={`${k.av} ${AV_TONES[(index + 1) % AV_TONES.length]}`} aria-hidden>{[...member.name][0] ?? ""}</span>
              <div className={k.grow}><b className={k.memName}>{member.name}</b>{member.headline ? <div className={k.lbl}>{member.headline}</div> : null}</div>
              <span className={`${k.chip} ${k.chipLav}`}>{t(planFlowCopy.memberChip)}</span>
              <span className={k.ckr} aria-hidden><Icon name="check" size={16} /></span>
            </div>
          ))}
          {ranked.map((candidate, rank) => {
            const index = rank + members.length;
            const on = picked.includes(candidate.contactId);
            const fill = candidate.fills[0];
            return (
              <div key={candidate.contactId} className={k.mem}>
                <span className={`${k.av} ${AV_TONES[(index + 1) % AV_TONES.length]}`} aria-hidden>{[...candidate.name][0] ?? ""}</span>
                <div className={k.grow}><b className={k.memName}>{candidate.name}</b><div className={k.lbl}>{[candidate.organization, candidate.role].filter(Boolean).join(" · ")}</div></div>
                {candidate.cofounder ? <span className={`${k.chip} ${k.chipLav}`}>{t(planFlowCopy.cofounderChip)}</span> : fill ? <span className={`${k.chip} ${k.chipPink}`}>{t(planFlowCopy.gapChip, { label: fill })}</span> : null}
                <button type="button" role="checkbox" aria-checked={on} aria-label={candidate.name} className={`btn ${k.ckr} ${on ? k.ckrOn : ""}`}
                  onClick={() => setPicked((current) => !on ? (current.length >= 5 ? current : [...current, candidate.contactId]) : current.filter((id) => id !== candidate.contactId))}><Icon name="check" size={16} /></button>
              </div>
            );
          })}
          {pickedPerson && (pickedPerson.capabilities.length || pickedPerson.fills.length) ? (
            <div className={`${k.card} ${k.flat} ${k.addPrev}`} data-plan-add-preview="">
              <div className={k.row} style={{ gap: 6 }}><b className={`${k.addPrevTitle} ${k.grow}`}>{t(planFlowCopy.canDoOf, { name: pickedPerson.name })}</b><span className={`${k.chip} ${k.chipOnFlat}`}>{t(planFlowCopy.basisNetwork)}</span></div>
              <div className={`${k.chips} ${k.addPrevChips}`}>
                {pickedPerson.capabilities.length
                  ? capabilities.map((id) => <span key={id} className={`btn ${k.fopt} ${k.foptOnFlat} ${pickedPerson.capabilities.includes(id) ? k.on : ""}`}>{capabilityLabel(id, language)}</span>)
                  : pickedPerson.fills.map((label) => <span key={label} className={`btn ${k.fopt} ${k.on}`}>{label}</span>)}
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div data-plan-add="manual">
          <label className={k.fldLabel} htmlFor={nameId}>{t(planFlowCopy.nameLabel)}</label>
          <input id={nameId} className={k.wantInPlain} value={name} maxLength={80} onChange={(event) => setName(event.target.value)} data-autofocus="" />
          <div className={`${k.lbl} ${k.fieldLbl}`}>{t(planFlowCopy.relationLabel)}</div>
          <div className={k.chips} role="group" aria-label={t(planFlowCopy.relationLabel)}>
            {RELATIONS.map((key) => <button key={key} type="button" aria-pressed={relation === key} className={`btn ${k.fopt} ${relation === key ? k.on : ""}`} onClick={() => setRelation(key)}>{t(RELATION_COPY[key])}</button>)}
          </div>
          <div className={`${k.lbl} ${k.fieldLbl}`}>{t(planFlowCopy.canDoLabel)}</div>
          <div className={k.chips} role="group" aria-label={t(planFlowCopy.canDoLabel)}>
            {capabilities.map((capability) => {
              const on = caps.includes(capability);
              return <button key={capability} type="button" aria-pressed={on} className={`btn ${k.fopt} ${on ? k.on : ""}`} onClick={() => setCaps((current) => on ? current.filter((item) => item !== capability) : [...current, capability])}>{capabilityLabel(capability, language)}</button>;
            })}
            <button type="button" aria-pressed={otherOpen} className={`btn ${k.fopt} ${otherOpen ? k.on : k.foptDashed}`} onClick={() => setOtherOpen(!otherOpen)}>{t(planFlowCopy.otherCapability)}</button>
          </div>
          {otherOpen ? <input id={otherId} aria-label={t(planFlowCopy.otherPlaceholder)} className={`${k.wantInPlain} ${k.otherIn}`} value={other} placeholder={t(planFlowCopy.otherPlaceholder)} onChange={(event) => setOther(event.target.value)} /> : null}
          <div className={`${k.row} ${k.addSave}`}>
            <button type="button" role="switch" aria-checked={alsoNetwork} aria-label={t(planFlowCopy.alsoNetwork)} className={`btn ${k.tgl} ${alsoNetwork ? k.tglOn : ""}`} onClick={() => setAlsoNetwork(!alsoNetwork)} />
            <span className={`${k.grow} ${k.addSaveText}`}>{t(planFlowCopy.alsoNetwork)}<span className={`${k.lbl} ${k.blockLbl}`}>{t(planFlowCopy.alsoNetworkHint)}</span></span>
          </div>
        </div>
      )}
      <DialogActs hint={std.action.close}>
        <button type="button" className={`btn ${k.btn}`} onClick={onClose}>{std.action.cancel}</button>
        <button type="button" className={`btn ${k.btn} ${k.primary}`} disabled={!canSubmit || saving} aria-busy={saving || undefined} onClick={() => void submit()}>{tab === "network" ? t(planFlowCopy.addSelected, { count: picked.length }) : t(planFlowCopy.addManual)}</button>
      </DialogActs>
    </FlowDialog>
  );
}
