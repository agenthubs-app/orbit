"use client";

// R11a 連絡先詳細（Web 抽屉; web.html #7, b6 #41 深, b8 #13 1024 / #14 390 全屏, b12 #500–#507 招待 / 確認カード / 以前の値 / 解除）。
// 可复用组件（R10 首页会引用）：props 只收 contactId / onClose / 可选初始数据。
// 头部 · 人物タイプの確認カード（fit candidate）· なぜこの人か（value-lines）+ 下書きを作成 / 日程を提案（R20a MeetingProposalModal）·
// 招待でつながった人：本人入力的项目、同期停止（pausedFields）、あなたが共有 · 変更、⋯ › つながりを解除（Web 版 sheet，代定 6）·
// 力になれること / 求めていること（以前の値 ›）· やりとり。⋯：編集 / 共有する項目 / つながりを解除 / 削除。
// 联网增强（value-lines、fit、招待连接）失败或「尚未実装」时整块隐藏（G18）。
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { InviteConnectionView, InviteSharedFieldKey } from "../../../../../shared/contract/invite-codes";
import type { PlanContactFit } from "../../../../../shared/contract/plan-v2";
import { useOrbitLanguage } from "../../orbit-language-context";
import { MeetingProposalModal } from "../calendar/MeetingProposalModal";
import { networkCopy } from "../copy/network";
import { pickCopy } from "../copy/types";
import { Checkbox, ConfirmDialog, ContextMenu, Drawer, Icon, Modal, Toggle, fillCopy, useToast } from "../ui";
import { avatarTone, initials } from "../ui";
import { ContactEditDrawer } from "./ContactEditDrawer";
import { networkApi } from "./network-api";
import { tokyoMonthDay, regionLabel, type NetworkCityKey } from "./network-model";
import styles from "./network.module.css";

type Key = keyof typeof networkCopy;
export type NetworkT = (key: Key, values?: Readonly<Record<string, string | number>>) => string;
export function useNetworkT(): NetworkT {
  const { language } = useOrbitLanguage();
  return useCallback((key, values) => fillCopy(pickCopy(networkCopy[key], language), values ?? {}), [language]);
}

interface HistoryEntry { field: string; previous: string | null; next: string | null; source: string; at: string }
export interface DrawerContact {
  id: string; displayName: string; organization: string; role: string; status: string;
  primaryIndustryId?: string; secondaryIndustryId?: string; primaryIndustryLabel?: string; seniorityLevel?: string;
  region?: { countryCode: string; city?: string | null }; primaryEmail: string; primaryPhone: string; nextAction: string; tags: string[];
  offering: string[]; seeking: string[]; notes: { id: string; body: string; title: string; createdAt: string }[];
  lastInteraction: { occurredAt: string; summary: string } | null; fieldHistory: HistoryEntry[]; updatedAt: string; cardNotes?: string;
}

const str = (value: unknown) => (typeof value === "string" ? value : "");
const list = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim() !== "") : []);

export function drawerContactFrom(payload: Record<string, unknown> | null | undefined): DrawerContact | null {
  if (!payload) return null;
  const raw = (typeof payload.contact === "object" && payload.contact !== null ? payload.contact : payload) as Record<string, unknown>;
  if (typeof raw.id !== "string" || typeof raw.displayName !== "string") return null;
  const profile = (typeof raw.publicProfile === "object" && raw.publicProfile !== null ? raw.publicProfile : {}) as Record<string, unknown>;
  const fallback = new Set(list(profile.fallbackFields));
  const last = (typeof raw.lastInteraction === "object" && raw.lastInteraction !== null ? raw.lastInteraction : null) as Record<string, unknown> | null;
  return {
    id: raw.id, displayName: raw.displayName, organization: str(raw.organization), role: str(raw.role), status: str(raw.status) || "active",
    ...(str(raw.primaryIndustryId) ? { primaryIndustryId: str(raw.primaryIndustryId) } : {}),
    ...(str(raw.secondaryIndustryId) ? { secondaryIndustryId: str(raw.secondaryIndustryId) } : {}),
    ...(str(raw.primaryIndustryLabel) ? { primaryIndustryLabel: str(raw.primaryIndustryLabel) } : {}),
    ...(str(raw.seniorityLevel) ? { seniorityLevel: str(raw.seniorityLevel) } : {}),
    ...(typeof raw.region === "object" && raw.region !== null ? { region: raw.region as { countryCode: string; city?: string | null } } : {}),
    primaryEmail: str(raw.primaryEmail), primaryPhone: str(raw.primaryPhone), nextAction: str(raw.nextAction), tags: list(raw.tags),
    offering: fallback.has("offering") ? [] : list(profile.offering), seeking: fallback.has("seeking") ? [] : list(profile.seeking),
    notes: (Array.isArray(raw.notes) ? raw.notes : []).flatMap((item) => {
      const note = item as Record<string, unknown>;
      const body = str(note.body).trim();
      return body ? [{ id: str(note.noteId) || body.slice(0, 20), body, title: str(note.title), createdAt: str(note.createdAt) || str(note.occurredAt) }] : [];
    }),
    lastInteraction: last && str(last.occurredAt) && str(last.summary) ? { occurredAt: str(last.occurredAt), summary: str(last.summary) } : null,
    fieldHistory: (Array.isArray(raw.fieldHistory) ? raw.fieldHistory : []).flatMap((item) => {
      const entry = item as Record<string, unknown>;
      return typeof entry.field === "string" && typeof entry.at === "string" ? [{ field: entry.field, previous: typeof entry.previous === "string" ? entry.previous : null, next: typeof entry.next === "string" ? entry.next : null, source: str(entry.source), at: entry.at }] : [];
    }),
    updatedAt: str(raw.updatedAt),
    ...(str(raw.cardNotes) ? { cardNotes: str(raw.cardNotes) } : {}),
  };
}

const STATUS_KEY: Record<string, Key> = { active: "statusActive", nurture: "statusNurture", needs_follow_up: "statusNeedsFollowUp", archived: "statusArchived" };
const FIELD_KEY: Record<string, Key> = { displayName: "detailFieldName", organization: "detailFieldCompany", role: "detailFieldRole", email: "detailFieldEmail", phone: "detailFieldPhone", offering: "detailFieldOffering", seeking: "detailFieldSeeking" };
const SHARE_KEYS: readonly InviteSharedFieldKey[] = ["organization", "email", "phone", "offering", "seeking"];

export function ContactAvatar({ name, large = false }: { name: string; large?: boolean }) {
  return <span className={`${styles.avatar} ${styles[`a_${avatarTone(name)}`]} ${large ? styles.avatarLg : ""}`} aria-hidden>{initials(name)}</span>;
}

export interface ContactDrawerProps {
  contactId: string | null;
  onClose: () => void;
  /** Already-loaded detail read (skips the first GET). */
  initial?: Record<string, unknown> | null;
  /** The list changed (saved, deleted, unlinked). */
  onChanged?: (event: { kind: "saved" | "deleted" | "unlinked"; contactId: string; name: string }) => void;
  /** Plan link for the why card chip (from goal-related-ids). */
  goalLabel?: string | null;
}

export function ContactDrawer({ contactId, onClose, initial = null, onChanged, goalLabel = null }: ContactDrawerProps) {
  const t = useNetworkT();
  const { language } = useOrbitLanguage();
  const toast = useToast();
  const [payload, setPayload] = useState<Record<string, unknown> | null>(initial);
  const [failed, setFailed] = useState(false);
  const [valueLine, setValueLine] = useState<{ relation?: string | null; evidence?: string[] } | null>(null);
  const [fit, setFit] = useState<PlanContactFit | null>(null);
  const [connection, setConnection] = useState<InviteConnectionView | null>(null);
  const [whyOpen, setWhyOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [unlinkOpen, setUnlinkOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [proposalOpen, setProposalOpen] = useState(false);
  const [openHistory, setOpenHistory] = useState<string | null>(null);
  const menuAnchor = useRef<HTMLButtonElement>(null);

  const load = useCallback(async (id: string) => {
    const result = await networkApi.detail(id);
    if (result.ok) { setPayload(result.data); setFailed(false); } else setFailed(true);
  }, []);
  useEffect(() => {
    if (!contactId) return;
    setValueLine(null); setFit(null); setConnection(null); setWhyOpen(false);
    if (!initial) void load(contactId);
    const lang = language === "zh" ? "zh" : "en";
    void networkApi.valueLine(contactId, lang).then((result) => { if (result.ok) setValueLine(result.data.lines.find((line) => line.contactId === contactId) ?? null); });
    void networkApi.fit(contactId).then((result) => { if (result.ok && Array.isArray(result.data?.fits)) setFit(result.data); });
    void networkApi.connection(contactId).then((result) => { if (result.ok) setConnection(result.data); });
  }, [contactId, initial, language, load]);

  const contact = useMemo(() => drawerContactFrom(payload), [payload]);
  const candidate = fit?.fits.find((item) => item.status === "candidate") ?? null;
  if (!contactId) return null;
  const title = contact?.displayName ?? t("detailLoadFailed");
  const history = (field: string) => (contact?.fieldHistory ?? []).filter((entry) => entry.field === field && entry.previous !== null).slice().reverse();
  const city = contact?.region?.city ? regionLabel(contact.region.city, (key: NetworkCityKey) => t(`city${key}` as Key), "") : "";
  const decide = async (decision: "accept" | "dismiss") => {
    if (!candidate) return;
    const result = await networkApi.decide(candidate.planId, candidate.itemId, contactId, decision);
    if (result.ok) { setFit((current) => current ? { ...current, fits: current.fits.filter((item) => item.itemId !== candidate.itemId) } : current); toast.success(t("detailFitDone")); }
    else toast.error(t("detailFitFailed"));
  };
  const remove = async () => {
    setDeleteOpen(false);
    if (!contact) return;
    const result = await networkApi.remove(contactId);
    if (!result.ok) { toast.error(t("deleteFailed")); return; }
    onChanged?.({ kind: "deleted", contactId, name: contact.displayName });
    onClose();
  };
  const self = connection !== null;
  const nextStep = contact?.nextAction.trim() ?? "";
  const draftHref = contact ? `/app/agent?prefill=${encodeURIComponent(t("detailDraftIntent", { name: contact.displayName, step: nextStep }))}` : "#";

  return (
    <>
      <Drawer open onClose={onClose} title={title} size="lg" fullOnPhone bare>
        <div className={styles.drawer} data-contact-drawer={contactId}>
          <div className={styles.drawerTop}>
            <button type="button" className={`btn ${styles.rbtn}`} onClick={onClose} aria-label={t("drawerClose")}><Icon name="x" size={20} /></button>
            <div className={styles.row}>
              <a className={`btn ${styles.rbtn}`} href={`/app/contacts/${encodeURIComponent(contactId)}`} aria-label={t("drawerOpenPage")}><Icon name="out" size={20} /></a>
              <button ref={menuAnchor} type="button" className={`btn ${styles.rbtn}`} onClick={() => setMenuOpen(true)} aria-label={t("detailMore")}><Icon name="more" size={20} /></button>
            </div>
          </div>
          {!contact ? (failed ? <p className={styles.lbl}>{t("detailLoadFailed")}</p> : null) : (
            <>
              <div className={styles.row}>
                <ContactAvatar name={contact.displayName} large />
                <div className={styles.grow}>
                  <div className={styles.name}>{contact.displayName}</div>
                  {contact.organization || contact.role ? <div className={styles.sub}>{[contact.organization, contact.role].filter(Boolean).join(" · ")}</div> : null}
                  {self ? (
                    <div className={styles.chips}><span className={styles.dn} aria-hidden><i className={styles.on} /><i className={styles.on} /><i className={styles.on} /></span><span className={`${styles.chip} ${styles.chipTeal}`}>{t("chipSelf")}</span></div>
                  ) : (
                    <div className={styles.chips}>
                      <span className={`${styles.chip} ${styles.chipLav}`}>{t(STATUS_KEY[contact.status] ?? "statusActive")}</span>
                      {contact.primaryIndustryLabel ? <span className={styles.chip}>{contact.primaryIndustryLabel}</span> : null}
                      {city ? <span className={styles.chip}>{city}</span> : null}
                    </div>
                  )}
                  {self ? <div className={styles.lbl}>{t("detailSelfHint")}</div> : null}
                </div>
              </div>

              {candidate ? (
                <div className={`${styles.card} ${styles.confirm}`} data-network-fit="">
                  <div className={styles.row}><span className={`${styles.emo} ${styles.emoSm} ${styles.t_apricot}`}>{candidate.emoji || "🎯"}</span><b className={styles.grow}>{t("detailFitTitle", { label: candidate.shortLabel })}</b>
                    {candidate.reason ? <button type="button" className={styles.why} onClick={() => setWhyOpen((value) => !value)} aria-expanded={whyOpen}>?</button> : null}</div>
                  {whyOpen && candidate.reason ? <div className={styles.whyBody}>{t("detailWhyBasis", { basis: candidate.reason })}</div> : null}
                  <div className={styles.row} style={{ marginTop: 10 }}>
                    <button type="button" className={`btn ${styles.btn} ${styles.primary} ${styles.sm}`} onClick={() => void decide("accept")}>{t("detailFitYes")}</button>
                    <button type="button" className={`btn ${styles.btn} ${styles.sm}`} onClick={() => void decide("dismiss")}>{t("detailFitNo")}</button>
                  </div>
                </div>
              ) : null}

              {!self && (valueLine?.relation || nextStep || goalLabel) ? (
                <div className={styles.card} data-network-why="">
                  <div className={styles.row}><span className={`${styles.emo} ${styles.emoSm} ${styles.t_pink}`}>🎯</span><b className={styles.grow}>{t("detailWhyTitle", { name: contact.displayName })}</b>
                    {valueLine?.evidence?.length ? <button type="button" className={styles.why} onClick={() => setWhyOpen((value) => !value)} aria-expanded={whyOpen}>?</button> : null}</div>
                  {valueLine?.relation ? <div style={{ marginTop: 8 }}>{valueLine.relation}</div> : nextStep ? <div style={{ marginTop: 8 }}>{nextStep}</div> : null}
                  {whyOpen && valueLine?.evidence?.length ? <div className={styles.whyBody} style={{ marginTop: 8 }}>{t("detailWhyBasis", { basis: valueLine.evidence.map((label) => evidenceLabel(label, t)).join(" · ") })}</div> : null}
                  {goalLabel ? <div className={styles.chips}><span className={`${styles.chip} ${styles.chipLav}`}>{t("detailPlanChip", { label: goalLabel })}</span></div> : null}
                  <div className={styles.row} style={{ marginTop: 12, gap: 8, flexWrap: "wrap" }}>
                    <a className={`btn ${styles.btn} ${styles.primary}`} href={draftHref}><Icon name="mail" size={16} />{t("detailDraft")}</a>
                    <button type="button" className={`btn ${styles.btn}`} onClick={() => setProposalOpen(true)}><Icon name="calendar" size={16} />{t("proposeShort")}</button>
                    <span className={styles.lbl} style={{ marginLeft: "auto" }}>{t("detailNoSend")}</span>
                  </div>
                </div>
              ) : null}

              {self && connection ? (
                <div className={styles.card} data-network-invite="">
                  {(["organization", "role", "email", "offering", "seeking"] as const).map((field) => {
                    const value = field === "organization" ? contact.organization : field === "role" ? contact.role : field === "email" ? contact.primaryEmail : field === "offering" ? contact.offering.join(" · ") : contact.seeking.join(" · ");
                    if (!value) return null;
                    const paused = (connection.pausedFields as readonly string[]).includes(field);
                    return (
                      <div key={field} className={styles.frow}>
                        <span className={styles.frowKey}>{t(FIELD_KEY[field] ?? "detailFieldRole")}</span>
                        <span className={styles.frowValue}>{value}{paused ? <div className={styles.lbl}>{t("detailPausedHint")}</div> : null}</span>
                        <span className={`${styles.chip} ${paused ? styles.chipApricot : styles.chipTeal}`}>{paused ? t("detailPaused") : t("detailSelfChip")}</span>
                      </div>
                    );
                  })}
                  <div className={styles.frow}><span className={styles.frowKey}>{t("detailConnectedVia")}</span><span className={styles.frowValue}>{t("detailConnectedViaValue", { code: connection.via.code, date: tokyoMonthDay(connection.connectedAt) })}</span></div>
                  <div className={styles.frow}><span className={styles.frowKey}>{t("sharedByYou")}</span><span className={styles.frowValue}>{connection.sharedByMe.map((key) => t(`shareKey_${key}` as Key)).join(" · ") || "—"}</span>
                    <button type="button" className={styles.more} onClick={() => setShareOpen(true)}>{t("shareChange")}</button></div>
                </div>
              ) : null}

              {contact.offering.length || contact.seeking.length ? (
                <div className={styles.grid2}>
                  {(["offering", "seeking"] as const).map((field) => (
                    <div key={field} className={styles.card}>
                      <div className={styles.lbl}>{t(field === "offering" ? "detailOffering" : "detailSeeking")}</div>
                      <b>{(field === "offering" ? contact.offering : contact.seeking).join(" · ") || "—"}</b>
                      {history(field).length ? <button type="button" className={styles.more} onClick={() => setOpenHistory(openHistory === field ? null : field)}>{t("previousLink")}</button> : null}
                      {openHistory === field ? <PreviousList entries={history(field)} t={t} /> : null}
                    </div>
                  ))}
                </div>
              ) : null}

              {(["displayName", "organization", "role", "email", "phone"] as const).some((field) => history(field).length) ? (
                <div className={styles.card} data-network-previous="">
                  {(["displayName", "organization", "role", "email", "phone"] as const).filter((field) => history(field).length).map((field) => (
                    <div key={field}>
                      <div className={styles.frow}><span className={styles.frowKey}>{t(FIELD_KEY[field] ?? "detailFieldRole")}</span><span className={styles.frowValue}>{history(field)[0]!.next ?? "—"}</span>
                        <button type="button" className={styles.more} onClick={() => setOpenHistory(openHistory === field ? null : field)}>{t("previousLink")}</button></div>
                      {openHistory === field ? <PreviousList entries={history(field)} t={t} /> : null}
                    </div>
                  ))}
                </div>
              ) : null}

              <div className={styles.card} data-network-interactions="">
                <div className={styles.cardH}><h3>{t("detailInteractions")}</h3><a className={styles.more} href={`/app/notes/new?contactId=${encodeURIComponent(contactId)}`}>{t("detailAddMemo")}</a></div>
                {contact.notes.length || contact.lastInteraction ? (
                  <>
                    {contact.lastInteraction && !contact.notes.some((note) => note.body === contact.lastInteraction!.summary) ? <div className={styles.tl}><time>{tokyoMonthDay(contact.lastInteraction.occurredAt)}</time><div>{contact.lastInteraction.summary}</div></div> : null}
                    {[...contact.notes].sort((left, right) => (left.createdAt < right.createdAt ? 1 : -1)).slice(0, 8).map((note) => (
                      <div key={note.id} className={styles.tl}><time>{tokyoMonthDay(note.createdAt)}</time><div>{note.title ? <b>{note.title}</b> : null}<div className={note.title ? styles.lbl : undefined}>{note.body}</div></div></div>
                    ))}
                  </>
                ) : <p className={styles.lbl}>{t("detailNoInteractions")}</p>}
              </div>
            </>
          )}
        </div>
      </Drawer>
      <ContextMenu open={menuOpen} onClose={() => setMenuOpen(false)} anchor={menuAnchor} label={t("detailMore")}
        items={[
          { key: "edit", label: t("detailEdit"), onSelect: () => setEditOpen(true) },
          ...(connection ? [{ key: "share", label: t("detailShare"), onSelect: () => setShareOpen(true) }, { key: "unlink", label: t("detailUnlink"), destructive: true, onSelect: () => setUnlinkOpen(true) }] : []),
          { key: "delete", label: t("detailDelete"), destructive: true, onSelect: () => setDeleteOpen(true) },
        ]} />
      {contact && editOpen ? <ContactEditDrawer contact={contact} onClose={() => setEditOpen(false)} onDelete={() => { setEditOpen(false); setDeleteOpen(true); }}
        onSaved={() => { setEditOpen(false); void load(contactId); onChanged?.({ kind: "saved", contactId, name: contact.displayName }); }} /> : null}
      {contact ? <ConfirmDialog open={deleteOpen} destructive icon="trash" title={t("deleteTitle", { name: contact.displayName })}
        message={t("deleteBody", { interactions: contact.lastInteraction ? 1 : 0, memos: contact.notes.length })}
        confirmLabel={t("deleteConfirm")} cancelLabel={t("deleteCancel")} onConfirm={() => void remove()} onCancel={() => setDeleteOpen(false)} /> : null}
      {contact && connection ? <InviteUnlinkModal open={unlinkOpen} name={contact.displayName} contactId={contactId} onClose={() => setUnlinkOpen(false)}
        onUnlinked={() => { setUnlinkOpen(false); setConnection(null); onChanged?.({ kind: "unlinked", contactId, name: contact.displayName }); }} /> : null}
      {contact && connection ? <InviteShareModal open={shareOpen} name={contact.displayName} connection={connection} onClose={() => setShareOpen(false)} onSaved={(next) => { setShareOpen(false); setConnection(next); }} /> : null}
      <MeetingProposalModal open={proposalOpen} contactId={contactId} onClose={() => setProposalOpen(false)} />
    </>
  );
}

function evidenceLabel(label: string, t: NetworkT): string {
  if (label === "card") return t("detailEvidenceCard");
  if (label === "entry") return t("detailEvidenceEntry");
  if (label.startsWith("memo:")) return t("detailEvidenceMemo", { title: label.slice(5) });
  if (label.startsWith("need:")) return t("detailEvidenceNeed", { title: label.slice(5) });
  return label;
}

function PreviousList({ entries, t }: { entries: HistoryEntry[]; t: NetworkT }) {
  const source = (value: string) => value === "manual" ? t("detailSourceManual") : value.startsWith("invite") ? t("detailSourceInvite") : value === "completion" ? t("detailSourceCompletion") : value;
  return <div>{entries.map((entry) => <div key={`${entry.at}-${entry.previous}`} className={styles.prev}><span className={styles.strike}>{entry.previous}</span><div className={styles.lbl}>{`${tokyoMonthDay(entry.at)} · ${source(entry.source)}`}</div></div>)}</div>;
}

/** b12 #506 W-R11-04: つながりを解除 · 確認 (480 Modal; App is the R15 bottom sheet). 「名前と会社だけの連絡先として残す」 on by default. */
export function InviteUnlinkModal({ open, name, contactId, onClose, onUnlinked }: { open: boolean; name: string; contactId: string; onClose: () => void; onUnlinked: () => void }) {
  const t = useNetworkT();
  const toast = useToast();
  const [keep, setKeep] = useState(true);
  const [busy, setBusy] = useState(false);
  const confirm = async () => {
    setBusy(true);
    const result = await networkApi.unlink(contactId, keep);
    setBusy(false);
    if (result.ok) { toast.success(t("unlinkDone")); onUnlinked(); } else toast.error(t("unlinkFailed"));
  };
  return (
    <Modal open={open} onClose={onClose} title={t("unlinkTitle", { name })} size={480}
      actions={<><button type="button" className={`btn ${styles.btn}`} onClick={onClose}>{t("deleteCancel")}</button><button type="button" className={`btn ${styles.btn} ${styles.danger}`} onClick={() => void confirm()} disabled={busy}>{t("unlinkConfirm")}</button></>}>
      <div data-network-unlink="">
        <div className={styles.row}><ContactAvatar name={name} /><span className={styles.lbl}>{t("unlinkSub")}</span></div>
        <div className={styles.effects}>{(["unlinkEffect1", "unlinkEffect2", "unlinkEffect3"] as const).map((key) => <div key={key} className={styles.effect}>{t(key)}</div>)}</div>
        <div className={styles.row}><Checkbox checked={keep} onChange={setKeep} label={t("unlinkKeep")} /><span>{t("unlinkKeep")}</span></div>
      </div>
    </Modal>
  );
}

/** 共有する項目 (Web; App = R15 InviteShareSheet): name always, then a switch per key my profile can share. */
export function InviteShareModal({ open, name, connection, onClose, onSaved }: { open: boolean; name: string; connection: InviteConnectionView; onClose: () => void; onSaved: (next: InviteConnectionView) => void }) {
  const t = useNetworkT();
  const toast = useToast();
  const [keys, setKeys] = useState<InviteSharedFieldKey[]>([...connection.sharedByMe]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setKeys([...connection.sharedByMe]); }, [open, connection.sharedByMe]);
  const save = async () => {
    setBusy(true);
    const result = await networkApi.updateShare(connection.contactId, keys);
    setBusy(false);
    if (result.ok) { toast.success(t("shareSaved")); onSaved(result.data); } else toast.error(t("shareFailed"));
  };
  return (
    <Modal open={open} onClose={onClose} title={t("shareTitle", { name })} size={480}
      actions={<><button type="button" className={`btn ${styles.btn}`} onClick={onClose}>{t("deleteCancel")}</button><button type="button" className={`btn ${styles.btn} ${styles.primary}`} onClick={() => void save()} disabled={busy}>{t("shareSave")}</button></>}>
      <div data-network-share="">
        <div className={styles.frow}><span className={styles.frowValue}>{t("shareName")}</span></div>
        {SHARE_KEYS.map((key) => (
          <div key={key} className={styles.frow}>
            <span className={styles.frowValue}>{t(`shareKey_${key}` as Key)}</span>
            <Toggle checked={keys.includes(key)} onChange={(on) => setKeys(on ? [...keys, key] : keys.filter((item) => item !== key))} label={t(`shareKey_${key}` as Key)} />
          </div>
        ))}
      </div>
    </Modal>
  );
}
