"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { InviteCodeContract, InviteCodeHistoryItem, InviteSharedFieldKey, InviteSharedFields } from "../../../../../../shared/contract/invite-codes";
import type { OrbitLanguage } from "../../../../../../shared/contract/language";
import { inviteMessageText, type InviteMessageTone } from "../../../../../../shared/compute/invite-message-templates";
import { inviteSenderCopy as c } from "../../copy/invite";
import { Accordion, Button, Card, Chip, ConfirmDialog, Icon, MacTile, Modal, Segmented, Skeleton, Toggle, fillCopy, useStandardCopy, useToast } from "../../ui";
import { DensityDots, translator, type Translate } from "../add-parts";
import { createInviteCode, readCurrentInviteCode, readInviteHistory, readMyProfile, revokeInviteCode } from "./invite-api";
import {
  INVITE_HISTORY_STATUS_COPY,
  INVITE_KEY_COPY,
  inviteDate,
  inviteDaysLeft,
  inviteDefaultKeys,
  inviteFieldsFromProfile,
  inviteGuideSeen,
  inviteKeysWithValues,
  inviteKeyValue,
  inviteLinkLabel,
  lineShareUrl,
  mailDraftUrl,
  markInviteGuideSeen,
  newInviteKey,
  orderedInviteKeys,
} from "./invite-model";
import { InviteQr } from "./InviteQr";
import styles from "./invite.module.css";

type Phase = "loading" | "intro" | "share" | "failed";
type Notice = "profile" | "sample" | null;

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * 人脈を追加 › 招待コード (b11 A2 ①–③ / Web, b9 A5 ①, b5 E6; DESIGN §2.4): a 560 dialog (a bottom sheet
 * under 768). The first time it explains (3 steps + 3 questions); after that it opens on 共有 — QR, the
 * 8-character code, the link with コピー, QR を拡大, 有効期限 / 使える人数, 相手に届くあなたの情報 (changing it
 * makes a new code, the server only takes keys), メッセージの下書き (three fixed tones; copy / LINE / mail —
 * Orbit never sends), 無効にする (confirmed), and これまでのコード. Every write is one button press.
 */
export function InviteCodeModal({ open, onClose, language }: { open: boolean; onClose: () => void; language: OrbitLanguage }) {
  const t = translator(language);
  const standard = useStandardCopy();
  const toast = useToast();
  const [phase, setPhase] = useState<Phase>("loading");
  const [current, setCurrent] = useState<InviteCodeContract | null>(null);
  const [profile, setProfile] = useState<InviteSharedFields | null>(null);
  const [history, setHistory] = useState<InviteCodeHistoryItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftKeys, setDraftKeys] = useState<InviteSharedFieldKey[]>([]);
  const [tone, setTone] = useState<InviteMessageTone>("polite");
  const createKey = useRef<string | null>(null);

  const loadHistory = useCallback(async () => {
    const result = await readInviteHistory();
    setHistory(result.ok ? [...result.data.items] : []);
  }, []);

  const load = useCallback(async () => {
    setPhase("loading");
    setNotice(null);
    const [code, me] = await Promise.all([readCurrentInviteCode(), readMyProfile()]);
    if (!code.ok) {
      setPhase("failed");
      return;
    }
    setCurrent(code.data);
    setProfile(me.ok ? inviteFieldsFromProfile(me.data.profile) : null);
    setPhase(code.data === null && !inviteGuideSeen() ? "intro" : "share");
    void loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    if (open) void load();
    else {
      setEditing(false);
      setQrOpen(false);
      setConfirmRevoke(false);
    }
  }, [open, load]);

  const available = useMemo(() => inviteKeysWithValues(profile), [profile]);
  const currentKeys = useMemo(() => (current ? inviteKeysWithValues(current.shared) : []), [current]);

  const create = useCallback(async (keys: InviteSharedFieldKey[]) => {
    setBusy(true);
    setNotice(null);
    createKey.current ??= newInviteKey("invite-create");
    const result = await createInviteCode({ displayName: profile?.displayName ?? "", idempotencyKey: createKey.current, sharedKeys: orderedInviteKeys(keys) });
    setBusy(false);
    if (result.ok === true) {
      createKey.current = null;
      setCurrent(result.data);
      setEditing(false);
      setPhase("share");
      void loadHistory();
      return;
    }
    // A failed attempt keeps its key so a retry of the same press is the same request (idempotent).
    if (result.reason === "PROFILE_REQUIRED") setNotice("profile");
    else if (result.reason === "SAMPLE_READ_ONLY") setNotice("sample");
    else toast.error(t(c.createFailed));
    createKey.current = null;
  }, [profile, loadHistory, toast, t]);

  const startFromIntro = () => {
    markInviteGuideSeen();
    if (current) setPhase("share");
    else void create(inviteDefaultKeys(available.length ? available : ["organization", "offering", "seeking"]));
  };

  const revoke = async () => {
    if (!current) return;
    setConfirmRevoke(false);
    setBusy(true);
    const result = await revokeInviteCode(current.code);
    setBusy(false);
    if (!result.ok) {
      toast.error(t(c.revokeFailed));
      return;
    }
    setCurrent(null);
    toast.success(t(c.revoked));
    void loadHistory();
  };

  const copy = async (text: string, done: typeof c.linkCopied) => {
    if (await copyText(text)) toast.success(t(done));
    else toast.error(t(c.copyFailed));
  };

  const reissueKeys = current ? currentKeys : inviteDefaultKeys(available);

  return (
    <>
      <Modal open={open} onClose={onClose} size={560} title={t(c.title)} description={t(c.subtitle)}>
        <div className={styles.sheetBody} data-invite-sheet="" data-invite-phase={phase}>
          {phase === "loading" ? <Skeleton lines={4} /> : null}
          {phase === "failed" ? (
            <div className={styles.stack}>
              <p className={styles.error}><Icon name="alert" size={16} />{t(c.loadFailed)}</p>
              <Button label={standard.action.retry} onClick={() => void load()} />
            </div>
          ) : null}
          {phase === "intro" ? <InviteIntro t={t} busy={busy} onStart={startFromIntro} /> : null}
          {phase === "share" ? (
            <div className={styles.stack}>
              {notice ? <NoticeLine notice={notice} t={t} /> : null}
              {current ? (
                <>
                  <div className={styles.codeRow} data-invite-code-card="">
                    <InviteQr text={current.link} label={t(c.qrAlt)} />
                    <div className={styles.codeSide}>
                      <span className={styles.label}>{t(c.codeLabel)}</span>
                      <span className={styles.code} data-invite-code="">{current.code}</span>
                      <span className={styles.label}>{t(c.linkLabel)}</span>
                      <div className={styles.linkRow}>
                        <span className={styles.linkBox} data-invite-link="">{inviteLinkLabel(current.link)}</span>
                        <Button label={standard.action.copy} icon="copy" variant="primary" onClick={() => void copy(current.link, c.linkCopied)} data-invite-copy-link="" />
                      </div>
                      <Button label={t(c.enlargeQr)} icon="grid" size="sm" onClick={() => setQrOpen(true)} data-invite-enlarge="" />
                    </div>
                  </div>
                  <Quota code={current} language={language} t={t} />
                  <ShareKeys
                    t={t}
                    language={language}
                    keys={currentKeys}
                    profile={profile}
                    available={available}
                    editing={editing}
                    draftKeys={draftKeys}
                    busy={busy}
                    onEdit={() => { setDraftKeys(currentKeys); setEditing(true); }}
                    onToggle={(key, on) => setDraftKeys((keys) => orderedInviteKeys(on ? [...keys, key] : keys.filter((item) => item !== key)))}
                    onCancel={() => setEditing(false)}
                    onApply={() => void create(draftKeys)}
                  />
                  <Accordion title={t(c.draftTitle)}>
                    <MessageDraft code={current} name={profile?.displayName ?? ""} tone={tone} onTone={setTone} language={language} t={t} onCopy={(text) => void copy(text, c.draftCopied)} />
                  </Accordion>
                  <div className={styles.footRow}>
                    <span className={styles.label}>{t(c.noSend)}</span>
                    <Button label={t(c.revoke)} variant="dangerGhost" size="sm" onClick={() => setConfirmRevoke(true)} disabled={busy} data-invite-revoke="" />
                  </div>
                </>
              ) : (
                <Card variant="flat" data-invite-nocode="">
                  <div className={styles.stack}>
                    <b className={styles.title}>{t(c.noCodeTitle)}</b>
                    <p className={styles.body}>{t(c.noCodeBody)}</p>
                    <Button label={t(c.create)} variant="primary" block loading={busy} onClick={() => void create(reissueKeys)} data-invite-create="" />
                  </div>
                </Card>
              )}
              <History items={history} language={language} t={t} busy={busy} onReissue={() => void create(reissueKeys)} />
            </div>
          ) : null}
        </div>
      </Modal>
      <Modal open={open && qrOpen && Boolean(current)} onClose={() => setQrOpen(false)} size={560} title={t(c.qrTitle)} description={t(c.qrHint)}>
        {current ? (
          <div className={styles.qrBig} data-invite-qr-big="">
            <InviteQr text={current.link} label={t(c.qrAlt)} size="lg" />
            <span className={styles.code}>{current.code}</span>
          </div>
        ) : null}
      </Modal>
      <ConfirmDialog
        open={open && confirmRevoke}
        destructive
        title={t(c.revokeTitle)}
        message={t(c.revokeBody)}
        confirmLabel={t(c.revoke)}
        onConfirm={() => void revoke()}
        onCancel={() => setConfirmRevoke(false)}
      />
    </>
  );
}

function NoticeLine({ notice, t }: { notice: Exclude<Notice, null>; t: Translate }) {
  return (
    <p className={styles.notice} data-invite-notice={notice}>
      <Icon name="info" size={16} />
      <span>{t(notice === "profile" ? c.profileRequired : c.sampleReadOnly)}</span>
      {notice === "profile" ? <Link className={styles.link} href="/app/profile">{t(c.profileLink)}</Link> : null}
    </p>
  );
}

function InviteIntro({ t, busy, onStart }: { t: Translate; busy: boolean; onStart: () => void }) {
  const steps = [["📲", c.step1Title, c.step1Body], ["✍️", c.step2Title, c.step2Body], ["👥", c.step3Title, c.step3Body]] as const;
  const faq = [[c.faq1Q, c.faq1A], [c.faq2Q, c.faq2A], [c.faq3Q, c.faq3A]] as const;
  return (
    <div className={styles.stack} data-invite-intro="">
      <div className={styles.hero}>
        <MacTile emoji="🤝" tone="pink" />
        <b className={styles.heroTitle}>{t(c.introHero)}</b>
        <p className={styles.body}>{t(c.introSub)}</p>
        <span className={styles.row}><Chip label={t(c.selfChip)} tone="teal" /><DensityDots level={3} t={t} /><span className={styles.label}>{t(c.introDensity)}</span></span>
      </div>
      <Card variant="flat" title={t(c.stepsTitle)}>
        <ol className={styles.steps}>
          {steps.map(([emoji, title, body]) => (
            <li key={title.ja} className={styles.step}><span className={styles.stepEmoji} aria-hidden>{emoji}</span><b>{t(title)}</b><span className={styles.label}>{t(body)}</span></li>
          ))}
        </ol>
      </Card>
      <Card variant="flat">
        <dl className={styles.faq} aria-label={t(c.faqTitle)}>
          {faq.map(([q, a]) => (
            <div key={q.ja} className={styles.faqItem}><dt><span className={styles.faqMark} aria-hidden>?</span><span>{t(q)}</span></dt><dd>{t(a)}</dd></div>
          ))}
        </dl>
      </Card>
      <Button label={t(c.create)} variant="primary" block loading={busy} onClick={onStart} data-invite-start="" />
    </div>
  );
}

function Quota({ code, language, t }: { code: InviteCodeContract; language: OrbitLanguage; t: Translate }) {
  const standard = useStandardCopy();
  const days = inviteDaysLeft(code.expiresAt, Date.now());
  return (
    <div className={styles.quota} data-invite-quota="">
      <div>
        <span className={styles.label}>{t(c.expiresLabel)}</span>
        <b data-invite-expires="">{t(c.expiresValue, { date: inviteDate(code.expiresAt, language) })}</b>
        <span className={styles.label} data-invite-days="">{fillCopy(standard.chip.daysLeft, { count: days })}</span>
      </div>
      <div>
        <span className={styles.label}>{t(c.usesLabel)}</span>
        <b data-invite-uses="">{t(c.usesValue, { left: Math.max(0, code.maxUses - code.usedCount), max: code.maxUses })}</b>
        <span className={styles.label} data-invite-joined="">{t(c.joinedValue, { count: code.usedCount })}</span>
      </div>
    </div>
  );
}

function ShareKeys({ t, language, keys, profile, available, editing, draftKeys, busy, onEdit, onToggle, onCancel, onApply }: {
  t: Translate;
  language: OrbitLanguage;
  keys: InviteSharedFieldKey[];
  profile: InviteSharedFields | null;
  available: InviteSharedFieldKey[];
  editing: boolean;
  draftKeys: InviteSharedFieldKey[];
  busy: boolean;
  onEdit: () => void;
  onToggle: (key: InviteSharedFieldKey, on: boolean) => void;
  onCancel: () => void;
  onApply: () => void;
}) {
  const standard = useStandardCopy();
  const offContact = !keys.includes("email") && !keys.includes("phone") && (available.includes("email") || available.includes("phone"));
  return (
    <Card variant="flat" data-invite-share="">
      <div className={styles.rowBetween}>
        <b className={styles.smallTitle}>{t(c.shareTitle)}</b>
        {editing ? null : <button type="button" className={`btn ${styles.textButton}`} onClick={onEdit} data-invite-share-edit="">{t(c.shareChange)}</button>}
      </div>
      {editing ? (
        <div className={styles.stack}>
          <ul className={styles.switches}>
            <li className={styles.switchRow}>
              <span className={styles.grow}><b>{t(c.keyName)}</b><span className={styles.label}>{profile?.displayName}</span></span>
              <Chip label={t(c.required)} />
            </li>
            {available.map((key) => (
              <li key={key} className={styles.switchRow} data-invite-switch={key}>
                <span className={styles.grow}><b>{t(INVITE_KEY_COPY[key])}</b><span className={styles.label}>{inviteKeyValue(key, profile, language)}</span></span>
                <Toggle checked={draftKeys.includes(key)} onChange={(on) => onToggle(key, on)} label={t(INVITE_KEY_COPY[key])} />
              </li>
            ))}
          </ul>
          {available.length === 0 ? <p className={styles.label}>{t(c.shareNone)}</p> : null}
          <p className={styles.label}>{t(c.shareEditHint)}</p>
          <div className={styles.row}>
            <Button label={standard.action.cancel} size="sm" onClick={onCancel} />
            <Button label={t(c.shareApply)} size="sm" variant="primary" loading={busy} onClick={onApply} data-invite-share-apply="" />
          </div>
        </div>
      ) : (
        <div className={styles.chips} data-invite-share-chips="">
          {keys.filter((key) => key !== "email" && key !== "phone").map((key) => <Chip key={key} label={t(INVITE_KEY_COPY[key])} tone="lav" />)}
          {keys.includes("email") ? <Chip label={t(c.keyEmail)} tone="lav" /> : null}
          {keys.includes("phone") ? <Chip label={t(c.keyPhone)} tone="lav" /> : null}
          {offContact ? <span className={styles.offChip}><Chip label={t(c.shareOff, { label: t(c.keyContact) })} /></span> : null}
        </div>
      )}
    </Card>
  );
}

const TONES: readonly InviteMessageTone[] = ["polite", "casual", "english"];
const TONE_COPY = { polite: c.tonePolite, casual: c.toneCasual, english: c.toneEnglish } as const;

function MessageDraft({ code, name, tone, onTone, language, t, onCopy }: {
  code: InviteCodeContract;
  name: string;
  tone: InviteMessageTone;
  onTone: (tone: InviteMessageTone) => void;
  language: OrbitLanguage;
  t: Translate;
  onCopy: (text: string) => void;
}) {
  const text = inviteMessageText({ language, link: code.link, name, tone, until: inviteDate(code.expiresAt, tone === "english" ? "en" : language) });
  return (
    <div className={styles.stack} data-invite-draft="">
      <p className={styles.label}>{t(c.draftSub)}</p>
      <Segmented label={t(c.toneLabel)} segments={TONES.map((key) => ({ key, label: t(TONE_COPY[key]) }))} value={tone} onChange={onTone} />
      <p className={styles.draftBox} data-invite-draft-text="">{text}</p>
      <div className={styles.appButtons}>
        <Button label={t(c.draftCopy)} icon="copy" variant="primary" onClick={() => onCopy(text)} data-invite-draft-copy="" />
        <a className={`btn ${styles.linkButton}`} href={lineShareUrl(text)} target="_blank" rel="noopener noreferrer" data-invite-draft-line="">{t(c.openLine)}</a>
        <a className={`btn ${styles.linkButton}`} href={mailDraftUrl(t(c.mailSubject), text)} data-invite-draft-mail=""><Icon name="mail" size={16} />{t(c.openMail)}</a>
      </div>
    </div>
  );
}

function History({ items, language, t, busy, onReissue }: { items: InviteCodeHistoryItem[] | null; language: OrbitLanguage; t: Translate; busy: boolean; onReissue: () => void }) {
  return (
    <section className={styles.stack} data-invite-history="">
      <h3 className={styles.smallTitle}>{t(c.historyTitle)}</h3>
      {items === null ? <Skeleton lines={2} /> : items.length === 0 ? <p className={styles.label}>{t(c.historyEmpty)}</p> : (
        <ul className={styles.historyList}>
          {items.map((item) => (
            <li key={item.code} className={styles.historyRow} data-invite-history-row={item.status}>
              <span className={styles.grow}>
                <span className={styles.row}><b className={styles.mono}>{item.code}</b><Chip label={t(INVITE_HISTORY_STATUS_COPY[item.status])} tone={item.status === "active" ? "ok" : item.status === "full" ? "apricot" : "neutral"} /></span>
                <span className={styles.label}>{t(c.historyCreated, { date: inviteDate(item.createdAt, language) })}</span>
                {item.joined.length ? (
                  <span className={styles.row}>
                    {item.joined.map((person) => <Link key={person.contactId} className={styles.link} href={`/app/contacts/${encodeURIComponent(person.contactId)}`} data-invite-joined-link="">{person.displayName}</Link>)}
                  </span>
                ) : <span className={styles.label}>{t(c.historyNobody)}</span>}
              </span>
              {item.status === "expired" || item.status === "superseded" ? <Button label={t(c.reissue)} size="sm" disabled={busy} onClick={onReissue} data-invite-reissue="" /> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Right rail on 人脈を追加 (b11 netRail): いちばん早い方法 → 招待コードを 3人に送る [コードを作る]. */
export function InviteRailCard({ language, onCreate }: { language: OrbitLanguage; onCreate: () => void }) {
  const t = translator(language);
  return (
    <div className={styles.rail} data-invite-rail="">
      <h2 className={styles.railTitle}><MacTile emoji="🤝" tone="pink" size="sm" />{t(c.railTitle)}</h2>
      <Card>
        <div className={styles.stack}>
          <b className={styles.smallTitle}>{t(c.railLead)}</b>
          <p className={styles.label}>{t(c.railBody)}</p>
          <span><Button label={t(c.railButton)} size="sm" variant="primary" onClick={onCreate} data-invite-rail-create="" /></span>
        </div>
      </Card>
    </div>
  );
}
