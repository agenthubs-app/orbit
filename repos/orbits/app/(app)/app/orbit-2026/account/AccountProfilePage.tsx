"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

import type { ManualProfileUpdateInput, ProfilePayload } from "../../../../../features/profile/contract";
import { profileBioWithinLimit } from "../../../../../shared/api-schema/profile-bio";
import type { ManualProfileContract, ProfilePublicFieldsContract } from "../../../../../shared/contract/profile";
import { useOrbitLanguage } from "../../orbit-language-context";
import { eventsApi } from "../events/events-api";
import { accountCopy } from "../copy/account";
import { pickCopy } from "../copy/types";
import { InviteCodeModal } from "../add/invite/InviteCodeModal";
import { AccountLayout, type AccountSection } from "./AccountLayout";
import { cardProgress, previewForProfile, profileSaveInput, type CardKey } from "./profile-model";
import s from "./AccountProfilePage.module.css";

type Envelope = { success: boolean; data?: ProfilePayload };
type Draft = { organization: string; role: string; offering: string; seeking: string; bio: string; publicFields: ProfilePublicFieldsContract };

const defaultVisibility: ProfilePublicFieldsContract = { companyRole: true, offeringSeeking: true, intro: true };

function draftOf(profile: ManualProfileContract): Draft {
  return {
    organization: profile.organization, role: profile.role,
    offering: profile.offering?.join("\n") ?? "", seeking: profile.seeking?.join("\n") ?? "",
    bio: profile.bio ?? "", publicFields: { ...defaultVisibility, ...profile.publicFields },
  };
}

function lines(value: string): string[] {
  return value.split("\n").map(part => part.trim()).filter(Boolean).slice(0, 5);
}

function editOf(draft: Draft): ManualProfileUpdateInput {
  return {
    organization: draft.organization.trim(), role: draft.role.trim(),
    offering: lines(draft.offering), seeking: lines(draft.seeking), bio: draft.bio.trim(),
    publicFields: draft.publicFields,
  };
}

function ProfilePreview({ profile, draft, t }: { profile: ManualProfileContract; draft: Draft | null; t: (key: keyof typeof accountCopy) => string }) {
  const projected = previewForProfile(draft ? { ...profile, ...editOf(draft) } : profile);
  const chips = (values: readonly string[] | undefined) => values?.length
    ? <div className={s.chips}>{values.map(value => <span className={s.chip} key={value}>{value}</span>)}</div>
    : <span className={s.muted}>{t("previewHidden")}</span>;
  return <section className={s.preview} aria-label={t("preview")}>
    <div className={s.previewHeading}><strong>{t("preview")}</strong><span>{t("previewSub")}</span></div>
    <div className={s.previewCard}>
      <div className={s.avatar}>{projected.displayName.slice(0, 1)}</div>
      <strong>{projected.displayName}</strong>
      {projected.organization || projected.role ? <span>{[projected.organization, projected.role].filter(Boolean).join(" · ")}</span> : null}
      {projected.bio ? <p>{projected.bio}</p> : null}
    </div>
    <div className={s.previewCard}>
      <small>{t("whatOffer")}</small>{chips(projected.offering)}
      <small>{t("whatSeek")}</small>{chips(projected.seeking)}
    </div>
    <p className={s.privateNotice}>{t("contactsPrivate")}</p>
  </section>;
}

function ProfileContent({ initialPayload, design, active = "profile", edit }: { initialPayload?: ProfilePayload; design?: "25" | "50" | "100"; active?: AccountSection; edit?: string }) {
  const { language } = useOrbitLanguage();
  const t = (key: keyof typeof accountCopy) => pickCopy(accountCopy[key], language);
  const [payload, setPayload] = useState<ProfilePayload | null>(initialPayload ?? null);
  const [loading, setLoading] = useState(!initialPayload);
  const [readError, setReadError] = useState<"unauthorized" | "failed" | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [saved, setSaved] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [attendingCount, setAttendingCount] = useState<number | null | undefined>();
  const [hostedCount, setHostedCount] = useState<number | null | undefined>();
  const openedFromRoute = useRef(false);
  const pendingSave = useRef<{ fingerprint: string; id: string } | null>(null);

  const profileUrl = design ? `/api/profile?design=${design}` : "/api/profile";
  const load = useCallback(async () => {
    setLoading(true);
    setReadError(null);
    try {
      const response = await fetch(profileUrl, { cache: "no-store" });
      const envelope = await response.json() as Envelope;
      if (!response.ok || !envelope.success || !envelope.data?.profile) {
        setReadError(response.status === 401 ? "unauthorized" : "failed");
      } else setPayload(envelope.data);
    } catch { setReadError("failed"); }
    finally { setLoading(false); }
  }, [profileUrl]);

  useEffect(() => { if (!initialPayload) void load(); }, [initialPayload, load]);
  useEffect(() => {
    let alive = true;
    void eventsApi.mine("upcoming", 1).then(result => {
      if (alive && result.ok) setAttendingCount(result.data.upcomingCount);
      else if (alive) setAttendingCount(null);
    });
    void fetch("/api/events/center?summary=1").then(response => response.ok ? response.json() : null).then(body => {
      const value = body?.data?.eventCount;
      if (alive) setHostedCount(typeof value === "number" && Number.isFinite(value) ? value : null);
    }).catch(() => { if (alive) setHostedCount(null); });
    return () => { alive = false; };
  }, []);

  const profile = payload?.profile;
  useEffect(() => {
    if (profile && edit && !openedFromRoute.current) {
      openedFromRoute.current = true;
      setDraft(draftOf(profile));
    }
  }, [profile, edit]);
  const progress = payload ? cardProgress(payload.completeness) : null;
  const missingLabels: Record<CardKey, keyof typeof accountCopy> = { companyRole: "companyRole", offering: "whatOffer", seeking: "whatSeek", intro: "intro" };
  const introValid = !draft || profileBioWithinLimit(draft.bio);

  async function save() {
    if (!profile || !draft || !introValid || saving) return;
    setSaving(true);
    setSaveError(false);
    try {
      const edit = editOf(draft);
      const fingerprint = JSON.stringify({ updatedAt: profile.updatedAt, edit });
      if (pendingSave.current?.fingerprint !== fingerprint) pendingSave.current = { fingerprint, id: crypto.randomUUID() };
      const response = await fetch(profileUrl, {
        method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify(profileSaveInput(profile, edit, pendingSave.current.id)),
      });
      const envelope = await response.json() as Envelope;
      if (!response.ok || !envelope.success || !envelope.data?.profile) throw new Error("save failed");
      setPayload(envelope.data);
      setDraft(null);
      pendingSave.current = null;
      setSaved(true);
    } catch { setSaveError(true); }
    finally { setSaving(false); }
  }

  const preview = profile ? <ProfilePreview profile={profile} draft={draft} t={t} /> : null;
  return <AccountLayout active={active} title={t("profile")} subtitle={t("profileIntro")} rightRail={preview}>
    {loading && !payload ? <div className={s.status} aria-busy="true">{t("profile")}</div> : null}
    {readError ? <div className={s.status} role="alert"><p>{readError === "unauthorized" ? t("profileLogin") : t("readError")}</p><button onClick={() => void load()}>{t("retry")}</button></div> : null}
    {profile && progress ? <>
      <div className={s.cards}>
        <section className={s.businessCard}>
          <div className={s.cardTop}><span className={s.orbitMark}>O</span><strong>{t("card")}</strong><button type="button" data-profile-edit onClick={() => setDraft(draftOf(profile))}>{t("editProfile")}</button></div>
          <div className={s.identity}><div className={s.avatar}>{profile.displayName.slice(0, 1)}</div><div><strong>{profile.displayName}</strong><span>{profile.organization && profile.role ? `${profile.organization} · ${profile.role}` : t("missingCompany")}</span></div></div>
          {profile.handles.email ? <span className={s.email}>{profile.handles.email}</span> : null}
        </section>
        <section className={s.progressCard}>
          <div className={s.progressHead}><div className={s.ring} style={{ "--score": `${progress.score}%` } as CSSProperties}><strong>{progress.score}%</strong></div><div><small>{t("completeness")}</small><strong>{progress.score === 100 ? t("complete") : t("missingMany").replace("{n}", String(progress.missing.length))}</strong></div></div>
          {progress.hasCard && progress.missing.length ? <div className={s.missingList}>{progress.missing.map(key => <button key={key} type="button" onClick={() => setDraft(draftOf(profile))}><span>＋</span>{t(missingLabels[key])}<em>+25%</em></button>)}</div> : null}
        </section>
      </div>
      <section className={s.detailsCard}>
        <div className={s.detailsTop}><strong>{t("whatOffer")}</strong><button type="button" onClick={() => setDraft(draftOf(profile))}>{t("editDetails")}</button></div>
        <div className={s.chips}>{profile.offering?.length ? profile.offering.map(value => <span className={s.chip} key={value}>{value}</span>) : <span className={s.muted}>{t("missing")}</span>}</div>
        <strong>{t("whatSeek")}</strong>
        <div className={s.chips}>{profile.seeking?.length ? profile.seeking.map(value => <span className={s.chip} key={value}>{value}</span>) : <span className={s.muted}>{t("missing")}</span>}</div>
      </section>
      <div className={s.actions}>
        <section><strong>{t("invite")}</strong><span>{t("inviteSub")}</span><button type="button" onClick={() => setInviteOpen(true)}>{t("inviteCreate")}</button></section>
        {hostedCount !== null ? <a href="/app/events/center"><strong>{t("hosted")}</strong><span>{hostedCount === undefined || hostedCount === 0 ? t("hostedOpen") : `${hostedCount}`}</span><span aria-hidden="true">→</span></a> : null}
        {attendingCount !== null && attendingCount !== 0 ? <a href="/app/events?tab=going"><strong>{t("attending")}</strong><span>{attendingCount === undefined ? t("attendingEmpty") : `${attendingCount}`}</span><span aria-hidden="true">→</span></a> : null}
      </div>
      <div className={s.mobilePreview}>{preview}</div>
      <InviteCodeModal open={inviteOpen} onClose={() => setInviteOpen(false)} language={language} />
    </> : null}
    {draft && profile ? <div className={s.drawerBackdrop} role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setDraft(null); }}><section className={s.drawer} role="dialog" aria-modal="true" aria-label={t("editDetails")}>
      <div className={s.drawerHead}><strong>{t("editDetails")}</strong><button type="button" onClick={() => setDraft(null)}>{t("close")}</button></div>
      <label>{t("companyRole")}<input value={draft.organization} onChange={event => setDraft({ ...draft, organization: event.target.value })} placeholder={t("companyRole")} /><input value={draft.role} onChange={event => setDraft({ ...draft, role: event.target.value })} placeholder={t("companyRole")} /></label>
      <label>{t("whatOffer")}<textarea value={draft.offering} onChange={event => setDraft({ ...draft, offering: event.target.value })} placeholder={t("eachOnLine")} /></label>
      <label>{t("whatSeek")}<textarea value={draft.seeking} onChange={event => setDraft({ ...draft, seeking: event.target.value })} placeholder={t("eachOnLine")} /></label>
      <label>{t("intro")}<textarea value={draft.bio} onChange={event => setDraft({ ...draft, bio: event.target.value })} /></label>
      {!introValid ? <p role="alert">{t("bioLong")}</p> : null}
      <fieldset><legend>{t("visibility")}</legend>{(["companyRole", "offeringSeeking", "intro"] as const).map(key => <label key={key}><input type="checkbox" data-public-field={key} checked={draft.publicFields[key]} onChange={event => setDraft({ ...draft, publicFields: { ...draft.publicFields, [key]: event.target.checked } })} />{t(key === "offeringSeeking" ? "offeringSeeking" : key === "intro" ? "intro" : "companyRole")}</label>)}<p>{t("contactsAfterExchange")}</p></fieldset>
      {saveError ? <p role="alert">{t("saveError")}</p> : null}
      <div className={s.drawerActions}><button type="button" onClick={() => setDraft(null)}>{t("cancel")}</button><button type="button" data-profile-save disabled={saving || !introValid} onClick={() => void save()}>{t("save")}</button></div>
    </section></div> : null}
    {saved ? <div className={s.toast} role="status">{t("saved")}</div> : null}
  </AccountLayout>;
}

export function AccountProfilePage(props: { initialPayload?: ProfilePayload; design?: "25" | "50" | "100"; active?: AccountSection; edit?: string }) {
  return <ProfileContent {...props} />;
}
