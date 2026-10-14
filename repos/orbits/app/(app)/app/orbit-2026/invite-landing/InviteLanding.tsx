"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import type { InviteCodePreview, InviteSharedFieldKey, InviteSharedFields } from "../../../../../shared/contract/invite-codes";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { inviteResendRequestText } from "../../../../../shared/compute/invite-message-templates";
import { inviteLandingCopy as l, inviteSenderCopy as c } from "../copy/invite";
import { pickCopy, type OrbitCopyEntry } from "../copy/types";
import { Avatar, Button, Card, Icon, Orbit2026Scope, TextField, Toggle, ToastProvider, fillCopy, useStandardCopy, useToast } from "../ui";
import { readMyProfile, redeemInviteCode, saveShortProfile, type InviteProfileRead } from "../add/invite/invite-api";
import {
  INVITE_KEY_COPY,
  inviteAppLink,
  inviteCallName,
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
  /** 「orbit.app/i/<code>」 as the address bar shows it (the expired page heads with it, b11 #13). */
  linkLabel?: string;
  /** Read-only design fixture (local mock only, R15 pixel gate): open straight on this view. */
  initialView?: InviteLandingView;
  /** With `initialView`: what that fixture says I shared. */
  initialSharedByMe?: InviteSharedFieldKey[];
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

function LandingBody({ language, initial, signedIn, accountName, accountEmail = null, linkLabel, initialView, initialSharedByMe, navigate = (href) => window.location.assign(href) }: Parameters<typeof InviteLanding>[0]) {
  const t: T = useCallback((entry, values) => (values ? fillCopy(pickCopy(entry, language), values) : pickCopy(entry, language)), [language]);
  const toast = useToast();
  const preview = initial.kind === "preview" ? initial.preview : null;
  const [view, setView] = useState<InviteLandingView>(() => initialView ?? initialLandingView(initial, signedIn));
  // Whether this visit went through the short profile (a newcomer): the done page then says 登録が完了しました.
  const [newcomer, setNewcomer] = useState(initialView?.view === "done");
  const [profile, setProfile] = useState<InviteProfileRead["profile"]>(null);
  const [profileFailed, setProfileFailed] = useState(false);
  const [sharedByMe, setSharedByMe] = useState<InviteSharedFieldKey[]>(initialSharedByMe ?? []);

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

  // The small head line under 「Orbit」 (b11 #9 / #12 / #10 / #13): signed out → 「アプリなしで登録できます」 (m7: never to a
  // signed-in visitor); signed in → 「すでにアカウントがあります」; done → 登録が完了しました (newcomer) / つながりました;
  // expired / full → the address; the code-less page keeps 「招待コードを入力」.
  const head = !preview ? t(l.manualTitle)
    : view.view === "open" && !signedIn ? t(l.headSub)
    : view.view === "confirm" ? t(l.headHasAccount)
    : view.view === "done" ? t(newcomer ? l.headDone : l.headConnected)
    : (view.view === "expired" || view.view === "full") && linkLabel ? linkLabel
    : null;

  return (
    <div className={styles.column} data-invite-landing={view.view}>
      <header className={styles.head}>
        <span className={styles.appIcon} aria-hidden>O</span>
        <span className={styles.headText}><b className={styles.brand}>{t(l.brand)}</b>{head ? <span className={styles.lbl}>{head}</span> : null}</span>
      </header>
      <div className={styles.fade} key={view.view}>
        {view.view === "checking" ? (profileFailed ? <ProfileRetry t={t} onRetry={() => void loadProfile()} /> : <div className={styles.skeleton} aria-busy="true" />) : null}
        {view.view === "open" && preview ? <OpenView t={t} language={language} preview={preview} /> : null}
        {view.view === "profile" && preview ? (
          <ProfileStep t={t} profile={profile} accountName={accountName} onSaved={() => { setNewcomer(true); setView({ view: "checking" }); }} onError={(message) => toast.error(message)} />
        ) : null}
        {view.view === "confirm" && preview ? (
          <ConfirmStep t={t} language={language} preview={preview} profile={profile} accountName={accountName} accountEmail={accountEmail}
            onResult={(next, keys) => { setSharedByMe(keys); if (next === "login") navigate(inviteAuthHref("login", preview.code)); else setView(next); }}
            onNotNow={() => navigate("/app/home")} />
        ) : null}
        {view.view === "done" && preview ? <DoneView t={t} preview={preview} profile={profile} accountName={accountName} result={view.result} sharedByMe={sharedByMe} /> : null}
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

/** b11 #9 .k-irfrom: the inviter (avatar, 招待が届いています, name, 会社・役職), 提供 / 求めている, then the 🤝 line. */
function InviterCard({ t, language, shared, children }: { t: T; language: OrbitLanguage; shared: InviteSharedFields; children?: ReactNode }) {
  const organization = inviteKeyValue("organization", shared, language);
  const offering = inviteKeyValue("offering", shared, language);
  const seeking = inviteKeyValue("seeking", shared, language);
  return (
    <div className={styles.card} data-invite-inviter="">
      <div className={styles.person}>
        <Avatar name={shared.displayName} size="lg" />
        <div className={styles.grow}>
          <div className={styles.lbl}>{t(l.received)}</div>
          <b className={styles.personName}>{t(l.inviterName, { name: shared.displayName })}</b>
          {organization ? <div className={styles.lbl}>{organization}</div> : null}
        </div>
      </div>
      {offering ? <><div className={`${styles.lbl} ${styles.factLabel}`}>{t(l.offeringLabel)}</div><div className={styles.fact}>{offering}</div></> : null}
      {seeking ? <><div className={`${styles.lbl} ${styles.factLabel} ${offering ? styles.factNext : ""}`}>{t(l.seekingLabel)}</div><div className={styles.fact}>{seeking}</div></> : null}
      {children}
    </div>
  );
}

function OpenView({ t, language, preview }: { t: T; language: OrbitLanguage; preview: InviteCodePreview }) {
  return (
    <div data-invite-open="">
      <InviterCard t={t} language={language} shared={preview.shared}>
        <div className={styles.explain}><span aria-hidden>🤝</span><p className={styles.explainText}>{t(l.explain)}</p></div>
      </InviterCard>
      <p className={`${styles.lbl} ${styles.codeLine}`} data-invite-code-line="">{t(l.codeLine, { code: preview.code, date: inviteDate(preview.expiresAt, language) })}</p>
      <div className={styles.openActions}>
        <a className={`btn ${styles.xlButton} ${styles.primary}`} href={inviteAuthHref("signup", preview.code)} data-invite-signup="">{t(l.signup)}</a>
        <a className={`btn ${styles.xlButton}`} href={inviteAuthHref("login", preview.code)} data-invite-login="">{t(l.login)}</a>
        <p className={`${styles.lbl} ${styles.center}`}>{t(l.signupNote)}</p>
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
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const redeemKey = useRef(newInviteKey("invite-redeem"));
  const inviter = preview.shared.displayName;
  const callName = inviteCallName(inviter);

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
  const contactOff = !keys.includes("email") && !keys.includes("phone");
  return (
    <div className={styles.withFoot} data-invite-confirm="">
      <div className={styles.card}>
        <div className={styles.person}>
          <Avatar name={me} />
          <div className={styles.grow}><b>{me}</b><div className={styles.lbl}>{t(l.signedInAs, { name: accountEmail || me })}</div></div>
          <span className={`${styles.chip} ${styles.chipTeal}`}>{t(l.usingOrbit)}</span>
        </div>
      </div>
      <div className={`${styles.guide} ${styles.connectGuide}`}>
        <span className={styles.pair}><Avatar name={me} size="lg" /><Avatar name={inviter} size="lg" /></span>
        <h1 className={styles.guideTitle}>{t(l.confirmTitle, { name: inviter })}</h1>
        <p className={`${styles.sub} ${styles.guideSub}`}>{t(l.confirmSub)}</p>
      </div>
      <div className={`${styles.flatCard} ${styles.gap12}`} data-invite-share-keys="">
        <div className={styles.rowBetween}>
          <b className={styles.infoTitle}>{t(l.showTitle, { name: callName })}</b>
          {editing ? null : <button type="button" className={styles.textButton} onClick={() => setEditing(true)} data-invite-share-edit="">{t(c.shareChange)}</button>}
        </div>
        {editing ? (
          <ul className={styles.switches}>
            <li className={styles.switchRow} data-invite-switch="displayName">
              <span className={styles.grow}><b>{t(c.keyName)}</b><span className={styles.lbl}>{me}</span></span>
              <Toggle checked disabled onChange={() => undefined} label={t(c.keyName)} />
            </li>
            {available.map((key) => (
              <li key={key} className={styles.switchRow} data-invite-switch={key}>
                <span className={styles.grow}><b>{t(INVITE_KEY_COPY[key])}</b><span className={styles.lbl}>{inviteKeyValue(key, mine, language)}</span></span>
                <Toggle checked={keys.includes(key)} onChange={(on) => setKeys((current) => orderedInviteKeys(on ? [...current, key] : current.filter((item) => item !== key)))} label={t(INVITE_KEY_COPY[key])} />
              </li>
            ))}
          </ul>
        ) : (
          <div className={styles.chips} data-invite-share-chips="">
            {keys.map((key) => <span key={key} className={styles.chip}>{t(INVITE_KEY_COPY[key])}</span>)}
            {contactOff ? <span className={`${styles.chip} ${styles.chipOff}`}>{t(c.shareOff, { label: t(c.keyContact) })}</span> : null}
          </div>
        )}
      </div>
      {/* Whether the inviter is someone I already have is decided after connecting, by me (R15 复核 S1) — never guessed here. */}
      <div className={`${styles.flatCard} ${styles.noteCard} ${styles.gap12}`} data-invite-check-later=""><span className={styles.noteEmoji} aria-hidden>📇</span><p className={styles.noteText}>{t(l.checkLater)}</p></div>
      {failed ? <p className={`${styles.error} ${styles.gap12}`} role="alert"><Icon name="alert" size={16} />{t(l.connectFailed)}</p> : null}
      <div className={styles.foot}>
        <Button label={t(l.connect)} variant="primary" block loading={busy} onClick={() => void connect()} className={styles.xlSize} data-invite-connect="" />
        <Button label={t(l.notNow)} variant="ghost" block onClick={onNotNow} data-invite-not-now="" />
      </div>
    </div>
  );
}

function DoneView({ t, preview, profile, accountName, result, sharedByMe }: { t: T; preview: InviteCodePreview; profile: InviteProfileRead["profile"]; accountName: string | null; result: Extract<InviteLandingView, { view: "done" }>["result"]; sharedByMe: InviteSharedFieldKey[] }) {
  const inviter = inviteCallName(result.peer?.displayName || preview.shared.displayName);
  const me = inviteFieldsFromProfile(profile)?.displayName || accountName || "?";
  return (
    <div data-invite-done={result.outcome}>
      <div className={styles.doneHero}>
        <span className={`${styles.pair} ${styles.pairOnBg}`}><Avatar name={me} size="lg" /><Avatar name={inviter} size="lg" /></span>
        <h1 className={styles.h1}>{t(l.doneTitle, { name: inviter })}</h1>
        <p className={`${styles.sub} ${styles.doneSub}`}>{t(l.doneSub)}</p>
      </div>
      <div className={`${styles.card} ${styles.gap16}`} data-invite-to-peer="">
        <div className={styles.lbl}>{t(l.toPeer, { name: inviter })}</div>
        <div className={styles.chips}>
          <span className={styles.chip}>{t(c.keyName)}</span>
          {sharedByMe.map((key) => <span key={key} className={styles.chip}>{t(INVITE_KEY_COPY[key])}</span>)}
        </div>
        <div className={`${styles.lbl} ${styles.gap8}`}>{t(l.autoUpdate, { name: inviter })}</div>
      </div>
      <div className={`${styles.flatCard} ${styles.appCard}`}>
        <span className={styles.appIcon} aria-hidden>O</span>
        <div className={styles.grow}><b className={styles.appTitle}>{t(l.continueApp)}</b><div className={styles.lbl}>{t(l.continueAppBody)}</div></div>
        <a className={`btn ${styles.smButton} ${styles.primary}`} href={inviteAppLink(preview.code)} data-invite-app="">{t(l.openApp)}</a>
      </div>
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
  const draft = inviteResendRequestText({ inviter: inviteCallName(inviter), language });
  return (
    <div>
      <div className={`${styles.guide} ${styles.expiredGuide}`} data-invite-notice={full ? "full" : "expired"}>
        <div className={styles.bigEmoji} aria-hidden>⌛</div>
        <h1 className={styles.guideTitle}>{t(full ? l.fullTitle : l.expiredTitle)}</h1>
        <p className={`${styles.sub} ${styles.expiredSub}`}>{full ? t(l.fullBody, { name: inviter }) : t(l.expiredBody, { date: inviteDate(preview.expiresAt, language), name: inviter })}</p>
      </div>
      <div className={`${styles.card} ${styles.gap12}`} data-invite-ask="">
        <b className={styles.askTitle}>{t(l.askTitle, { name: inviteCallName(inviter) })}</b>
        <p className={styles.draftBox} data-invite-ask-text="">{draft}</p>
        <div className={styles.askActions}>
          <Button label={standard.action.copy} icon="copy" size="sm" variant="primary" onClick={() => void copyText(draft).then(onCopied)} data-invite-ask-copy="" />
          <a className={`btn ${styles.smButton}`} href={lineShareUrl(draft)} target="_blank" rel="noopener noreferrer" data-invite-ask-line="">{t(c.openLine)}</a>
        </div>
        <div className={`${styles.lbl} ${styles.gap8}`}>{t(l.noSend)}</div>
      </div>
      {full ? null : (
        <div className={`${styles.flatCard} ${styles.noteCard} ${styles.gap12}`} data-invite-sender-note="">
          <span className={styles.noteEmoji} aria-hidden>🔁</span>
          <p className={styles.noteText}>{t(l.senderNoteLead)}<b className={styles.noteStrong}>{t(l.senderNoteStrong)}</b>{t(l.senderNoteTail)}</p>
        </div>
      )}
    </div>
  );
}

function AlreadyView({ t, preview, contactId }: { t: T; preview: InviteCodePreview | null; contactId?: string }) {
  return (
    <div className={styles.stack}>
      <Notice emoji="🤝" title={t(l.alreadyTitle)} data="already">
        {preview ? <p className={styles.body}>{t(l.alreadyBody, { name: preview.shared.displayName })}</p> : null}
      </Notice>
      <a className={`btn ${styles.xlButton} ${styles.primary}`} href={contactId ? `/app/contacts/${encodeURIComponent(contactId)}` : "/app/contacts"} data-invite-view-network="">{t(l.viewInNetwork)}</a>
    </div>
  );
}

function OwnView({ t }: { t: T }) {
  return (
    <div className={styles.stack}>
      <Notice emoji="🪪" title={t(l.ownTitle)} data="own"><p className={styles.body}>{t(l.ownBody)}</p></Notice>
      <a className={`btn ${styles.xlButton} ${styles.primary}`} href="/app/contacts/new?add=invite" data-invite-to-share="">{t(l.toShare)}</a>
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
      <a className={`btn ${styles.xlButton}`} href="/i" data-invite-enter-another="">{t(l.enterAnother)}</a>
    </div>
  );
}
