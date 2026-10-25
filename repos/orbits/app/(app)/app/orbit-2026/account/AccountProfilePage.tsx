"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

import type { ManualProfileUpdateInput, ProfilePayload } from "../../../../../features/profile/contract";
import { profileBioWithinLimit } from "../../../../../shared/api-schema/profile-bio";
import type { ManualProfileContract, ProfilePublicFieldsContract } from "../../../../../shared/contract/profile";
import { useOrbitLanguage } from "../../orbit-language-context";
import { SEEK_OPTIONS } from "../../profile/profile-tag-options";
import { eventsApi } from "../events/events-api";
import { accountCopy } from "../copy/account";
import { pickCopy } from "../copy/types";
import { InviteCodeModal } from "../add/invite/InviteCodeModal";
import { Button, Chip, Icon, MacTile, Toggle } from "../ui";
import { AccountLayout, type AccountSection } from "./AccountLayout";
import { validSaveReceipt } from "./SuggestionsApi";
import { cardProgress, previewForProfile, profileSaveInput, type CardKey } from "./profile-model";
import { normalizeProfileTagValues } from "./profile-tag-normalization";
import s from "./AccountProfilePage.module.css";

type Envelope = { success: boolean; data?: ProfilePayload };
type Draft = { organization: string; role: string; offering: string; seeking: string; bio: string; publicFields: ProfilePublicFieldsContract };
type EventSummary = { hosted: number; active: number; attending: number };

const defaultVisibility: ProfilePublicFieldsContract = { companyRole: true, offeringSeeking: true, intro: true };

function draftOf(profile: ManualProfileContract): Draft {
  return {
    organization: profile.organization, role: profile.role,
    offering: profile.offering?.join("\n") ?? "", seeking: profile.seeking?.join("\n") ?? "",
    bio: profile.bio ?? "", publicFields: { ...defaultVisibility, ...profile.publicFields },
  };
}

function lines(value: string): string[] {
  return normalizeProfileTagValues(value.split("\n")).slice(0, 5);
}

function editOf(draft: Draft): ManualProfileUpdateInput {
  return {
    organization: draft.organization.trim(), role: draft.role.trim(),
    offering: lines(draft.offering), seeking: lines(draft.seeking), bio: draft.bio.trim(),
    publicFields: draft.publicFields,
  };
}

/** b12 W-R18a-01 rail: 公開プレビュー card, 提供 / 求め chips, 公開する項目 toggles (contacts stay exchange-only). */
function ProfilePreview({ profile, draft, t, onVisibility, busy }: { profile: ManualProfileContract; draft: Draft | null; t: (key: keyof typeof accountCopy) => string; onVisibility: (fields: ProfilePublicFieldsContract) => void; busy: boolean }) {
  const projected = previewForProfile(draft ? { ...profile, ...editOf(draft) } : profile);
  const visibility = { ...defaultVisibility, ...(draft?.publicFields ?? profile.publicFields) };
  const chips = (values: readonly string[] | undefined, tone: "lav" | "pink") => values?.length
    ? <div className={s.chips}>{values.map(value => <Chip key={value} label={value} tone={tone} />)}</div>
    : <span className={s.muted}>{t("previewHidden")}</span>;
  return <section className={s.preview} aria-label={t("preview")}>
    <h2 className={s.previewHeading}><Icon name="user" size={16} />{t("preview")}<span>{t("previewSub")}</span></h2>
    <div className={`${s.previewCard} ${s.previewIdentity}`}>
      <span className={s.avatar}>{projected.displayName.slice(0, 1)}</span>
      <strong>{projected.displayName}</strong>
      {projected.organization || projected.role ? <span>{[projected.organization, projected.role].filter(Boolean).join(" · ")}</span> : null}
      {projected.bio ? <p>{projected.bio}</p> : null}
    </div>
    <div className={s.previewCard}>
      <small>{t("whatOffer")}</small>{chips(projected.offering, "lav")}
      <small className={s.seekLabel}>{t("whatSeek")}</small>{chips(projected.seeking, "pink")}
    </div>
    {!profile.offering?.length ? <div className={s.publicNotice}>{t("publicNotice")}</div> : null}
    <div className={s.previewCard}>
      <small className={s.visibilityLabel}>{t("visibility")}</small>
      {(["companyRole", "offeringSeeking", "intro"] as const).map(key => <div className={s.visibilityRow} key={key}><span>{t(key)}</span>
        <Toggle checked={visibility[key]} label={t(key)} disabled={busy} onChange={next => onVisibility({ ...visibility, [key]: next })} /></div>)}
      <div className={s.visibilityRow}><span>{t("contactsAfterExchangeShort")}</span><Toggle checked={false} label={t("contactsAfterExchangeShort")} disabled onChange={() => undefined} /></div>
    </div>
  </section>;
}

function ProfileContent({ initialPayload, design, active = "profile", edit, suggestions = [], eventSummary }: { initialPayload?: ProfilePayload; design?: "25" | "50" | "100"; active?: AccountSection; edit?: string; suggestions?: readonly string[]; eventSummary?: EventSummary }) {
  const { language } = useOrbitLanguage();
  const t = (key: keyof typeof accountCopy) => pickCopy(accountCopy[key], language);
  const [payload, setPayload] = useState<ProfilePayload | null>(initialPayload ?? null);
  const [loading, setLoading] = useState(!initialPayload);
  const [readError, setReadError] = useState<"unauthorized" | "failed" | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dismissed, setDismissed] = useState<readonly string[]>([]);
  const [liveSuggestions, setLiveSuggestions] = useState<string[]>([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [attendingCount, setAttendingCount] = useState<number | null | undefined>(eventSummary?.attending);
  const [hostedCount, setHostedCount] = useState<number | null | undefined>(eventSummary?.hosted);
  const [activeCount, setActiveCount] = useState<number>(eventSummary?.active ?? 0);
  const openedFromRoute = useRef(false);
  const pendingSave = useRef<{ fingerprint: string; id: string } | null>(null);
  const readVersion = useRef(0);

  const profileUrl = design ? `/api/profile?design=${design}` : "/api/profile";
  const load = useCallback(async () => {
    const version = ++readVersion.current;
    setLoading(true);
    setReadError(null);
    setPayload(null);
    setDraft(null);
    setSaved(false);
    pendingSave.current = null;
    try {
      const response = await fetch(profileUrl, { cache: "no-store" });
      if (version !== readVersion.current) return;
      if (!response.ok) {
        setReadError(response.status === 401 ? "unauthorized" : "failed");
        return;
      }
      const envelope = await response.json() as Envelope;
      if (version !== readVersion.current) return;
      if (!envelope.success || !envelope.data?.profile) setReadError("failed");
      else setPayload(envelope.data);
    } catch { if (version === readVersion.current) setReadError("failed"); }
    finally { if (version === readVersion.current) setLoading(false); }
  }, [profileUrl]);

  useEffect(() => { if (!initialPayload) void load(); return () => { readVersion.current += 1; }; }, [initialPayload, load]);
  useEffect(() => {
    if (eventSummary) return;
    let alive = true;
    void eventsApi.mine("upcoming", 1).then(result => {
      if (alive && result.ok) setAttendingCount(result.data.upcomingCount);
      else if (alive) setAttendingCount(null);
    });
    void fetch("/api/events/center?summary=1").then(response => response.ok ? response.json() : null).then(body => {
      const value = body?.data?.eventCount;
      if (alive) {
        setHostedCount(typeof value === "number" && Number.isFinite(value) ? value : null);
        setActiveCount(typeof body?.data?.activeCount === "number" ? body.data.activeCount : 0);
      }
    }).catch(() => { if (alive) setHostedCount(null); });
    return () => { alive = false; };
  }, [eventSummary]);

  const profile = payload?.profile;
  const profileId = profile?.id;
  const needsCandidates = Boolean(profile?.offering?.length && !profile.seeking?.length);
  useEffect(() => {
    if (!profileId || !needsCandidates || design || suggestions.length || language === "ja") {
      setLiveSuggestions([]);
      return;
    }
    const controller = new AbortController();
    setLiveSuggestions([]);
    void fetch("/api/profile/seek-suggestions", {
      method: "POST", headers: { "content-type": "application/json" }, signal: controller.signal,
      body: JSON.stringify({ language, candidates: SEEK_OPTIONS.map(option => option[language]) }),
    }).then(async response => {
      const envelope = await response.json() as { success?: boolean; data?: { suggestions?: unknown } };
      if (!controller.signal.aborted && response.ok && envelope.success && Array.isArray(envelope.data?.suggestions)) {
        setLiveSuggestions(envelope.data.suggestions.filter((value): value is string => typeof value === "string" && Boolean(value.trim())).slice(0, 5));
      }
    }).catch(() => { if (!controller.signal.aborted) setLiveSuggestions([]); });
    return () => controller.abort();
  }, [profileId, needsCandidates, design, suggestions.length, language]);
  useEffect(() => {
    if (profile && edit && !openedFromRoute.current) {
      openedFromRoute.current = true;
      setDraft(draftOf(profile));
    }
  }, [profile, edit]);
  const progress = payload ? cardProgress(payload.completeness) : null;
  const missingLabels: Record<CardKey, keyof typeof accountCopy> = { companyRole: "companyRole", offering: "canHelp", seeking: "whatSeek", intro: "intro" };
  const introValid = !draft || profileBioWithinLimit(draft.bio);

  async function persistEdit(edit: ManualProfileUpdateInput): Promise<boolean> {
    if (!profile || saving) return false;
    setSaving(true);
    setSaveError(false);
    try {
      const fingerprint = JSON.stringify({ updatedAt: profile.updatedAt, edit });
      if (pendingSave.current?.fingerprint !== fingerprint) pendingSave.current = { fingerprint, id: crypto.randomUUID() };
      const response = await fetch(profileUrl, {
        method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify(profileSaveInput(profile, edit, pendingSave.current.id)),
      });
      const envelope = await response.json() as Envelope;
      if (!response.ok || !envelope.success || !validSaveReceipt(envelope.data, profile, edit, pendingSave.current.id)) throw new Error("save failed");
      setPayload(envelope.data);
      pendingSave.current = null;
      setSaved(true);
      return true;
    } catch { setSaveError(true); return false; }
    finally { setSaving(false); }
  }

  async function save() {
    if (!draft || !introValid) return;
    if (await persistEdit(editOf(draft))) setDraft(null);
  }

  async function acceptSuggestion(value: string) {
    if (!profile) return;
    await persistEdit({ seeking: [...(profile.seeking ?? []), value] });
  }

  const preview = profile ? <ProfilePreview profile={profile} draft={draft} t={t} busy={saving} onVisibility={fields => { if (draft) setDraft({ ...draft, publicFields: fields }); else void persistEdit({ publicFields: fields }); }} /> : null;
  const visibleSuggestions = suggestions.length ? suggestions : liveSuggestions;
  const pending = profile && !profile.seeking?.length ? visibleSuggestions.filter(value => !dismissed.includes(value)) : [];
  return <AccountLayout active={active} title={t("profile")} subtitle={t("profileIntro")} rightRail={preview}>
    {loading && !payload ? <div className={s.status} aria-busy="true">{t("profile")}</div> : null}
    {readError ? <div className={s.status} role="alert"><p>{readError === "unauthorized" ? t("profileLogin") : t("readError")}</p><Button label={t("retry")} size="sm" onClick={() => void load()} /></div> : null}
    {profile && progress ? <>
      {/* b12 W-R18a-01 / b5 #20: .wgrid — mycard 7 + ringcard 5, 提供/求め 12, 招待コード 12, 主催 / 参加 6 + 6. */}
      <div className={s.grid}>
        <section className={s.businessCard} aria-label={t("card")}>
          <div className={s.cardTop}><span className={s.orbitMark}>O</span><span>{t("card")}</span>
            <button type="button" className={`btn ${s.shareButton}`} aria-label={t("inviteCreate")} onClick={() => setInviteOpen(true)}><Icon name="share" size={16} /></button></div>
          <button type="button" className={`btn ${s.identity}`} aria-label={t("editProfile")} data-profile-edit onClick={() => setDraft(draftOf(profile))}>
            <span className={s.avatar} aria-hidden>{profile.displayName.slice(0, 1)}</span>
            <span className={s.identityText}><strong>{profile.displayName}</strong><span>{profile.organization && profile.role ? `${profile.organization} · ${profile.role}` : t("missingCompany")}</span></span>
          </button>
          {profile.handles?.email || profile.industry ? <div className={s.cardFoot}>{profile.handles?.email ? <><Icon name="mail" size={16} /><span>{profile.handles.email}</span></> : null}{profile.industry ? <span className={s.industry}><Chip label={profile.industry} /></span> : null}</div> : null}
        </section>
        <section className={s.progressCard}>
          <div className={s.progressHead}><div className={s.ring} style={{ "--score": `${progress.score}%` } as CSSProperties}><strong>{progress.score}<small>%</small></strong></div><div><small>{t("completeness")}</small><strong>{progress.score === 100 ? t("complete") : t(pending.length && progress.missing.includes("seeking") ? "missingReviewSeek" : "missingMany").replace("{n}", String(progress.missing.length))}</strong></div></div>
          {progress.hasCard && progress.missing.length ? <div className={s.missingList}>{progress.missing.map(key => <button key={key} type="button" className="btn" onClick={() => setDraft(draftOf(profile))}><span>＋</span>{key === "seeking" && pending.length ? t("seekCandidates").replace("{n}", String(pending.length)) : t(missingLabels[key])}<em>+25%</em></button>)}</div> : null}
        </section>
        {/* No edit button on the board: the card itself opens the editor (the name card does too, by keyboard). */}
        <section className={s.detailsCard} onClick={event => { if (!(event.target as HTMLElement).closest("button")) setDraft(draftOf(profile)); }}>
          <small>{t("whatOffer")}</small>
          <div className={s.chips}>{profile.offering?.length ? profile.offering.map(value => <Chip key={value} label={value} tone="lav" />) : (["offerExample1", "offerExample2"] as const).map(key => <button key={key} type="button" className={`btn ${s.ghostChip}`} onClick={() => setDraft(draftOf(profile))}>{t(key)}</button>)}</div>
          <div className={s.seekRow}><small>{t("whatSeek")}</small>{pending.length ? <Chip label={t("suggested")} tone="lav" /> : null}</div>
          <div className={s.chips}>{profile.seeking?.length ? profile.seeking.map(value => <Chip key={value} label={value} tone="pink" />)
            : pending.length ? pending.map(value => <span className={s.suggestion} key={value}>{value}
              <button type="button" aria-label={`${t("suggestDismiss")}: ${value}`} onClick={() => setDismissed([...dismissed, value])}>✕</button>
              <button type="button" className={s.accept} aria-label={`${t("suggestAccept")}: ${value}`} disabled={saving} onClick={() => void acceptSuggestion(value)}>✓</button></span>)
            : (["seekExample1", "seekExample2"] as const).map(key => <button key={key} type="button" className={`btn ${s.ghostChip}`} onClick={() => setDraft(draftOf(profile))}>{t(key)}</button>)}</div>
          {saveError && !draft && pending.length ? <p role="alert" className={s.fillHint}>{t("saveError")}</p> : null}
          {!profile.offering?.length && !profile.seeking?.length && !pending.length ? <p className={s.fillHint}>{t("fillHint")}</p> : null}
        </section>
        <section className={`${s.rowCard} ${attendingCount ? s.inviteCard : s.half}`}><MacTile emoji="🔗" tone="teal" /><div><strong>{t("invite")}</strong><span>{t("inviteSub")}</span></div><Button label={t("inviteCreate")} size="sm" onClick={() => setInviteOpen(true)} /></section>
        {hostedCount !== null ? <a className={`${s.rowCard} ${s.half}`} href="/app/events/center"><MacTile emoji="🎤" tone="apricot" /><div><strong>{t("hosted")}</strong><span>{hostedCount === undefined || hostedCount === 0 ? t("hostedOpen") : `${t("eventCount").replace("{n}", String(hostedCount))}${activeCount ? ` · ${t("activeCount").replace("{n}", String(activeCount))}` : ""}`}</span></div><span className={s.go}><Icon name="right" size={16} /></span></a> : null}
        {attendingCount !== null && attendingCount !== 0 ? <a className={`${s.rowCard} ${s.half}`} href="/app/events?tab=going"><MacTile emoji="🎟️" tone="blue" /><div><strong>{t("attending")}</strong><span>{attendingCount === undefined ? t("attendingEmpty") : t("eventCount").replace("{n}", String(attendingCount))}</span></div><span className={s.go}><Icon name="right" size={16} /></span></a> : null}
      </div>
      <div className={s.mobilePreview}>{preview}</div>
      <InviteCodeModal open={inviteOpen} onClose={() => setInviteOpen(false)} language={language} />
    </> : null}
    {draft && profile ? <div className={s.drawerBackdrop} role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setDraft(null); }}><section className={s.drawer} role="dialog" aria-modal="true" aria-label={t("editDetails")}>
      <div className={s.drawerHead}><strong>{t("editDetails")}</strong><Button label={t("close")} size="sm" onClick={() => setDraft(null)} /></div>
      <label>{t("companyRole")}<input value={draft.organization} onChange={event => setDraft({ ...draft, organization: event.target.value })} placeholder={t("companyRole")} /><input value={draft.role} onChange={event => setDraft({ ...draft, role: event.target.value })} placeholder={t("companyRole")} /></label>
      <label>{t("whatOffer")}<textarea value={draft.offering} onChange={event => setDraft({ ...draft, offering: event.target.value })} placeholder={t("eachOnLine")} /></label>
      <label>{t("whatSeek")}<textarea value={draft.seeking} onChange={event => setDraft({ ...draft, seeking: event.target.value })} placeholder={t("eachOnLine")} /></label>
      <label>{t("intro")}<textarea value={draft.bio} onChange={event => setDraft({ ...draft, bio: event.target.value })} /></label>
      {!introValid ? <p role="alert">{t("bioLong")}</p> : null}
      <fieldset><legend>{t("visibility")}</legend>{(["companyRole", "offeringSeeking", "intro"] as const).map(key => <label key={key}><input type="checkbox" data-public-field={key} checked={draft.publicFields[key]} onChange={event => setDraft({ ...draft, publicFields: { ...draft.publicFields, [key]: event.target.checked } })} />{t(key === "offeringSeeking" ? "offeringSeeking" : key === "intro" ? "intro" : "companyRole")}</label>)}<p>{t("contactsAfterExchange")}</p></fieldset>
      {saveError ? <p role="alert">{t("saveError")}</p> : null}
      <div className={s.drawerActions}><Button label={t("cancel")} size="sm" onClick={() => setDraft(null)} /><Button label={t("save")} size="sm" data-profile-save disabled={saving || !introValid} onClick={() => void save()} /></div>
    </section></div> : null}
    {saved ? <div className={s.toast} role="status">{t("saved")}</div> : null}
  </AccountLayout>;
}

export function AccountProfilePage(props: { initialPayload?: ProfilePayload; design?: "25" | "50" | "100"; active?: AccountSection; edit?: string; suggestions?: readonly string[]; eventSummary?: EventSummary }) {
  return <ProfileContent {...props} />;
}
