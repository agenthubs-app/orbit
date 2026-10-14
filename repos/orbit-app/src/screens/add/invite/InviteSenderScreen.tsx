// R15 `contacts/new/invite` 招待コード · 発出方 (DESIGN add-and-invite §2.4; b11 A2 #6 説明 / #7 共有 / #8 下書き —
// 2026-10-14 pixel rework): the first time 説明 (🤝 guide, 3 steps, 3 questions, コードをつくる at the foot; remembered
// on this device); after that 共有 — the QR card (QR 196 with the 「O」, code, link), three big buttons [QR を表示]
// (full sheet to scan face to face) [リンクをコピー] [メッセージで送る] (draft sheet: three fixed tones, コピー /
// LINE で開く / メールで開く — Orbit never sends), 有効期限 · あと N日, 使える人数 · 登録済み N人, 相手に届くあなたの
// 情報 [変更] (R15 P1: the same code shares the new keys), 無効にする (action sheet, focus on キャンセル). ⋯ opens
// これまでのコード (a joined person who may be someone already in my network shows 「同じ人かも」 with 統合する /
// 別の人 — R15 复核 S1); it also shows by itself when no code stands or such a question waits.
// Leaving the page (another page pushed on top) closes any open sheet: they render in the root portal (复核 M3).
import * as Clipboard from "expo-clipboard";
import { type Href, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Linking, StyleSheet, View } from "react-native";

import type { InviteCodeContract, InviteCodeHistoryItem, InviteCodeHistoryJoined, InviteSharedFieldKey, InviteSharedFields } from "../../../api/contract/invite-codes";
import { inviteMessageText, type InviteMessageTone } from "../../../api/compute/invite-message-templates";
import { AppScreen } from "../../../components/AppScreen";
import { ActionSheet, BottomSheet, Button, Card, Chip, Icon, IconButton, RetryCard, Segmented, Skeleton, Toggle, UiPressable, UiText, useToast } from "../../../components/ui";
import { cjkLift } from "../../../components/ui/cjk-lift";
import { createThemedStyles } from "../../../design/theme";
import { radius } from "../../../design/tokens";
import { useOrbitLocale } from "../../../i18n/OrbitLocaleContext";
import { createTranslator, type OrbitTranslator } from "../../../i18n/messages";
import { fillCopy, useStandardCopy } from "../../../i18n/standard-copy";
import { markInviteGuideSeen, readInviteGuideSeen } from "../add-storage";
import { Caption, DensityDots, FadeIn, KIT_PAGE_INSET, SectionTitle, useAddColors, useAddStyles } from "../add-ui";
import { KIT_FOOT_SPACE, KitFoot } from "../scan-kit";
import { KitChip, KitGuide, KitLink, KitXl, useInviteKit } from "./invite-kit";
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
  const [sheet, setSheet] = useState<"qr" | "draft" | "revoke" | "menu" | null>(null);
  const [editing, setEditing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [draftKeys, setDraftKeys] = useState<InviteSharedFieldKey[]>([]);
  const createKey = useRef<string | null>(null);
  const shareKey = useRef<string | null>(null);

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
  const pendingMerges = useMemo(() => (history ?? []).some((item) => item.joined.some((person) => person.mergeSuggestion)), [history]);
  // A 「同じ人かも」 question opens これまでのコード, and it stays open after it is answered.
  useEffect(() => { if (pendingMerges) setShowHistory(true); }, [pendingMerges]);

  const failNotice = useCallback((reason: string | null, fallback: "add.invite.createFailed" | "add.invite.shareFailed") => {
    if (reason === "PROFILE_REQUIRED") setNotice("profile");
    else if (reason === "SAMPLE_READ_ONLY") setNotice("sample");
    else toast.error(t(fallback));
  }, [toast, t]);

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
    failNotice(result.reason, "add.invite.createFailed");
  }, [api, profile, loadHistory, failNotice]);

  /** R15 P1: the same code shares the new set from now on (people already connected keep theirs). */
  const applyShare = async () => {
    setBusy(true);
    setNotice(null);
    shareKey.current ??= newInviteKey("invite-share");
    const result = await api.updateCurrentShare({ idempotencyKey: shareKey.current, sharedKeys: orderedInviteKeys(draftKeys) });
    setBusy(false);
    shareKey.current = null;
    if (result.ok) {
      setCurrent(result.data);
      setEditing(false);
      toast.success(t("add.invite.shareSaved"));
      return;
    }
    failNotice(result.reason, "add.invite.shareFailed");
  };

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
  const historyOpen = phase === "share" && (!current || showHistory);
  const intro = phase === "intro";

  return (
    <View style={styles.grow}>
      <AppScreen title={t("add.invite.title")} subtitle={t(intro ? "add.invite.introSub" : "add.invite.shareSub")}
        headerActions={phase === "share" ? <View testID="invite-more"><IconButton icon="more" accessibilityLabel={t("add.invite.more")} onPress={() => setSheet("menu")} /></View> : undefined}>
        <FadeIn testID="invite-sender" style={KIT_PAGE_INSET}>
          <View testID={`invite-phase-${phase}`} style={intro ? { paddingBottom: KIT_FOOT_SPACE } : null}>
            {phase === "loading" ? <Skeleton lines={4} /> : null}
            {phase === "failed" ? <RetryCard title={t("add.invite.loadFailed")} onRetry={() => void load()} /> : null}
            {intro ? <InviteIntro /> : null}
            {phase === "share" ? (
              <View style={styles.stack}>
                {notice ? <NoticeLine notice={notice} onProfile={() => router.push("/profile/edit" as Href)} /> : null}
                {current ? (
                  <View>
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
                      onApply={() => void applyShare()}
                    />
                    <OffRow busy={busy} onRevoke={() => setSheet("revoke")} />
                  </View>
                ) : (
                  <Card variant="flat">
                    <View style={styles.stack} testID="invite-nocode">
                      <UiText style={styles.strong}>{t("add.invite.noCodeTitle")}</UiText>
                      <Caption>{t("add.invite.noCodeBody")}</Caption>
                      <Button label={t("add.invite.create")} variant="primary" block loading={busy} onPress={() => void create(reissueKeys)} />
                    </View>
                  </Card>
                )}
                {historyOpen ? (
                  <History
                    items={history}
                    busy={busy}
                    mergingId={merging.busyId}
                    onReissue={() => void create(reissueKeys)}
                    onOpenPerson={(contactId) => router.push(`/contacts/${encodeURIComponent(contactId)}` as Href)}
                    onMerge={(contactId) => void settleSuggestion("merge", contactId)}
                    onDismiss={(contactId) => void settleSuggestion("dismiss", contactId)}
                  />
                ) : null}
              </View>
            ) : null}
          </View>
        </FadeIn>
      </AppScreen>
      {intro ? <KitFoot><KitXl label={t("add.invite.create")} busy={busy} onPress={startFromIntro} testID="invite-start" /></KitFoot> : null}
      <ActionSheet
        visible={sheet === "menu"}
        title={t("add.invite.title")}
        options={[{ key: "history", label: t("add.invite.historyTitle") }, { key: "guide", label: t("add.invite.guideOpen") }, { key: "cancel", label: standard.action.cancel }]}
        defaultFocusKey="cancel"
        onSelect={(key) => {
          setSheet(null);
          if (key === "history") setShowHistory(true);
          if (key === "guide") setPhase("intro");
        }}
        onClose={() => setSheet(null)}
      />
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
    </View>
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

/** b11 #6: the 🤝 guide, 3ステップ (three tiles with arrows) and the three questions; コードをつくる sits in the foot. */
function InviteIntro() {
  const { t } = useOrbitLocale();
  const { colors, styles: kit } = useInviteKit();
  const local = useStyles().styles;
  const steps = [["📲", "add.invite.step1Title", "add.invite.step1Body"], ["✍️", "add.invite.step2Title", "add.invite.step2Body"], ["👥", "add.invite.step3Title", "add.invite.step3Body"]] as const;
  const faq = [["add.invite.faq1Q", "add.invite.faq1A"], ["add.invite.faq2Q", "add.invite.faq2A"], ["add.invite.faq3Q", "add.invite.faq3A"]] as const;
  return (
    <View testID="invite-intro">
      <KitGuide>
        <View style={local.emo}><UiText style={local.emoText} importantForAccessibility="no" accessibilityElementsHidden>🤝</UiText></View>
        <UiText accessibilityRole="header" style={[local.h1, cjkLift(t("add.invite.introHero"), 0, H1_LIFT)]}>{t("add.invite.introHero")}</UiText>
        <UiText style={[kit.sub, local.heroSub]}>{t("add.invite.introBodyLead")}<UiText style={local.strong}>{t("add.invite.introBodyStrong")}</UiText>{t("add.invite.introBodyTail")}</UiText>
        <View style={local.heroRow}>
          <KitChip label={t("add.invite.selfChip")} tone="teal" icon={<View style={local.chipIcon}><Icon name="check" size={16} color={colors.macTealInk} /></View>} />
          <DensityDots level={3} />
          <UiText style={kit.lbl}>{t("add.invite.introDensity")}</UiText>
        </View>
      </KitGuide>
      <View style={[kit.card, local.steps]}>
        <UiText accessibilityRole="header" style={local.h3}>{t("add.invite.stepsTitle")}</UiText>
        <View style={local.st3}>
          {steps.map(([emoji, title, body], index) => [
            index > 0 ? <View key={`${title}-arrow`} style={local.st3Arrow}><Icon name="right" size={16} color={colors.ink4} /></View> : null,
            <View key={title} style={local.st3Cell}>
              <UiText importantForAccessibility="no" accessibilityElementsHidden style={local.st3Emoji}>{emoji}</UiText>
              <UiText style={local.st3Title}>{t(title)}</UiText>
              <UiText style={local.st3Small}>{t(body)}</UiText>
            </View>,
          ])}
        </View>
      </View>
      <View style={[kit.card, local.faq]}>
        {faq.map(([question, answer], index) => (
          <View key={question} style={[local.nx, index > 0 ? local.nxLine : null]}>
            <View style={local.why}><UiText style={local.whyText}>?</UiText></View>
            <View style={local.meta}>
              <UiText style={local.metaTitle}>{t(question)}</UiText>
              <UiText style={local.metaBody}>{t(answer)}</UiText>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

/** b11 #7 .k-isqr + .k-isshare: QR 196 / code / link on a white card, then three tall buttons. */
function CodeCard({ code, onShowQr, onCopy, onMessage }: { code: InviteCodeContract; onShowQr: () => void; onCopy: () => void; onMessage: () => void }) {
  const { t } = useOrbitLocale();
  const { colors, styles: kit } = useInviteKit();
  const local = useStyles().styles;
  const buttons = [
    { icon: "grid" as const, label: t("add.invite.showQr"), onPress: onShowQr, testID: "invite-show-qr" },
    { icon: "copy" as const, label: t("add.invite.copyLink"), onPress: onCopy, testID: "invite-copy-link" },
    { icon: "mail" as const, label: t("add.invite.sendMessage"), onPress: onMessage, testID: "invite-message" },
  ];
  return (
    <View testID="invite-code-card">
      <View style={local.qrCard}>
        <InviteQr text={code.link} label={t("add.invite.qrAlt")} size={196} testID="invite-qr" />
        <UiText selectable style={local.code} testID="invite-code">{code.code}</UiText>
        <UiText selectable style={kit.lbl} testID="invite-link">{inviteLinkLabel(code.link)}</UiText>
      </View>
      <View style={local.share3}>
        {buttons.map((button) => (
          <UiPressable key={button.testID} accessibilityRole="button" accessibilityLabel={button.label} onPress={button.onPress} style={local.share3Btn} testID={button.testID}>
            <Icon name={button.icon} size={16} color={colors.ink} />
            <UiText numberOfLines={1} style={local.share3Text}>{button.label}</UiText>
          </UiPressable>
        ))}
      </View>
    </View>
  );
}

function Quota({ code, now }: { code: InviteCodeContract; now: () => number }) {
  const { language, t } = useOrbitLocale();
  const copy = useStandardCopy();
  const { styles: kit } = useInviteKit();
  const local = useStyles().styles;
  const days = inviteDaysLeft(code.expiresAt, now());
  return (
    <View style={local.quota} testID="invite-quota">
      <View style={local.quotaCell}>
        <UiText style={kit.lbl}>{t("add.invite.expiresLabel")}</UiText>
        <UiText style={local.quotaValue} testID="invite-expires">{t("add.invite.expiresValue", { date: inviteDate(code.expiresAt, language, t) })}</UiText>
        <UiText style={kit.lbl}>{fillCopy(copy.chip.daysLeft, { count: days })}</UiText>
      </View>
      <View style={local.quotaCell}>
        <UiText style={kit.lbl}>{t("add.invite.usesLabel")}</UiText>
        <UiText style={local.quotaValue} testID="invite-uses">{t("add.invite.usesValue", { left: Math.max(0, code.maxUses - code.usedCount), max: code.maxUses })}</UiText>
        <UiText style={kit.lbl}>{t("add.invite.joinedValue", { count: code.usedCount })}</UiText>
      </View>
    </View>
  );
}

/** b11 #7 .k-isinfo: 相手に届くあなたの情報 [変更]; 変更 opens the switches (R15 P1: the code stays). */
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
  const { styles: kit } = useInviteKit();
  const local = useStyles().styles;
  const offContact = !keys.includes("email") && !keys.includes("phone");
  return (
    <View style={[kit.flat, local.gap12]} testID="invite-share">
      <View style={kit.rowBetween}>
        <UiText style={kit.infoTitle}>{t("add.invite.shareTitle")}</UiText>
        {editing ? null : <KitLink label={t("add.invite.shareChange")} onPress={onEdit} testID="invite-share-edit" />}
      </View>
      {editing ? (
        <View style={[styles.stack, local.gap12]}>
          <InviteKeySwitches name={profile?.displayName ?? ""} fields={profile} available={available} keys={draftKeys} onToggle={onToggle} />
          {available.length === 0 ? <Caption>{t("add.invite.shareNone")}</Caption> : null}
          <Caption>{t("add.invite.shareEditHint")}</Caption>
          <View style={styles.row}>
            <Button label={copy.action.cancel} size="sm" onPress={onCancel} />
            <View testID="invite-share-apply"><Button label={t("add.invite.shareApply")} size="sm" variant="primary" loading={busy} onPress={onApply} /></View>
          </View>
        </View>
      ) : (
        <View style={kit.chips} testID="invite-share-chips">
          {keys.filter((key) => key !== "email" && key !== "phone").map((key) => <KitChip key={key} label={t(INVITE_KEY_COPY[key])} />)}
          {keys.includes("email") ? <KitChip label={t("add.invite.keyEmail")} /> : null}
          {keys.includes("phone") ? <KitChip label={t("add.invite.keyPhone")} /> : null}
          {offContact ? <KitChip label={t("add.invite.shareOff", { label: t("add.invite.keyContact") })} off /> : null}
        </View>
      )}
    </View>
  );
}

/** b11 #7 .k-isoff: 「Orbit からは送信しません · 共有はあなたの端末から」 and 無効にする. */
function OffRow({ busy, onRevoke }: { busy: boolean; onRevoke: () => void }) {
  const { t } = useOrbitLocale();
  const { styles: kit } = useInviteKit();
  const local = useStyles().styles;
  return (
    <View style={[kit.rowBetween, local.offRow]}>
      <UiText style={[kit.lbl, local.grow]}>{t("add.invite.noSend")}</UiText>
      <KitLink label={t("add.invite.revoke")} danger disabled={busy} onPress={onRevoke} testID="invite-revoke" />
    </View>
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

/** b11 #8: title + ✕, the tone pills, the draft box (link in bold), three tall buttons — Orbit never sends. */
function MessageDraftSheet({ visible, code, name, onClose, onCopy }: { visible: boolean; code: InviteCodeContract; name: string; onClose: () => void; onCopy: (text: string) => void }) {
  const { language, t } = useOrbitLocale();
  const copy = useStandardCopy();
  const toast = useToast();
  const { colors, styles: kit } = useInviteKit();
  const local = useStyles().styles;
  const [tone, setTone] = useState<InviteMessageTone>("polite");
  // The English draft writes its date in English whatever the screen language (「Oct 14」).
  const until = tone === "english" ? inviteDate(code.expiresAt, "en", ENGLISH) : inviteDate(code.expiresAt, language, t);
  const text = inviteMessageText({ language, link: code.link, name, tone, until });
  const open = async (url: string) => {
    if (!(await openInviteDraft(url))) toast.error(t("add.invite.openFailed"));
  };
  const apps = [
    { key: "copy", icon: <Icon name="copy" size={16} color={colors.ink} />, label: copy.action.copy, onPress: () => onCopy(text), testID: "invite-draft-copy" },
    { key: "line", icon: null, label: `💬${t("add.invite.openLine")}`, onPress: () => void open(lineShareUrl(text)), testID: "invite-draft-line" },
    { key: "mail", icon: <Icon name="mail" size={16} color={colors.ink} />, label: t("add.invite.openMail"), onPress: () => void open(mailDraftUrl(t("add.invite.mailSubject"), text)), testID: "invite-draft-mail" },
  ];
  return (
    <BottomSheet visible={visible} onClose={onClose} accessibilityLabel={t("add.invite.draftTitle")}>
      <View testID="invite-draft-sheet">
        <View style={kit.rowBetween}>
          <View style={local.grow}>
            <UiText accessibilityRole="header" style={local.sheetTitle}>{t("add.invite.draftTitle")}</UiText>
            <UiText style={kit.lbl}>{t("add.invite.draftSub")}</UiText>
          </View>
          <IconButton icon="x" size={34} accessibilityLabel={copy.action.close} onPress={onClose} />
        </View>
        <View style={local.toneRow}>
          <Segmented accessibilityLabel={t("add.invite.toneLabel")} segments={TONES.map((key) => ({ key, label: t(TONE_COPY[key]) }))} value={tone} onChange={setTone} />
        </View>
        <View style={local.draftBox}><DraftText text={text} link={code.link} /></View>
        <View style={local.apps}>
          {apps.map((app) => (
            <UiPressable key={app.key} accessibilityRole="button" accessibilityLabel={app.label} onPress={app.onPress} style={local.appBtn} testID={app.testID}>
              {app.icon}
              <UiText numberOfLines={1} style={local.appText}>{app.label}</UiText>
            </UiPressable>
          ))}
        </View>
      </View>
    </BottomSheet>
  );
}

/** The draft as one selectable text; the link line is bold (b11 #8 .draftbox b). */
function DraftText({ text, link }: { text: string; link: string }) {
  const local = useStyles().styles;
  const at = text.indexOf(link);
  if (at < 0) return <UiText selectable style={local.draftText} testID="invite-draft-text">{text}</UiText>;
  return (
    <UiText selectable style={local.draftText} testID="invite-draft-text">
      {text.slice(0, at)}<UiText style={local.draftLink}>{link}</UiText>{text.slice(at + link.length)}
    </UiText>
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
/** kit .h1 (22 / 900 / 1.35): iOS sets the Japanese glyphs 4pt lower in the line box than the browser (measured, R15). */
export const H1_LIFT = -4;

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  grow: { flex: 1, minWidth: 0 },
  gap12: { marginTop: 12 },
  strong: { color: colors.ink, fontWeight: "700" },
  mono: { color: colors.ink, fontSize: 14, fontWeight: "700", letterSpacing: 1 },
  link: { minHeight: 32, justifyContent: "center" },
  linkText: { color: colors.accentText, fontSize: 13.5, fontWeight: "700", textDecorationLine: "underline" },
  // 説明（b11 #6）
  emo: { alignItems: "center", backgroundColor: colors.macPink, borderRadius: 13, height: 40, justifyContent: "center", width: 40 },
  emoText: { fontSize: 21, lineHeight: 26 },
  h1: { color: colors.ink, fontSize: 22, fontWeight: "900", letterSpacing: -0.22, lineHeight: 29.7, marginTop: 10 },
  heroSub: { lineHeight: 20, marginTop: 6 },
  heroRow: { alignItems: "center", flexDirection: "row", gap: 8, marginTop: 10 },
  chipIcon: { alignItems: "center", height: 12, justifyContent: "center", transform: [{ scale: 0.75 }], width: 12 },
  steps: { padding: 14 },
  h3: { color: colors.ink, fontSize: 14.5, fontWeight: "800", lineHeight: 21.75, marginBottom: 10 },
  st3: { alignItems: "center", flexDirection: "row", gap: 2 },
  st3Arrow: { alignItems: "center", transform: [{ scale: 0.875 }], width: 16 },
  st3Cell: { alignItems: "center", backgroundColor: colors.surface2, borderRadius: 14, flex: 1, minWidth: 0, paddingHorizontal: 4, paddingVertical: 9 },
  st3Emoji: { fontSize: 18, lineHeight: 23.4 },
  st3Title: { color: colors.ink, fontSize: 11.5, fontWeight: "700", lineHeight: 15.5, textAlign: "center" },
  st3Small: { color: colors.ink3, fontSize: 10, lineHeight: 13.5, marginTop: 2, textAlign: "center" },
  faq: { marginTop: 14, paddingHorizontal: 16, paddingVertical: 6 },
  nx: { alignItems: "center", flexDirection: "row", gap: 10, paddingVertical: 10 },
  nxLine: { borderTopColor: colors.line, borderTopWidth: 1 },
  why: { alignItems: "center", backgroundColor: colors.surface2, borderRadius: 11, height: 22, justifyContent: "center", width: 22 },
  whyText: { color: colors.ink3, fontSize: 10.5, fontWeight: "800", lineHeight: 15.75 },
  meta: { flex: 1, minWidth: 0 },
  metaTitle: { color: colors.ink, fontSize: 13, fontWeight: "700", lineHeight: 19.5 },
  metaBody: { color: colors.ink3, fontSize: 11.5, lineHeight: 17.25 },
  // 共有（b11 #7）
  qrCard: { alignItems: "center", backgroundColor: colors.surface, borderRadius: 24, padding: 18 },
  code: { color: colors.ink, fontSize: 22, fontVariant: ["tabular-nums"], fontWeight: "800", letterSpacing: 2.64, lineHeight: 33, marginTop: 12 },
  share3: { flexDirection: "row", gap: 8 },
  share3Btn: { alignItems: "center", backgroundColor: colors.surface, borderRadius: 999, flex: 1, gap: 3, height: 64, justifyContent: "center", paddingHorizontal: 4 },
  share3Text: { color: colors.ink, fontSize: 11.5, fontWeight: "700", lineHeight: 17.25 },
  quota: { flexDirection: "row", gap: 8, marginTop: 12 },
  quotaCell: { backgroundColor: colors.surface2, borderRadius: 14, flex: 1, minWidth: 0, paddingHorizontal: 12, paddingVertical: 9 },
  quotaValue: { color: colors.ink, fontSize: 16, fontVariant: ["tabular-nums"], fontWeight: "800", lineHeight: 24 },
  offRow: { marginTop: 12, paddingHorizontal: 4 },
  // 下書き（b11 #8）
  sheetTitle: { color: colors.ink, fontSize: 17, fontWeight: "700", lineHeight: 25.5 },
  toneRow: { alignItems: "flex-start", marginTop: 12 },
  draftBox: { backgroundColor: colors.surface2, borderRadius: 16, marginTop: 10, paddingHorizontal: 14, paddingVertical: 12 },
  draftText: { color: colors.ink, fontSize: 12.5, lineHeight: 21.9 },
  draftLink: { fontWeight: "700" },
  apps: { flexDirection: "row", gap: 8, marginTop: 12 },
  appBtn: { alignItems: "center", backgroundColor: colors.surface2, borderRadius: 999, flex: 1, gap: 3, height: 60, justifyContent: "center", paddingHorizontal: 4 },
  appText: { color: colors.ink, fontSize: 11.5, fontWeight: "700", lineHeight: 17.25 },
}));
