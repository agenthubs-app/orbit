"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import type { InviteCodePreview, InviteSharedFieldKey, InviteSharedFields } from "../../../../../shared/contract/invite-codes";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { inviteResendRequestText } from "../../../../../shared/compute/invite-message-templates";
import { inviteLandingCopy as l, inviteSenderCopy as c } from "../copy/invite";
import { pickCopy, type OrbitCopyEntry } from "../copy/types";
import { Avatar, Button, Card, Chip, Icon, Orbit2026Scope, TextField, Toggle, ToastProvider, fillCopy, useStandardCopy, useToast } from "../ui";
import { inviterAlreadyInNetwork, readMyProfile, redeemInviteCode, saveShortProfile, type InviteProfileRead } from "../add/invite/invite-api";
import {
  INVITE_KEY_COPY,
  inviteAppLink,
  inviteDate,
  inviteDefaultKeys,
  inviteFieldsFromProfile,
  inviteKeysWithValues,
  inviteKeyValue,
  lineShareUrl,
  newInviteKey,
  orderedInviteKeys,
} from "../add/invite/invite-model";
import {
  INVITE_PROFILE_TAG_LIMIT,
  initialLandingView,
  sameTag,
  inviteAuthHref,
  toggleTag,
  viewAfterProfile,
  viewForRedeemFailure,
  viewForRedeemResult,
  type InviteLandingInitial,
  type InviteLandingView,
} from "./landing-model";
import styles from "./invite-landing.module.css";

type T = (entry: OrbitCopyEntry, values?: Readonly<Record<string, string | number>>) => string;

const OFFERING_PRESETS = [l.offering1, l.offering2, l.offering3, l.offering4, l.offering5] as const;
const SEEKING_PRESETS = [l.seeking1, l.seeking2, l.seeking3, l.seeking4, l.seeking5] as const;

/**
 * `/i/<code>` (public, outside the shell; DESIGN §2.5, b9 A5 ② + 1–3/3, b11 A2 ④⑤⑦⑧): one responsive page
 * (390 first; from 768 centred, at most 560). Opened → sign up / log in and come back here → a short profile
 * when the account has no name yet (saved through the existing /api/profile) → choose what to share (名前 always;
 * 会社・役職 / 提供 / 求めている on; メール / 電話 off; only what the profile has) → つながる (keys only, idempotent)
 * → done. Expired / full / already connected / own code / unavailable each get their own page. 「今はしない」
 * leaves no trace.
 */
export function InviteLanding(props: {
  language: OrbitLanguage;
  initial: InviteLandingInitial;
  signedIn: boolean;
  accountName: string | null;
  /** The signed-in account's e-mail (「… でログイン中」); only shown to that account. */
  accountEmail?: string | null;
  /** Page navigation (tests stub it). */
  navigate?: (href: string) => void;
}) {
  return (
    <Orbit2026Scope language={props.language} as="main" className={styles.page}>
      <ToastProvider>
        <LandingBody {...props} />
      </ToastProvider>
    </Orbit2026Scope>
  );
}

function LandingBody({ language, initial, signedIn, accountName, accountEmail = null, navigate = (href) => window.location.assign(href) }: Parameters<typeof InviteLanding>[0]) {
  const t: T = useCallback((entry, values) => (values ? fillCopy(pickCopy(entry, language), values) : pickCopy(entry, language)), [language]);
  const toast = useToast();
  const preview = initial.kind === "preview" ? initial.preview : null;
  const [view, setView] = useState<InviteLandingView>(() => initialLandingView(initial, signedIn));
  const [profile, setProfile] = useState<InviteProfileRead["profile"]>(null);
  const [profileFailed, setProfileFailed] = useState(false);
  const [sharedByMe, setSharedByMe] = useState<InviteSharedFieldKey[]>([]);

  const loadProfile = useCallback(async () => {
    setProfileFailed(false);
    const result = await readMyProfile();
    if (result.ok === false) {
      if (result.status === 401) navigate(inviteAuthHref("login", preview?.code ?? ""));
      else setProfileFailed(true);
      return;
    }
    setProfile(result.data.profile);
    setView(viewAfterProfile(result.data.profile?.displayName));
  }, [navigate, preview?.code]);

  useEffect(() => {
    if (view.view === "checking") void loadProfile();
  }, [view.view, loadProfile]);

  const head = view.view === "profile" || view.view === "confirm" || view.view === "done" ? t(l.headSub) : preview ? t(l.headSub) : t(l.manualTitle);

  return (
    <div className={styles.column} data-invite-landing={view.view}>
      <header className={styles.head}>
        <span className={styles.appIcon} aria-hidden>O</span>
        <span className={styles.headText}><b>{t(l.brand)}</b><span className={styles.label}>{head}</span></span>
      </header>
      <div className={styles.fade} key={view.view}>
        {view.view === "checking" ? (profileFailed ? <ProfileRetry t={t} onRetry={() => void loadProfile()} /> : <div className={styles.skeleton} aria-busy="true" />) : null}
        {view.view === "open" && preview ? <OpenView t={t} language={language} preview={preview} /> : null}
        {view.view === "profile" && preview ? (
          <ProfileStep t={t} profile={profile} accountName={accountName} onSaved={() => { setView({ view: "checking" }); }} onError={(message) => toast.error(message)} />
        ) : null}
        {view.view === "confirm" && preview ? (
          <ConfirmStep t={t} language={language} preview={preview} profile={profile} accountName={accountName} accountEmail={accountEmail}
            onResult={(next, keys) => { setSharedByMe(keys); if (next === "login") navigate(inviteAuthHref("login", preview.code)); else setView(next); }}
            onNotNow={() => navigate("/app/home")} />
        ) : null}
        {view.view === "done" && preview ? <DoneView t={t} language={language} preview={preview} profile={profile} result={view.result} sharedByMe={sharedByMe} /> : null}
        {(view.view === "expired" || view.view === "full") && preview ? <ExpiredView t={t} language={language} preview={preview} full={view.view === "full"} onCopied={(ok) => (ok ? toast.success(t(c.draftCopied)) : toast.error(t(c.copyFailed)))} /> : null}
        {view.view === "already" ? <AlreadyView t={t} preview={preview} contactId={view.contactId} /> : null}
        {view.view === "own" ? <OwnView t={t} /> : null}
        {view.view === "unavailable" ? <UnavailableView t={t} limited={view.limited} /> : null}
      </div>
    </div>
  );
}

function ProfileRetry({ t, onRetry }: { t: T; onRetry: () => void }) {
  const standard = useStandardCopy();
  return (
    <Card>
      <div className={styles.stack}>
        <p className={styles.error}><Icon name="alert" size={16} />{t(l.profileLoadFailed)}</p>
        <Button label={standard.action.retry} onClick={onRetry} />
      </div>
    </Card>
  );
}

/** The inviter's card: name, 会社・役職, 提供できること, 求めていること (never e-mail or phone). */
function InviterCard({ t, language, shared, children }: { t: T; language: OrbitLanguage; shared: InviteSharedFields; children?: ReactNode }) {
  const organization = inviteKeyValue("organization", shared, language);
  const offering = inviteKeyValue("offering", shared, language);
  const seeking = inviteKeyValue("seeking", shared, language);
  return (
    <Card data-invite-inviter="">
      <div className={styles.stack}>
        <div className={styles.person}>
          <Avatar name={shared.displayName} size="lg" />
          <span className={styles.grow}>
            <span className={styles.label}>{t(l.received)}</span>
            <b className={styles.personName}>{t(l.inviterName, { name: shared.displayName })}</b>
            {organization ? <span className={styles.label}>{organization}</span> : null}
          </span>
        </div>
        {offering || seeking ? (
          <dl className={styles.facts}>
            {offering ? <div><dt>{t(l.offeringLabel)}</dt><dd>{offering}</dd></div> : null}
            {seeking ? <div><dt>{t(l.seekingLabel)}</dt><dd>{seeking}</dd></div> : null}
          </dl>
        ) : null}
        {children}
      </div>
    </Card>
  );
}

function OpenView({ t, language, preview }: { t: T; language: OrbitLanguage; preview: InviteCodePreview }) {
  return (
    <div className={styles.stack} data-invite-open="">
      <InviterCard t={t} language={language} shared={preview.shared}>
        <p className={styles.explain}><span aria-hidden>🤝</span><span>{t(l.explain)}</span></p>
      </InviterCard>
      <p className={styles.codeLine} data-invite-code-line="">{t(l.codeLine, { code: preview.code, date: inviteDate(preview.expiresAt, language) })}</p>
      <div className={styles.actions}>
        <a className={`btn ${styles.primaryLink}`} href={inviteAuthHref("signup", preview.code)} data-invite-signup="">{t(l.signup)}</a>
        <a className={`btn ${styles.secondaryLink}`} href={inviteAuthHref("login", preview.code)} data-invite-login="">{t(l.login)}</a>
        <p className={styles.note}>{t(l.signupNote)}</p>
      </div>
    </div>
  );
}

function TagPicker({ t, label, presets, value, onChange }: { t: T; label: string; presets: readonly OrbitCopyEntry[]; value: string[]; onChange: (next: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const standard = useStandardCopy();
  const presetLabels = presets.map((entry) => t(entry));
  const extra = value.filter((item) => !presetLabels.some((preset) => sameTag(preset, item)));
  const full = value.length >= INVITE_PROFILE_TAG_LIMIT;
  const add = () => {
    onChange(toggleTag(value, draft));
    setDraft("");
  };
  return (
    <fieldset className={styles.tags}>
      <legend className={styles.fieldLabel}>{label}</legend>
      <div className={styles.chipRow}>
        {[...presetLabels, ...extra].map((item) => {
          const on = value.some((entry) => sameTag(entry, item));
          return (
            <button key={item} type="button" aria-pressed={on} disabled={!on && full} className={`btn ${styles.tag} ${on ? styles.tagOn : ""}`} onClick={() => onChange(toggleTag(value, item))} data-invite-tag={item}>
              {on ? <Icon name="check" size={16} /> : <Icon name="plus" size={16} />}{item}
            </button>
          );
        })}
      </div>
      <div className={styles.addRow}>
        <span className={styles.grow}>
          <TextField label={t(l.chipAddLabel)} aria-label={t(l.chipAddLabel)} value={draft} maxLength={40} disabled={full} onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); add(); } }} />
        </span>
        <Button label={standard.action.add} size="sm" disabled={full || !draft.trim()} onClick={add} />
      </div>
    </fieldset>
  );
}

function ProfileStep({ t, profile, accountName, onSaved, onError }: {
  t: T;
  profile: InviteProfileRead["profile"];
  accountName: string | null;
  onSaved: () => void;
  onError: (message: string) => void;
}) {
  const [name, setName] = useState(profile?.displayName?.trim() || accountName?.trim() || "");
  const [company, setCompany] = useState(profile?.organization ?? "");
  const [role, setRole] = useState(profile?.role ?? "");
  const [offering, setOffering] = useState<string[]>([...(profile?.offering ?? [])].slice(0, INVITE_PROFILE_TAG_LIMIT));
  const [seeking, setSeeking] = useState<string[]>([...(profile?.seeking ?? [])].slice(0, INVITE_PROFILE_TAG_LIMIT));
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!name.trim()) {
      setMissing(true);
      return;
    }
    setBusy(true);
    const result = await saveShortProfile({ displayName: name.trim().slice(0, 80), offering, organization: company.trim().slice(0, 120), role: role.trim().slice(0, 80), seeking }, profile?.updatedAt ?? null);
    setBusy(false);
    if (result.ok === true) onSaved();
    else onError(t(l.profileSaveFailed));
  };
  return (
    <form className={styles.stack} data-invite-profile="" noValidate onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <div className={styles.titleBlock}>
        <h1 className={styles.title}>{t(l.profileTitle)}</h1>
        <p className={styles.body}>{t(l.profileSub)}</p>
      </div>
      <Card>
        <div className={styles.stack}>
          <TextField label={`${t(l.fieldName)} · ${t(l.required)}`} value={name} maxLength={80} autoComplete="name" required
            error={missing && !name.trim() ? t(l.nameMissing) : undefined} onChange={(event) => setName(event.target.value)} data-invite-field="displayName" />
          <TextField label={t(l.fieldCompany)} value={company} maxLength={120} autoComplete="organization" onChange={(event) => setCompany(event.target.value)} data-invite-field="organization" />
          <TextField label={t(l.fieldRole)} value={role} maxLength={80} autoComplete="organization-title" onChange={(event) => setRole(event.target.value)} data-invite-field="role" />
        </div>
      </Card>
      <Card>
        <div className={styles.stack}>
          <TagPicker t={t} label={t(l.fieldOffering)} presets={OFFERING_PRESETS} value={offering} onChange={setOffering} />
          <TagPicker t={t} label={t(l.fieldSeeking)} presets={SEEKING_PRESETS} value={seeking} onChange={setSeeking} />
        </div>
      </Card>
      <Button type="submit" label={t(l.next)} variant="primary" block loading={busy} data-invite-profile-next="" />
    </form>
  );
}

function ConfirmStep({ t, language, preview, profile, accountName, accountEmail, onResult, onNotNow }: {
  t: T;
  language: OrbitLanguage;
  preview: InviteCodePreview;
  profile: InviteProfileRead["profile"];
  accountName: string | null;
  accountEmail: string | null;
  onResult: (next: InviteLandingView | "login", sharedKeys: InviteSharedFieldKey[]) => void;
  onNotNow: () => void;
}) {
  const mine = useMemo(() => inviteFieldsFromProfile(profile), [profile]);
  const available = useMemo(() => inviteKeysWithValues(mine), [mine]);
  const [keys, setKeys] = useState<InviteSharedFieldKey[]>(() => inviteDefaultKeys(available));
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [known, setKnown] = useState(false);
  const redeemKey = useRef(newInviteKey("invite-redeem"));
  const inviter = preview.shared.displayName;

  useEffect(() => {
    let live = true;
    void inviterAlreadyInNetwork({ displayName: inviter, organization: preview.shared.organization }).then((found) => { if (live) setKnown(found); });
    return () => { live = false; };
  }, [inviter, preview.shared.organization]);

  const connect = async () => {
    setBusy(true);
    setFailed(false);
    const result = await redeemInviteCode(preview.code, { idempotencyKey: redeemKey.current, sharedKeys: orderedInviteKeys(keys) });
    // One key per visit: a retry after a lost response is answered from the first connection (no second use).
    setBusy(false);
    const sent = orderedInviteKeys(keys);
    if (result.ok === true) {
      onResult(viewForRedeemResult(result.data), sent);
      return;
    }
    const next = viewForRedeemFailure(result.status, result.reason);
    if (next) onResult(next, sent);
    else setFailed(true);
  };

  const me = mine?.displayName || accountName || "";
  return (
    <div className={styles.stack} data-invite-confirm="">
      <Card>
        <div className={styles.person}>
          <Avatar name={me} />
          <span className={styles.grow}><b>{me}</b><span className={styles.label}>{t(l.signedInAs, { name: accountEmail || me })}</span></span>
          <Chip label={t(l.usingOrbit)} tone="teal" />
        </div>
      </Card>
      <div className={styles.connectHero}>
        <span className={styles.pair}><Avatar name={me} size="lg" /><Avatar name={inviter} size="lg" /></span>
        <h1 className={styles.title}>{t(l.confirmTitle, { name: inviter })}</h1>
        <p className={styles.body}>{t(l.confirmSub)}</p>
      </div>
      <Card variant="flat" data-invite-share-keys="">
        <b className={styles.smallTitle}>{t(l.showTitle, { name: inviter })}</b>
        <ul className={styles.switches}>
          <li className={styles.switchRow} data-invite-switch="displayName">
            <span className={styles.grow}><b>{t(c.keyName)}</b><span className={styles.label}>{me}</span></span>
            <Chip label={t(l.required)} />
            <Toggle checked disabled onChange={() => undefined} label={t(c.keyName)} />
          </li>
          {available.map((key) => (
            <li key={key} className={styles.switchRow} data-invite-switch={key}>
              <span className={styles.grow}><b>{t(INVITE_KEY_COPY[key])}</b><span className={styles.label}>{inviteKeyValue(key, mine, language)}</span></span>
              <Toggle checked={keys.includes(key)} onChange={(on) => setKeys((current) => orderedInviteKeys(on ? [...current, key] : current.filter((item) => item !== key)))} label={t(INVITE_KEY_COPY[key])} />
            </li>
          ))}
        </ul>
        {available.includes("email") || available.includes("phone") ? <p className={styles.label}>{t(l.showHint)}</p> : null}
      </Card>
      {known ? <p className={styles.known} data-invite-known=""><span aria-hidden>📇</span><span>{t(l.alreadyInNetwork, { name: inviter })}</span></p> : null}
      {failed ? <p className={styles.error} role="alert"><Icon name="alert" size={16} />{t(l.connectFailed)}</p> : null}
      <div className={styles.actions}>
        <Button label={t(l.connect)} variant="primary" block loading={busy} onClick={() => void connect()} data-invite-connect="" />
        <Button label={t(l.notNow)} variant="ghost" block onClick={onNotNow} data-invite-not-now="" />
        <p className={styles.note}>{t(l.changeLater)}</p>
      </div>
    </div>
  );
}

function DoneView({ t, language, preview, profile, result, sharedByMe }: { t: T; language: OrbitLanguage; preview: InviteCodePreview; profile: InviteProfileRead["profile"]; result: Extract<InviteLandingView, { view: "done" }>["result"]; sharedByMe: InviteSharedFieldKey[] }) {
  const peer = result.peer ?? preview.shared;
  const inviter = peer.displayName || preview.shared.displayName;
  const mine = inviteFieldsFromProfile(profile);
  const peerKeys = inviteKeysWithValues(peer);
  return (
    <div className={styles.stack} data-invite-done={result.outcome}>
      <div className={styles.connectHero}>
        <span className={styles.pair}><Avatar name={mine?.displayName || "?"} size="lg" /><Avatar name={inviter} size="lg" /></span>
        <span className={styles.okMark}><Icon name="check" size={16} /></span>
        <h1 className={styles.title}>{t(l.doneTitle, { name: inviter })}</h1>
        <p className={styles.body}>{t(l.doneSub)}</p>
      </div>
      <Card data-invite-from-peer="">
        <div className={styles.stack}>
          <b className={styles.smallTitle}>{t(l.fromPeer, { name: inviter })}</b>
          <dl className={styles.facts}>
            <div><dt>{t(c.keyName)}</dt><dd>{inviter}</dd></div>
            {peerKeys.map((key) => <div key={key}><dt>{t(INVITE_KEY_COPY[key])}</dt><dd>{inviteKeyValue(key, peer, language)}</dd></div>)}
          </dl>
          <span><Chip label={t(c.selfChip)} tone="teal" /></span>
        </div>
      </Card>
      <Card data-invite-to-peer="">
        <div className={styles.stack}>
          <b className={styles.smallTitle}>{t(l.toPeer, { name: inviter })}</b>
          <div className={styles.chipRow}>
            <Chip label={t(c.keyName)} tone="lav" />
            {sharedByMe.map((key) => <Chip key={key} label={t(INVITE_KEY_COPY[key])} tone="lav" />)}
          </div>
          <p className={styles.label}>{t(l.autoUpdate)}</p>
        </div>
      </Card>
      <Card variant="flat">
        <div className={styles.person}>
          <span className={styles.appIcon} aria-hidden>O</span>
          <span className={styles.grow}><b>{t(l.continueApp)}</b><span className={styles.label}>{t(l.continueAppBody)}</span></span>
          <a className={`btn ${styles.smallLink}`} href={inviteAppLink(preview.code)} data-invite-app="">{t(l.openApp)}</a>
        </div>
      </Card>
      <a className={`btn ${styles.secondaryLink}`} href={`/app/contacts/${encodeURIComponent(result.contactId)}`} data-invite-view-contact="">{t(l.viewInNetwork)}</a>
    </div>
  );
}

function Notice({ emoji, title, children, data }: { emoji: string; title: string; children?: ReactNode; data: string }) {
  return (
    <div className={styles.notice} data-invite-notice={data}>
      <span className={styles.noticeEmoji} aria-hidden>{emoji}</span>
      <h1 className={styles.title}>{title}</h1>
      {children}
    </div>
  );
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function ExpiredView({ t, language, preview, full, onCopied }: { t: T; language: OrbitLanguage; preview: InviteCodePreview; full: boolean; onCopied: (ok: boolean) => void }) {
  const standard = useStandardCopy();
  const inviter = preview.shared.displayName;
  const draft = inviteResendRequestText({ inviter, language });
  return (
    <div className={styles.stack}>
      <Notice emoji="⌛" title={t(full ? l.fullTitle : l.expiredTitle)} data={full ? "full" : "expired"}>
        <p className={styles.body}>{full ? t(l.fullBody, { name: inviter }) : t(l.expiredBody, { date: inviteDate(preview.expiresAt, language), name: inviter })}</p>
      </Notice>
      <Card data-invite-ask="">
        <div className={styles.stack}>
          <b className={styles.smallTitle}>{t(l.askTitle, { name: inviter })}</b>
          <p className={styles.draftBox} data-invite-ask-text="">{draft}</p>
          <div className={styles.row}>
            <Button label={standard.action.copy} icon="copy" size="sm" variant="primary" onClick={() => void copyText(draft).then(onCopied)} data-invite-ask-copy="" />
            <a className={`btn ${styles.smallLink}`} href={lineShareUrl(draft)} target="_blank" rel="noopener noreferrer" data-invite-ask-line="">{t(c.openLine)}</a>
          </div>
          <p className={styles.label}>{t(l.noSend)}</p>
        </div>
      </Card>
    </div>
  );
}

function AlreadyView({ t, preview, contactId }: { t: T; preview: InviteCodePreview | null; contactId?: string }) {
  return (
    <div className={styles.stack}>
      <Notice emoji="🤝" title={t(l.alreadyTitle)} data="already">
        {preview ? <p className={styles.body}>{t(l.alreadyBody, { name: preview.shared.displayName })}</p> : null}
      </Notice>
      <a className={`btn ${styles.primaryLink}`} href={contactId ? `/app/contacts/${encodeURIComponent(contactId)}` : "/app/contacts"} data-invite-view-network="">{t(l.viewInNetwork)}</a>
    </div>
  );
}

function OwnView({ t }: { t: T }) {
  return (
    <div className={styles.stack}>
      <Notice emoji="🪪" title={t(l.ownTitle)} data="own"><p className={styles.body}>{t(l.ownBody)}</p></Notice>
      <a className={`btn ${styles.primaryLink}`} href="/app/contacts/new?add=invite" data-invite-to-share="">{t(l.toShare)}</a>
    </div>
  );
}

function UnavailableView({ t, limited }: { t: T; limited: boolean }) {
  return (
    <div className={styles.stack}>
      <Notice emoji="🔒" title={t(l.unavailableTitle)} data={limited ? "limited" : "unavailable"}>
        <p className={styles.body}>{t(l.unavailableBody)}</p>
        {limited ? <p className={styles.body} data-invite-limited="">{t(l.limitedBody)}</p> : null}
      </Notice>
      <a className={`btn ${styles.secondaryLink}`} href="/i" data-invite-enter-another="">{t(l.enterAnother)}</a>
    </div>
  );
}
