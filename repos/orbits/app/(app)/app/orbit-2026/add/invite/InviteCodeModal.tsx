"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { InviteCodeContract, InviteCodeHistoryItem, InviteSharedFieldKey, InviteSharedFields } from "../../../../../../shared/contract/invite-codes";
import type { OrbitLanguage } from "../../../../../../shared/contract/language";
import { inviteMessageText, type InviteMessageTone } from "../../../../../../shared/compute/invite-message-templates";
import { inviteSenderCopy as c } from "../../copy/invite";
import { Button, Card, Chip, ConfirmDialog, ContextMenu, Icon, IconButton, MacTile, Modal, Skeleton, Toggle, useStandardCopy, useToast } from "../../ui";
import { DensityDots, translator, type Translate } from "../add-parts";
import { createInviteCode, dismissInviteMerge, mergeInviteConnection, readCurrentInviteCode, readInviteHistory, readMyProfile, revokeInviteCode, updateCurrentInviteShare } from "./invite-api";
import {
  INVITE_HISTORY_STATUS_COPY,
  INVITE_KEY_COPY,
  inviteDate,
  inviteDefaultKeys,
  inviteFieldsFromProfile,
  inviteGuideSeen,
  inviteKeysWithValues,
  inviteKeyValue,
  inviteLinkLabel,
  markInviteGuideSeen,
  newInviteKey,
  orderedInviteKeys,
} from "./invite-model";
import { InviteQr } from "./InviteQr";
import styles from "./invite.module.css";

type Phase = "loading" | "intro" | "share" | "failed";
type Notice = "profile" | "sample" | null;
type MergeChoice = "merge" | "dismiss";

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * 人脈を追加 › 招待コード (b11 #14「招待コード · Web」, the newer board; b9 A5 ① and b5 E6 are older drafts — DESIGN
 * §2.4): a 560 dialog (a bottom sheet under 768). The first time it explains (3 steps + 3 questions); after that
 * it opens on 共有 — QR, the 8-character code, the link with コピー, 有効期限 / 使える人数, 相手に届くあなたの情報
 * [変更] (R15 P1: the current code keeps its code and link, only what it shares changes), the message draft (tone
 * picked from 「ていねい ▾」, two-line preview, 下書きをコピー — Orbit never sends) and 無効にする (confirmed).
 * これまでのコード shows when there is no code standing (expired / turned off → 再発行 one press), or when a person
 * who joined may be someone already in my network (同じ人かも: 統合する / 別の人 — nothing merges until I say so).
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
  const [editing, setEditing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [draftKeys, setDraftKeys] = useState<InviteSharedFieldKey[]>([]);
  const [tone, setTone] = useState<InviteMessageTone>("polite");
  const createKey = useRef<string | null>(null);
  const shareKey = useRef<string | null>(null);
  const [deciding, setDeciding] = useState<string | null>(null);
  // One key per (choice, person) until it succeeds, so a retry after a lost answer is the same request.
  const decideKeys = useRef(new Map<string, string>());

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
      setShowHistory(false);
      setConfirmRevoke(false);
    }
  }, [open, load]);

  const available = useMemo(() => inviteKeysWithValues(profile), [profile]);
  const currentKeys = useMemo(() => (current ? inviteKeysWithValues(current.shared) : []), [current]);
  const pendingMerges = useMemo(() => (history ?? []).reduce((count, item) => count + item.joined.filter((person) => person.mergeSuggestion).length, 0), [history]);

  const failNotice = useCallback((reason: string | null, fallback: typeof c.createFailed) => {
    if (reason === "PROFILE_REQUIRED") setNotice("profile");
    else if (reason === "SAMPLE_READ_ONLY") setNotice("sample");
    else toast.error(t(fallback));
  }, [toast, t]);

  const create = useCallback(async (keys: InviteSharedFieldKey[]) => {
    setBusy(true);
    setNotice(null);
    createKey.current ??= newInviteKey("invite-create");
    const result = await createInviteCode({ displayName: profile?.displayName ?? "", idempotencyKey: createKey.current, sharedKeys: orderedInviteKeys(keys) });
    setBusy(false);
    createKey.current = null;
    if (result.ok === true) {
      setCurrent(result.data);
      setEditing(false);
      setPhase("share");
      void loadHistory();
      return;
    }
    // The notice only shows on 共有: a failed first code from 説明 moves there too (复核 M3).
    setPhase("share");
    failNotice(result.reason, c.createFailed);
  }, [profile, loadHistory, failNotice]);

  /** R15 P1: the same code shares the new set from now on (people already connected keep theirs). */
  const applyShare = async () => {
    setBusy(true);
    setNotice(null);
    shareKey.current ??= newInviteKey("invite-share");
    const result = await updateCurrentInviteShare({ idempotencyKey: shareKey.current, sharedKeys: orderedInviteKeys(draftKeys) });
    setBusy(false);
    shareKey.current = null;
    if (result.ok === true) {
      setCurrent(result.data);
      setEditing(false);
      toast.success(t(c.shareSaved));
      return;
    }
    failNotice(result.reason, c.shareFailed);
  };

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

  /** 同じ人かも: 統合する / 別の人 for a person who joined (R15 复核 S1); the list is read again afterwards. */
  const decide = async (contactId: string, choice: MergeChoice) => {
    const slot = `${choice}:${contactId}`;
    const key = decideKeys.current.get(slot) ?? newInviteKey(`invite-${choice}`);
    decideKeys.current.set(slot, key);
    setDeciding(contactId);
    const result = choice === "merge" ? await mergeInviteConnection(contactId, key) : await dismissInviteMerge(contactId, key);
    if (result.ok === true) {
      decideKeys.current.delete(slot);
      await loadHistory();
    } else {
      toast.error(standard.toast.saveFailed);
    }
    setDeciding(null);
  };

  const copy = async (text: string, done: typeof c.linkCopied) => {
    if (await copyText(text)) toast.success(t(done));
    else toast.error(t(c.copyFailed));
  };

  const reissueKeys = current ? currentKeys : inviteDefaultKeys(available);
  const draftText = current ? inviteMessageText({ language, link: current.link, name: profile?.displayName ?? "", tone, until: inviteDate(current.expiresAt, tone === "english" ? "en" : language) }) : "";
  const historyOpen = !current || showHistory;

  return (
    <>
      <Modal open={open} onClose={onClose} size={560} title={t(c.title)} header={(
        <div className={styles.head}>
          <div className={styles.headText}><b className={styles.headTitle}>{t(c.title)}</b><p className={styles.lbl}>{t(c.subtitle)}</p></div>
          <IconButton icon="x" label={standard.action.close} onClick={onClose} />
        </div>
      )}>
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
            <>
              {notice ? <NoticeLine notice={notice} t={t} /> : null}
              {current ? (
                <>
                  <div className={styles.codeRow} data-invite-code-card="">
                    <InviteQr text={current.link} label={t(c.qrAlt)} />
                    <div className={styles.codeSide}>
                      <div className={styles.lbl}>{t(c.codeLabel)}</div>
                      <div className={styles.code} data-invite-code="">{current.code}</div>
                      <div className={`${styles.lbl} ${styles.linkLabel}`}>{t(c.linkLabel)}</div>
                      <div className={styles.linkRow}>
                        <span className={styles.linkBox} data-invite-link="">{inviteLinkLabel(current.link)}</span>
                        <Button label={standard.action.copy} icon="copy" variant="primary" onClick={() => void copy(current.link, c.linkCopied)} data-invite-copy-link="" />
                      </div>
                    </div>
                  </div>
                  <div className={styles.quota} data-invite-quota="">
                    <div><span className={styles.lbl}>{t(c.expiresLabel)}</span><b data-invite-expires="">{t(c.expiresValue, { date: inviteDate(current.expiresAt, language) })}</b></div>
                    <div><span className={styles.lbl}>{t(c.usesLabel)}</span><b data-invite-uses="">{t(c.usesValue, { left: Math.max(0, current.maxUses - current.usedCount), max: current.maxUses })}</b></div>
                  </div>
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
                    onApply={() => void applyShare()}
                  />
                  <MessageDraft text={draftText} tone={tone} onTone={setTone} t={t} />
                  {pendingMerges > 0 && !showHistory ? (
                    <p className={styles.mergeNotice} data-invite-merge-pending="">
                      <Icon name="info" size={16} /><span>{t(c.mergePending, { count: pendingMerges })}</span>
                      <button type="button" className={styles.textButton} onClick={() => setShowHistory(true)} data-invite-merge-review="">{t(c.mergeReview)}</button>
                    </p>
                  ) : null}
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
              {historyOpen ? <History items={history} language={language} t={t} busy={busy} deciding={deciding} onReissue={() => void create(reissueKeys)} onDecide={(contactId, choice) => void decide(contactId, choice)} /> : null}
              {current ? (
                <div className={styles.foot}>
                  <span className={`${styles.lbl} ${styles.footHint}`}>
                    {t(c.noSendShort)} · <button type="button" className={styles.revokeLink} onClick={() => setConfirmRevoke(true)} disabled={busy} data-invite-revoke="">{t(c.revoke)}</button>
                  </span>
                  <Button label={t(c.draftCopy)} icon="copy" onClick={() => void copy(draftText, c.draftCopied)} data-invite-draft-copy="" />
                </div>
              ) : null}
            </>
          ) : null}
        </div>
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
        <span className={styles.row}><Chip label={t(c.selfChip)} tone="teal" /><DensityDots level={3} t={t} /><span className={styles.lbl}>{t(c.introDensity)}</span></span>
      </div>
      <Card variant="flat" title={t(c.stepsTitle)}>
        <ol className={styles.steps}>
          {steps.map(([emoji, title, body]) => (
            <li key={title.ja} className={styles.step}><span className={styles.stepEmoji} aria-hidden>{emoji}</span><b>{t(title)}</b><span className={styles.lbl}>{t(body)}</span></li>
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
  const offContact = !keys.includes("email") && !keys.includes("phone");
  return (
    <div className={styles.infoCard} data-invite-share="">
      <div className={styles.rowBetween}>
        <b className={styles.infoTitle}>{t(c.shareTitle)}</b>
        {editing ? null : <button type="button" className={styles.textButton} onClick={onEdit} data-invite-share-edit="">{t(c.shareChange)}</button>}
      </div>
      {editing ? (
        <div className={styles.stack}>
          <ul className={styles.switches}>
            <li className={styles.switchRow}>
              <span className={styles.grow}><b>{t(c.keyName)}</b><span className={styles.lbl}>{profile?.displayName}</span></span>
              <Chip label={t(c.required)} />
            </li>
            {available.map((key) => (
              <li key={key} className={styles.switchRow} data-invite-switch={key}>
                <span className={styles.grow}><b>{t(INVITE_KEY_COPY[key])}</b><span className={styles.lbl}>{inviteKeyValue(key, profile, language)}</span></span>
                <Toggle checked={draftKeys.includes(key)} onChange={(on) => onToggle(key, on)} label={t(INVITE_KEY_COPY[key])} />
              </li>
            ))}
          </ul>
          {available.length === 0 ? <p className={styles.lbl}>{t(c.shareNone)}</p> : null}
          <p className={styles.lbl}>{t(c.shareEditHint)}</p>
          <div className={styles.row}>
            <Button label={standard.action.cancel} size="sm" onClick={onCancel} />
            <Button label={t(c.shareApply)} size="sm" variant="primary" loading={busy} onClick={onApply} data-invite-share-apply="" />
          </div>
        </div>
      ) : (
        <div className={styles.chips} data-invite-share-chips="">
          {keys.filter((key) => key !== "email" && key !== "phone").map((key) => <span key={key} className={styles.chip}>{t(INVITE_KEY_COPY[key])}</span>)}
          {keys.includes("email") ? <span className={styles.chip}>{t(c.keyEmail)}</span> : null}
          {keys.includes("phone") ? <span className={styles.chip}>{t(c.keyPhone)}</span> : null}
          {offContact ? <span className={`${styles.chip} ${styles.chipOff}`}>{t(c.shareOff, { label: t(c.keyContact) })}</span> : null}
        </div>
      )}
    </div>
  );
}

const TONES: readonly InviteMessageTone[] = ["polite", "casual", "english"];
const TONE_COPY = { polite: c.tonePolite, casual: c.toneCasual, english: c.toneEnglish } as const;

/** b11 #14 .k-wimsg: title + 「ていねい ▾」 (tone menu) and a two-line preview of the draft. */
function MessageDraft({ text, tone, onTone, t }: { text: string; tone: InviteMessageTone; onTone: (tone: InviteMessageTone) => void; t: Translate }) {
  const [menu, setMenu] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  return (
    <div className={styles.draftCard} data-invite-draft="">
      <div className={styles.rowBetween}>
        <b className={styles.draftTitle}>{t(c.draftTitle)}</b>
        <button ref={anchor} type="button" className={styles.toneButton} aria-haspopup="menu" aria-expanded={menu} aria-label={`${t(c.toneMenu)}: ${t(TONE_COPY[tone])}`} onClick={() => setMenu(true)} data-invite-tone={tone}>
          {t(TONE_COPY[tone])} ▾
        </button>
      </div>
      <p className={styles.draftPreview} data-invite-draft-text="">{text}</p>
      <ContextMenu open={menu} onClose={() => setMenu(false)} anchor={anchor} label={t(c.toneMenu)}
        items={TONES.map((key) => ({ key, label: t(TONE_COPY[key]), icon: key === tone ? "check" : undefined, onSelect: () => { onTone(key); setMenu(false); } }))} />
    </div>
  );
}

function History({ items, language, t, busy, deciding, onReissue, onDecide }: {
  items: InviteCodeHistoryItem[] | null;
  language: OrbitLanguage;
  t: Translate;
  busy: boolean;
  /** The person whose 同じ人かも answer is being saved (both buttons wait). */
  deciding: string | null;
  onReissue: () => void;
  onDecide: (contactId: string, choice: MergeChoice) => void;
}) {
  return (
    <section className={styles.stack} data-invite-history="">
      <h3 className={styles.smallTitle}>{t(c.historyTitle)}</h3>
      {items === null ? <Skeleton lines={2} /> : items.length === 0 ? <p className={styles.lbl}>{t(c.historyEmpty)}</p> : (
        <ul className={styles.historyList}>
          {items.map((item) => (
            <li key={item.code} className={styles.historyRow} data-invite-history-row={item.status}>
              <span className={styles.grow}>
                <span className={styles.row}><b className={styles.mono}>{item.code}</b><Chip label={t(INVITE_HISTORY_STATUS_COPY[item.status])} tone={item.status === "active" ? "ok" : item.status === "full" ? "apricot" : "neutral"} /></span>
                <span className={styles.lbl}>{t(c.historyCreated, { date: inviteDate(item.createdAt, language) })}</span>
                {item.joined.length ? (
                  <span className={styles.row}>
                    {item.joined.map((person) => <Link key={person.contactId} className={styles.link} href={`/app/contacts/${encodeURIComponent(person.contactId)}`} data-invite-joined-link="">{person.displayName}</Link>)}
                  </span>
                ) : <span className={styles.lbl}>{t(c.historyNobody)}</span>}
                {item.joined.map((person) => person.mergeSuggestion ? (
                  <span key={`merge-${person.contactId}`} className={styles.merge} data-invite-merge={person.contactId}>
                    <span className={styles.mergeText}><Icon name="info" size={16} />{t(c.mergeMaybe, { name: person.mergeSuggestion.displayName })}</span>
                    <span className={styles.row}>
                      <Button label={t(c.mergeAccept)} size="sm" variant="primary" loading={deciding === person.contactId} disabled={deciding !== null} onClick={() => onDecide(person.contactId, "merge")} data-invite-merge-accept="" />
                      <Button label={t(c.mergeReject)} size="sm" disabled={deciding !== null} onClick={() => onDecide(person.contactId, "dismiss")} data-invite-merge-reject="" />
                    </span>
                  </span>
                ) : null)}
              </span>
              {item.status === "expired" || item.status === "superseded" ? <Button label={t(c.reissue)} size="sm" disabled={busy} onClick={onReissue} data-invite-reissue="" /> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
