// R15 `contacts/new/invite` 招待コード · 発出方 (DESIGN add-and-invite §2.4; b11 A2 ①②③, b9 A5 ①, b5 E6):
// the first time 説明 (🤝, 3 steps, 3 questions, コードをつくる; remembered on this device); after that 共有 —
// a big QR, the 8-character code and the link, [QR を表示] (full sheet to scan face to face), [リンクをコピー],
// [メッセージで送る] (draft sheet: three fixed tones, コピー / LINE で開く / メールで開く — Orbit never sends),
// 有効期限 · あと N日, 使える人数 残り N / 10人 · 登録済み N人, 相手に届くあなたの情報 [変更] (changing it makes a
// new code; the server takes keys only), 無効にする (action sheet, focus on キャンセル), and これまでのコード
// (a joined person who may be someone already in my network shows 「同じ人かも」 with 統合する / 別の人 — R15 复核 S1).
// Leaving the page (another page pushed on top) closes any open sheet: they render in the root portal (复核 M3).
import * as Clipboard from "expo-clipboard";
import { type Href, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Linking, StyleSheet, View } from "react-native";

import type { InviteCodeContract, InviteCodeHistoryItem, InviteCodeHistoryJoined, InviteSharedFieldKey, InviteSharedFields } from "../../../api/contract/invite-codes";
import { inviteMessageText, type InviteMessageTone } from "../../../api/compute/invite-message-templates";
import { AppScreen } from "../../../components/AppScreen";
import { ActionSheet, BottomSheet, Button, Card, Chip, Icon, MacTile, RetryCard, Segmented, Skeleton, Toggle, UiPressable, UiText, useToast } from "../../../components/ui";
import { createThemedStyles } from "../../../design/theme";
import { radius } from "../../../design/tokens";
import { useOrbitLocale } from "../../../i18n/OrbitLocaleContext";
import { createTranslator, type OrbitTranslator } from "../../../i18n/messages";
import { fillCopy, useStandardCopy } from "../../../i18n/standard-copy";
import { markInviteGuideSeen, readInviteGuideSeen } from "../add-storage";
import { Caption, DensityDots, FadeIn, SectionTitle, useAddColors, useAddStyles } from "../add-ui";
import { useInviteApi, type InviteApi } from "./invite-api";
import {
  INVITE_HISTORY_STATUS_COPY,
  INVITE_KEY_COPY,
  inviteDate,
  inviteDaysLeft,
  inviteDefaultKeys,
  inviteFieldsFromProfile,
  inviteKeysWithValues,
  inviteKeyValue,
  inviteLinkLabel,
  lineShareUrl,
  mailDraftUrl,
  newInviteKey,
  orderedInviteKeys,
  toggleInviteKey,
} from "./invite-model";
import { InviteMergeSuggestionRow, useInviteMerge } from "./InviteMergeSuggestion";
import { InviteQr } from "./InviteQr";

type Phase = "loading" | "failed" | "intro" | "share";
type Notice = "profile" | "sample" | null;

/** Copy to the clipboard (expo-clipboard); false when the system refused. */
export async function copyInviteText(text: string): Promise<boolean> {
  try {
    await Clipboard.setStringAsync(text);
    return true;
  } catch {
    return false;
  }
}

/** Open a draft in LINE / Mail; false when no app takes the link (the screen says so). */
export async function openInviteDraft(url: string): Promise<boolean> {
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

export function InviteSenderScreen({ api: injected, now = Date.now }: { api?: InviteApi; now?: () => number } = {}) {
  const fallbackApi = useInviteApi();
  const api = injected ?? fallbackApi;
  const router = useRouter();
  const toast = useToast();
  const { t } = useOrbitLocale();
  const standard = useStandardCopy();
  const { styles } = useAddStyles();
  const [phase, setPhase] = useState<Phase>("loading");
  const [current, setCurrent] = useState<InviteCodeContract | null>(null);
  const [profile, setProfile] = useState<InviteSharedFields | null>(null);
  const [history, setHistory] = useState<InviteCodeHistoryItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [sheet, setSheet] = useState<"qr" | "draft" | "revoke" | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftKeys, setDraftKeys] = useState<InviteSharedFieldKey[]>([]);
  const createKey = useRef<string | null>(null);

  const loadHistory = useCallback(async () => {
    const result = await api.history();
    setHistory(result.ok ? [...result.data.items] : []);
  }, [api]);

  const load = useCallback(async () => {
    setPhase("loading");
    setNotice(null);
    const [code, me, seen] = await Promise.all([api.current(), api.profile(), readInviteGuideSeen()]);
    if (!code.ok) {
      setPhase("failed");
      return;
    }
    setCurrent(code.data);
    setProfile(me.ok ? inviteFieldsFromProfile(me.data.profile) : null);
    setPhase(code.data === null && !seen ? "intro" : "share");
    void loadHistory();
  }, [api, loadHistory]);

  useEffect(() => { void load(); }, [load]);
  // The sheets live in the root portal, and a pushed page keeps this one mounted: close them on blur (复核 M3).
  useFocusEffect(useCallback(() => () => setSheet(null), []));

  const merging = useInviteMerge(api);
  const settleSuggestion = useCallback(async (action: "merge" | "dismiss", contactId: string) => {
    const view = await (action === "merge" ? merging.merge(contactId) : merging.dismiss(contactId));
    if (view) await loadHistory();
  }, [merging, loadHistory]);

  const available = useMemo(() => inviteKeysWithValues(profile), [profile]);
  const currentKeys = useMemo(() => (current ? inviteKeysWithValues(current.shared) : []), [current]);

  const create = useCallback(async (keys: InviteSharedFieldKey[]) => {
    setBusy(true);
    setNotice(null);
    createKey.current ??= newInviteKey("invite-create");
    const result = await api.create({ displayName: profile?.displayName ?? "", idempotencyKey: createKey.current, sharedKeys: orderedInviteKeys(keys) });
    setBusy(false);
    createKey.current = null;
    if (result.ok) {
      setCurrent(result.data);
      setEditing(false);
      setPhase("share");
      void loadHistory();
      return;
    }
    setPhase("share");
    if (result.reason === "PROFILE_REQUIRED") setNotice("profile");
    else if (result.reason === "SAMPLE_READ_ONLY") setNotice("sample");
    else toast.error(t("add.invite.createFailed"));
  }, [api, profile, loadHistory, toast, t]);

  const startFromIntro = () => {
    void markInviteGuideSeen();
    if (current) setPhase("share");
    else void create(inviteDefaultKeys(available.length ? available : ["organization", "offering", "seeking"]));
  };

  const revoke = async () => {
    setSheet(null);
    if (!current) return;
    setBusy(true);
    const result = await api.revoke(current.code);
    setBusy(false);
    if (!result.ok) {
      toast.error(t("add.invite.revokeFailed"));
      return;
    }
    setCurrent(null);
    toast.success(t("add.invite.revoked"));
    void loadHistory();
  };

  const copy = async (text: string) => {
    if (await copyInviteText(text)) toast.success(t("add.invite.linkCopied"));
    else toast.error(t("add.invite.copyFailed"));
  };

  const reissueKeys = current ? currentKeys : inviteDefaultKeys(available);

  return (
    <AppScreen title={t("add.invite.title")}>
      <FadeIn testID="invite-sender">
        <View style={styles.stack} testID={`invite-phase-${phase}`}>
          {phase === "loading" ? <Skeleton lines={4} /> : null}
          {phase === "failed" ? <RetryCard title={t("add.invite.loadFailed")} onRetry={() => void load()} /> : null}
          {phase === "intro" ? <InviteIntro busy={busy} onStart={startFromIntro} /> : null}
          {phase === "share" ? (
            <>
              <Caption>{t("add.invite.shareSub")}</Caption>
              {notice ? <NoticeLine notice={notice} onProfile={() => router.push("/profile/edit" as Href)} /> : null}
              {current ? (
                <>
                  <CodeCard code={current} onShowQr={() => setSheet("qr")} onCopy={() => void copy(current.link)} onMessage={() => setSheet("draft")} />
                  <Quota code={current} now={now} />
                  <ShareKeys
                    keys={currentKeys}
                    profile={profile}
                    available={available}
                    editing={editing}
                    draftKeys={draftKeys}
                    busy={busy}
                    onEdit={() => { setDraftKeys(currentKeys); setEditing(true); }}
                    onToggle={(key, on) => setDraftKeys((keys) => toggleInviteKey(keys, key, on))}
                    onCancel={() => setEditing(false)}
                    onApply={() => void create(draftKeys)}
                  />
                  <View style={styles.rowBetween}>
                    <View style={styles.grow}><Caption>{t("add.invite.noSend")}</Caption></View>
                    <View testID="invite-revoke"><Button label={t("add.invite.revoke")} variant="dangerGhost" size="sm" disabled={busy} onPress={() => setSheet("revoke")} /></View>
                  </View>
                </>
              ) : (
                <Card variant="flat">
                  <View style={styles.stack} testID="invite-nocode">
                    <UiText style={styles.strong}>{t("add.invite.noCodeTitle")}</UiText>
                    <Caption>{t("add.invite.noCodeBody")}</Caption>
                    <Button label={t("add.invite.create")} variant="primary" block loading={busy} onPress={() => void create(reissueKeys)} />
                  </View>
                </Card>
              )}
              <History
                items={history}
                busy={busy}
                mergingId={merging.busyId}
                onReissue={() => void create(reissueKeys)}
                onOpenPerson={(contactId) => router.push(`/contacts/${encodeURIComponent(contactId)}` as Href)}
                onMerge={(contactId) => void settleSuggestion("merge", contactId)}
                onDismiss={(contactId) => void settleSuggestion("dismiss", contactId)}
              />
            </>
          ) : null}
        </View>
      </FadeIn>
      {current ? (
        <>
          <BottomSheet visible={sheet === "qr"} onClose={() => setSheet(null)} accessibilityLabel={t("add.invite.qrTitle")}>
            <View style={[styles.stack, styles.centered]} testID="invite-qr-sheet">
              <UiText accessibilityRole="header" style={styles.title}>{t("add.invite.qrTitle")}</UiText>
              <Caption>{t("add.invite.qrHint")}</Caption>
              <InviteQr text={current.link} label={t("add.invite.qrAlt")} size={280} testID="invite-qr-large" />
              <UiText selectable style={styles.bigTitle}>{current.code}</UiText>
            </View>
          </BottomSheet>
          <MessageDraftSheet visible={sheet === "draft"} code={current} name={profile?.displayName ?? ""} onClose={() => setSheet(null)} onCopy={(text) => void copy(text)} />
          <ActionSheet
            visible={sheet === "revoke"}
            title={t("add.invite.revokeTitle")}
            effects={[{ icon: "x-circle", text: t("add.invite.revokeEffect1") }, { icon: "users", text: t("add.invite.revokeEffect2") }]}
            options={[{ destructive: true, key: "revoke", label: t("add.invite.revoke") }, { key: "cancel", label: standard.action.cancel }]}
            defaultFocusKey="cancel"
            onSelect={(key) => (key === "revoke" ? void revoke() : setSheet(null))}
            onClose={() => setSheet(null)}
          />
        </>
      ) : null}
    </AppScreen>
  );
}

function NoticeLine({ notice, onProfile }: { notice: Exclude<Notice, null>; onProfile: () => void }) {
  const { t } = useOrbitLocale();
  const { styles } = useAddStyles();
  const colors = useAddColors();
  return (
    <View style={styles.notice} testID={`invite-notice-${notice}`}>
      <Icon name="info" size={16} color={colors.ink3Text} />
      <View style={[styles.grow, styles.tightStack]}>
        <UiText style={styles.body}>{t(notice === "profile" ? "add.invite.profileRequired" : "add.invite.sampleReadOnly")}</UiText>
        {notice === "profile" ? <View><Button label={t("add.invite.profileLink")} size="sm" onPress={onProfile} /></View> : null}
      </View>
    </View>
  );
}

function InviteIntro({ busy, onStart }: { busy: boolean; onStart: () => void }) {
  const { t } = useOrbitLocale();
  const { styles } = useAddStyles();
  const local = useStyles().styles;
  const steps = [["📲", "add.invite.step1Title", "add.invite.step1Body"], ["✍️", "add.invite.step2Title", "add.invite.step2Body"], ["👥", "add.invite.step3Title", "add.invite.step3Body"]] as const;
  const faq = [["add.invite.faq1Q", "add.invite.faq1A"], ["add.invite.faq2Q", "add.invite.faq2A"], ["add.invite.faq3Q", "add.invite.faq3A"]] as const;
  return (
    <View style={styles.stack} testID="invite-intro">
      <Caption>{t("add.invite.introSub")}</Caption>
      <View style={[styles.stack, styles.centered]}>
        <MacTile emoji="🤝" tone="pink" />
        <UiText accessibilityRole="header" style={styles.bigTitle}>{t("add.invite.introHero")}</UiText>
        <UiText style={[styles.body, local.center]}>{t("add.invite.introBody")}</UiText>
        <View style={styles.row}>
          <Chip label={t("add.invite.selfChip")} tone="teal" />
          <DensityDots level={3} />
          <Caption>{t("add.invite.introDensity")}</Caption>
        </View>
      </View>
      <SectionTitle>{t("add.invite.stepsTitle")}</SectionTitle>
      <Card variant="flat">
        <View style={styles.stack}>
          {steps.map(([emoji, title, body], index) => (
            <View key={title} style={styles.row}>
              <UiText style={local.stepNumber}>{index + 1}</UiText>
              <UiText importantForAccessibility="no" accessibilityElementsHidden style={local.emoji}>{emoji}</UiText>
              <View style={styles.grow}>
                <UiText style={styles.strong}>{t(title)}</UiText>
                <Caption>{t(body)}</Caption>
              </View>
            </View>
          ))}
        </View>
      </Card>
      <SectionTitle>{t("add.invite.faqTitle")}</SectionTitle>
      <Card variant="flat">
        <View style={styles.stack}>
          {faq.map(([question, answer]) => (
            <View key={question} style={styles.tightStack}>
              <UiText style={styles.strong}>{`? ${t(question)}`}</UiText>
              <UiText style={styles.body}>{t(answer)}</UiText>
            </View>
          ))}
        </View>
      </Card>
      <View testID="invite-start"><Button label={t("add.invite.create")} variant="primary" block loading={busy} onPress={onStart} /></View>
    </View>
  );
}

function CodeCard({ code, onShowQr, onCopy, onMessage }: { code: InviteCodeContract; onShowQr: () => void; onCopy: () => void; onMessage: () => void }) {
  const { t } = useOrbitLocale();
  const { styles } = useAddStyles();
  const local = useStyles().styles;
  return (
    <Card>
      <View style={[styles.stack, styles.centered]} testID="invite-code-card">
        <InviteQr text={code.link} label={t("add.invite.qrAlt")} size={184} testID="invite-qr" />
        <View style={[styles.tightStack, styles.centered]}>
          <Caption>{t("add.invite.codeLabel")}</Caption>
          <UiText selectable style={local.code} testID="invite-code">{code.code}</UiText>
          <Caption>{t("add.invite.linkLabel")}</Caption>
          <UiText selectable style={styles.body} testID="invite-link">{inviteLinkLabel(code.link)}</UiText>
        </View>
        <View style={local.actions}>
          <View testID="invite-show-qr"><Button label={t("add.invite.showQr")} icon="grid" size="sm" onPress={onShowQr} /></View>
          <View testID="invite-copy-link"><Button label={t("add.invite.copyLink")} icon="copy" size="sm" variant="primary" onPress={onCopy} /></View>
          <View testID="invite-message"><Button label={t("add.invite.sendMessage")} icon="chat" size="sm" onPress={onMessage} /></View>
        </View>
      </View>
    </Card>
  );
}

function Quota({ code, now }: { code: InviteCodeContract; now: () => number }) {
  const { language, t } = useOrbitLocale();
  const copy = useStandardCopy();
  const { styles } = useAddStyles();
  const local = useStyles().styles;
  const days = inviteDaysLeft(code.expiresAt, now());
  return (
    <View style={local.quota} testID="invite-quota">
      <View style={[local.quotaCell, styles.tightStack]}>
        <Caption>{t("add.invite.expiresLabel")}</Caption>
        <UiText style={styles.strong} testID="invite-expires">{t("add.invite.expiresValue", { date: inviteDate(code.expiresAt, language, t) })}</UiText>
        <Caption>{fillCopy(copy.chip.daysLeft, { count: days })}</Caption>
      </View>
      <View style={[local.quotaCell, styles.tightStack]}>
        <Caption>{t("add.invite.usesLabel")}</Caption>
        <UiText style={styles.strong} testID="invite-uses">{t("add.invite.usesValue", { left: Math.max(0, code.maxUses - code.usedCount), max: code.maxUses })}</UiText>
        <Caption>{t("add.invite.joinedValue", { count: code.usedCount })}</Caption>
      </View>
    </View>
  );
}

function ShareKeys({ keys, profile, available, editing, draftKeys, busy, onEdit, onToggle, onCancel, onApply }: {
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
  const { t } = useOrbitLocale();
  const copy = useStandardCopy();
  const { styles } = useAddStyles();
  const offContact = !keys.includes("email") && !keys.includes("phone");
  return (
    <Card variant="flat">
      <View style={styles.stack} testID="invite-share">
        <View style={styles.rowBetween}>
          <UiText style={styles.strong}>{t("add.invite.shareTitle")}</UiText>
          {editing ? null : <View testID="invite-share-edit"><Button label={t("add.invite.shareChange")} size="sm" variant="ghost" onPress={onEdit} /></View>}
        </View>
        {editing ? (
          <View style={styles.stack}>
            <InviteKeySwitches name={profile?.displayName ?? ""} fields={profile} available={available} keys={draftKeys} onToggle={onToggle} />
            {available.length === 0 ? <Caption>{t("add.invite.shareNone")}</Caption> : null}
            <Caption>{t("add.invite.shareEditHint")}</Caption>
            <View style={styles.row}>
              <Button label={copy.action.cancel} size="sm" onPress={onCancel} />
              <View testID="invite-share-apply"><Button label={t("add.invite.shareApply")} size="sm" variant="primary" loading={busy} onPress={onApply} /></View>
            </View>
          </View>
        ) : (
          <View style={styles.row} testID="invite-share-chips">
            {keys.filter((key) => key !== "email" && key !== "phone").map((key) => <Chip key={key} label={t(INVITE_KEY_COPY[key])} tone="lav" />)}
            {keys.includes("email") ? <Chip label={t("add.invite.keyEmail")} tone="lav" /> : null}
            {keys.includes("phone") ? <Chip label={t("add.invite.keyPhone")} tone="lav" /> : null}
            {offContact ? <Chip label={t("add.invite.shareOff", { label: t("add.invite.keyContact") })} /> : null}
          </View>
        )}
      </View>
    </Card>
  );
}

/** 名前 (always, not a switch) + one switch per key the profile has a value for. Shared with the receiver page and InviteShareSheet. */
export function InviteKeySwitches({ name, fields, available, keys, onToggle, t: given }: {
  name: string;
  fields: InviteSharedFields | null;
  available: readonly InviteSharedFieldKey[];
  keys: readonly InviteSharedFieldKey[];
  onToggle: (key: InviteSharedFieldKey, on: boolean) => void;
  t?: OrbitTranslator;
}) {
  const locale = useOrbitLocale();
  const t = given ?? locale.t;
  const { styles } = useAddStyles();
  return (
    <View style={styles.stack} testID="invite-switches">
      <View style={styles.rowBetween} testID="invite-switch-displayName">
        <View style={styles.grow}>
          <UiText style={styles.strong}>{t("add.invite.keyName")}</UiText>
          {name ? <Caption>{name}</Caption> : null}
        </View>
        <Chip label={t("add.invite.required")} />
        <Toggle value disabled onValueChange={() => undefined} accessibilityLabel={t("add.invite.keyName")} />
      </View>
      {available.map((key) => (
        <View key={key} style={styles.rowBetween} testID={`invite-switch-${key}`}>
          <View style={styles.grow}>
            <UiText style={styles.strong}>{t(INVITE_KEY_COPY[key])}</UiText>
            <Caption>{inviteKeyValue(key, fields, t)}</Caption>
          </View>
          <Toggle value={keys.includes(key)} onValueChange={(on) => onToggle(key, on)} accessibilityLabel={t(INVITE_KEY_COPY[key])} />
        </View>
      ))}
    </View>
  );
}

const TONES: readonly InviteMessageTone[] = ["polite", "casual", "english"];
const TONE_COPY = { casual: "add.invite.toneCasual", english: "add.invite.toneEnglish", polite: "add.invite.tonePolite" } as const;

function MessageDraftSheet({ visible, code, name, onClose, onCopy }: { visible: boolean; code: InviteCodeContract; name: string; onClose: () => void; onCopy: (text: string) => void }) {
  const { language, t } = useOrbitLocale();
  const copy = useStandardCopy();
  const toast = useToast();
  const { styles } = useAddStyles();
  const local = useStyles().styles;
  const [tone, setTone] = useState<InviteMessageTone>("polite");
  // The English draft writes its date in English whatever the screen language (「Oct 14」).
  const until = tone === "english" ? inviteDate(code.expiresAt, "en", ENGLISH) : inviteDate(code.expiresAt, language, t);
  const text = inviteMessageText({ language, link: code.link, name, tone, until });
  const open = async (url: string) => {
    if (!(await openInviteDraft(url))) toast.error(t("add.invite.openFailed"));
  };
  return (
    <BottomSheet visible={visible} onClose={onClose} accessibilityLabel={t("add.invite.draftTitle")}>
      <View style={styles.stack} testID="invite-draft-sheet">
        <UiText accessibilityRole="header" style={styles.title}>{t("add.invite.draftTitle")}</UiText>
        <Caption>{t("add.invite.draftSub")}</Caption>
        <Segmented accessibilityLabel={t("add.invite.toneLabel")} segments={TONES.map((key) => ({ key, label: t(TONE_COPY[key]) }))} value={tone} onChange={setTone} />
        <View style={local.draftBox}><UiText selectable style={styles.body} testID="invite-draft-text">{text}</UiText></View>
        <View style={local.actions}>
          <View testID="invite-draft-copy"><Button label={copy.action.copy} icon="copy" variant="primary" size="sm" onPress={() => onCopy(text)} /></View>
          <View testID="invite-draft-line"><Button label={t("add.invite.openLine")} icon="chat" size="sm" onPress={() => void open(lineShareUrl(text))} /></View>
          <View testID="invite-draft-mail"><Button label={t("add.invite.openMail")} icon="mail" size="sm" onPress={() => void open(mailDraftUrl(t("add.invite.mailSubject"), text))} /></View>
        </View>
        <Caption>{t("add.invite.draftNoSend")}</Caption>
      </View>
    </BottomSheet>
  );
}

function History({ items, busy, mergingId, onReissue, onOpenPerson, onMerge, onDismiss }: {
  items: InviteCodeHistoryItem[] | null;
  busy: boolean;
  /** The joined contact whose 統合する / 別の人 is running. */
  mergingId: string | null;
  onReissue: () => void;
  onOpenPerson: (contactId: string) => void;
  onMerge: (contactId: string) => void;
  onDismiss: (contactId: string) => void;
}) {
  const { language, t } = useOrbitLocale();
  const { styles } = useAddStyles();
  const local = useStyles().styles;
  const personLink = (person: InviteCodeHistoryJoined) => (
    <UiPressable key={person.contactId} testID="invite-joined" accessibilityRole="link" accessibilityLabel={person.displayName} onPress={() => onOpenPerson(person.contactId)} style={local.link}>
      <UiText style={local.linkText}>{person.displayName}</UiText>
    </UiPressable>
  );
  return (
    <View style={styles.stack} testID="invite-history">
      <SectionTitle>{t("add.invite.historyTitle")}</SectionTitle>
      {items === null ? <Skeleton lines={2} /> : items.length === 0 ? <Caption>{t("add.invite.historyEmpty")}</Caption> : (
        <Card variant="flat">
          <View style={styles.stack}>
            {items.map((item) => (
              <View key={item.code} style={styles.tightStack} testID={`invite-history-${item.status}`}>
                <View style={styles.row}>
                  <UiText style={local.mono}>{item.code}</UiText>
                  <Chip label={t(INVITE_HISTORY_STATUS_COPY[item.status])} tone={item.status === "active" ? "ok" : item.status === "full" ? "apricot" : "neutral"} />
                </View>
                <Caption>{t("add.invite.historyCreated", { date: inviteDate(item.createdAt, language, t) })}</Caption>
                {item.joined.length ? (
                  <View style={styles.tightStack}>
                    {item.joined.some((person) => !person.mergeSuggestion) ? (
                      <View style={styles.row}>{item.joined.filter((person) => !person.mergeSuggestion).map(personLink)}</View>
                    ) : null}
                    {item.joined.map((person) => (person.mergeSuggestion ? (
                      <View key={person.contactId} style={styles.tightStack}>
                        {personLink(person)}
                        <InviteMergeSuggestionRow
                          contactId={person.contactId}
                          suggestion={person.mergeSuggestion}
                          busy={mergingId !== null}
                          onMerge={() => onMerge(person.contactId)}
                          onDismiss={() => onDismiss(person.contactId)}
                        />
                      </View>
                    ) : null))}
                  </View>
                ) : <Caption>{t("add.invite.historyNobody")}</Caption>}
                {item.status === "expired" || item.status === "superseded" ? (
                  <View testID="invite-reissue"><Button label={t("add.invite.reissue")} size="sm" disabled={busy} onPress={onReissue} /></View>
                ) : null}
              </View>
            ))}
          </View>
        </Card>
      )}
    </View>
  );
}

const ENGLISH = createTranslator("en");

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  center: { textAlign: "center" },
  code: { color: colors.ink, fontSize: 26, fontWeight: "800", letterSpacing: 2 },
  mono: { color: colors.ink, fontSize: 14, fontWeight: "700", letterSpacing: 1 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" },
  quota: { flexDirection: "row", gap: 8 },
  quotaCell: { backgroundColor: colors.surface2, borderRadius: radius.md, flex: 1, padding: 12 },
  stepNumber: { color: colors.accentText, fontSize: 14, fontWeight: "800", width: 18 },
  emoji: { fontSize: 20 },
  draftBox: { backgroundColor: colors.surface2, borderRadius: radius.md, padding: 12 },
  link: { minHeight: 32, justifyContent: "center" },
  linkText: { color: colors.accentText, fontSize: 13.5, fontWeight: "700", textDecorationLine: "underline" },
}));
