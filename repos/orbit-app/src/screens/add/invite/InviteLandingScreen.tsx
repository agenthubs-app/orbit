// R15 `i/<code>` 招待コード · 受け取る側 (DESIGN add-and-invite §2.5; b9 A5 ② + 2/3 + 3/3, b11 A2 ⑤⑦⑧): the App
// opens the same steps as the Web page /i/<code> when a universal link or `orbit://i/<code>` arrives.
// Opened (the inviter's card — never e-mail or phone) → signed out: ログイン / 登録 and back here (`next=/i/<code>`)
// → a short profile when the account has no name yet (existing /api/profile save, only called) → what to share
// (名前 always; 会社・役職 / 提供 / 求めている on; メール / 電話 off; only what the profile has) → つながる (keys
// only, one idempotency key per visit) → done. Expired / full / already connected / own code / unavailable each
// get their own page; unknown, turned off, replaced, malformed and rate-limited codes look the same (§6).
// 「今はしない」 leaves no trace.
import * as Clipboard from "expo-clipboard";
import { type Href, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { useOrbitAuthSession } from "../../../api/AuthSessionProvider";
import { formatInviteCode } from "../../../api/compute/invite-code-format";
import { inviteResendRequestText } from "../../../api/compute/invite-message-templates";
import type { InviteCodePreview, InviteSharedFieldKey, InviteSharedFields } from "../../../api/contract/invite-codes";
import { AppScreen } from "../../../components/AppScreen";
import { Avatar, Button, Card, Chip, FilterOption, Icon, RetryCard, Skeleton, TextField, UiText, useToast } from "../../../components/ui";
import { createThemedStyles } from "../../../design/theme";
import { radius } from "../../../design/tokens";
import { useOrbitLocale } from "../../../i18n/OrbitLocaleContext";
import type { MessageKey } from "../../../i18n/messages";
import { useStandardCopy } from "../../../i18n/standard-copy";
import { Caption, FadeIn, useAddColors, useAddStyles } from "../add-ui";
import { useInviteApi, type InviteApi } from "./invite-api";
import {
  INVITE_KEY_COPY,
  INVITE_PROFILE_TAG_LIMIT,
  inviteAuthHref,
  inviteDate,
  inviteDefaultKeys,
  inviteFieldsFromProfile,
  inviteKeysWithValues,
  inviteKeyValue,
  lineShareUrl,
  newInviteKey,
  orderedInviteKeys,
  sameTag,
  toggleInviteKey,
  toggleTag,
  viewAfterProfile,
  viewForPreview,
  viewForPreviewFailure,
  viewForRedeemFailure,
  viewForRedeemResult,
  type InviteLandingView,
  type InviteProfile,
} from "./invite-model";
import { InviteKeySwitches, openInviteDraft } from "./InviteSenderScreen";

export function InviteLandingScreen({ code: rawCode, api: injected }: { code: string; api?: InviteApi }) {
  const fallbackApi = useInviteApi();
  const api = injected ?? fallbackApi;
  const router = useRouter();
  const toast = useToast();
  const auth = useOrbitAuthSession();
  const { t } = useOrbitLocale();
  const { styles } = useAddStyles();
  const code = useMemo(() => formatInviteCode(rawCode), [rawCode]);
  const [view, setView] = useState<InviteLandingView>(() => (code ? { view: "loading" } : { view: "unavailable", limited: false }));
  const [preview, setPreview] = useState<InviteCodePreview | null>(null);
  const [profile, setProfile] = useState<InviteProfile | null>(null);
  const [sharedByMe, setSharedByMe] = useState<InviteSharedFieldKey[]>([]);
  const goLogin = useCallback(() => { if (code) router.push(inviteAuthHref("login", code) as Href); }, [code, router]);

  const loadPreview = useCallback(async () => {
    if (!code) return;
    setView({ view: "loading" });
    const result = await api.preview(code);
    if (!result.ok) {
      setView(viewForPreviewFailure(result.status, result.reason));
      return;
    }
    setPreview(result.data);
    setView(viewForPreview(result.data, auth.signedIn));
  }, [api, auth.signedIn, code]);

  useEffect(() => {
    if (auth.ready) void loadPreview();
  }, [auth.ready, loadPreview]);

  const loadProfile = useCallback(async () => {
    const result = await api.profile();
    if (!result.ok) {
      if (result.status === 401) goLogin();
      else setView({ view: "failed" });
      return;
    }
    setProfile(result.data.profile);
    setView(viewAfterProfile(result.data.profile?.displayName));
  }, [api, goLogin]);

  useEffect(() => {
    if (view.view === "checking") void loadProfile();
  }, [view.view, loadProfile]);

  return (
    <AppScreen title={t("add.inviteIn.title")}>
      <FadeIn key={view.view} testID={`invite-landing-${view.view}`}>
        <View style={styles.stack}>
          {view.view === "loading" || view.view === "checking" ? <Skeleton lines={4} /> : null}
          {view.view === "failed" ? <RetryCard title={t("add.inviteIn.loadFailed")} onRetry={() => void loadPreview()} /> : null}
          {view.view === "open" && preview ? <OpenView preview={preview} onSignup={() => router.push(inviteAuthHref("signup", preview.code) as Href)} onLogin={goLogin} /> : null}
          {view.view === "profile" ? <ProfileStep profile={profile} accountName={auth.user?.name ?? null} api={api} onSaved={() => setView({ view: "checking" })} onError={(message) => toast.error(message)} /> : null}
          {view.view === "confirm" && preview ? (
            <ConfirmStep
              preview={preview}
              profile={profile}
              accountEmail={auth.user?.email ?? null}
              api={api}
              onResult={(next, keys) => { setSharedByMe(keys); if (next === "login") goLogin(); else setView(next); }}
              onNotNow={() => router.replace("/home" as Href)}
            />
          ) : null}
          {view.view === "done" && preview ? <DoneView preview={preview} result={view.result} sharedByMe={sharedByMe} onOpen={(id) => router.replace(`/contacts/${encodeURIComponent(id)}` as Href)} /> : null}
          {(view.view === "expired" || view.view === "full") && preview ? <ExpiredView preview={preview} full={view.view === "full"} /> : null}
          {view.view === "already" ? (
            <Notice emoji="🤝" title={t("add.inviteIn.alreadyTitle")} testID="invite-already">
              {preview ? <UiText style={styles.body}>{t("add.inviteIn.alreadyBody", { name: preview.shared.displayName })}</UiText> : null}
              <Button label={t("add.inviteIn.viewInNetwork")} variant="primary" block onPress={() => router.replace((view.contactId ? `/contacts/${encodeURIComponent(view.contactId)}` : "/contacts") as Href)} />
            </Notice>
          ) : null}
          {view.view === "own" ? (
            <Notice emoji="🪪" title={t("add.inviteIn.ownTitle")} testID="invite-own">
              <UiText style={styles.body}>{t("add.inviteIn.ownBody")}</UiText>
              <Button label={t("add.inviteIn.toShare")} variant="primary" block onPress={() => router.replace("/contacts/new/invite" as Href)} />
            </Notice>
          ) : null}
          {view.view === "unavailable" ? (
            <Notice emoji="🔒" title={t("add.inviteIn.unavailableTitle")} testID={view.limited ? "invite-limited" : "invite-unavailable"}>
              <UiText style={styles.body}>{t("add.inviteIn.unavailableBody")}</UiText>
              {view.limited ? <UiText style={styles.body}>{t("add.inviteIn.limitedBody")}</UiText> : null}
              <Button label={t("add.inviteIn.enterAnother")} block onPress={() => router.replace("/i" as Href)} />
            </Notice>
          ) : null}
        </View>
      </FadeIn>
    </AppScreen>
  );
}

function Notice({ emoji, title, children, testID }: { emoji: string; title: string; children?: ReactNode; testID: string }) {
  const { styles } = useAddStyles();
  const local = useStyles().styles;
  return (
    <View style={[styles.stack, styles.centered]} testID={testID}>
      <UiText importantForAccessibility="no" accessibilityElementsHidden style={local.emoji}>{emoji}</UiText>
      <UiText accessibilityRole="header" style={styles.bigTitle}>{title}</UiText>
      <View style={[styles.stack, local.full]}>{children}</View>
    </View>
  );
}

/** The inviter's card: name, 会社・役職, 提供できること, 求めていること (never e-mail or phone). */
function InviterCard({ shared, children }: { shared: InviteSharedFields; children?: ReactNode }) {
  const { t } = useOrbitLocale();
  const { styles } = useAddStyles();
  const organization = inviteKeyValue("organization", shared, t);
  const offering = inviteKeyValue("offering", shared, t);
  const seeking = inviteKeyValue("seeking", shared, t);
  return (
    <Card>
      <View style={styles.stack} testID="invite-inviter">
        <View style={styles.row}>
          <Avatar name={shared.displayName} size="lg" />
          <View style={styles.grow}>
            <Caption>{t("add.inviteIn.received")}</Caption>
            <UiText style={styles.title}>{t("add.inviteIn.inviterName", { name: shared.displayName })}</UiText>
            {organization ? <Caption>{organization}</Caption> : null}
          </View>
        </View>
        {offering ? <Fact label={t("add.inviteIn.offeringLabel")} value={offering} /> : null}
        {seeking ? <Fact label={t("add.inviteIn.seekingLabel")} value={seeking} /> : null}
        {children}
      </View>
    </Card>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  const { styles } = useAddStyles();
  return (
    <View style={styles.tightStack}>
      <Caption>{label}</Caption>
      <UiText style={styles.body}>{value}</UiText>
    </View>
  );
}

function OpenView({ preview, onSignup, onLogin }: { preview: InviteCodePreview; onSignup: () => void; onLogin: () => void }) {
  const { language, t } = useOrbitLocale();
  const { styles } = useAddStyles();
  return (
    <View style={styles.stack} testID="invite-open">
      <InviterCard shared={preview.shared}>
        <View style={styles.notice}>
          <UiText importantForAccessibility="no" accessibilityElementsHidden>🤝</UiText>
          <View style={styles.grow}><UiText style={styles.body}>{t("add.inviteIn.explain")}</UiText></View>
        </View>
      </InviterCard>
      <Caption>{t("add.inviteIn.codeLine", { code: preview.code, date: inviteDate(preview.expiresAt, language, t) })}</Caption>
      <View testID="invite-signup"><Button label={t("add.inviteIn.signup")} variant="primary" block onPress={onSignup} /></View>
      <View testID="invite-login"><Button label={t("add.inviteIn.login")} block onPress={onLogin} /></View>
      <View style={styles.centered}><Caption>{t("add.inviteIn.signupNote")}</Caption></View>
    </View>
  );
}

const OFFERING_PRESETS: readonly MessageKey[] = ["add.inviteIn.offering1", "add.inviteIn.offering2", "add.inviteIn.offering3", "add.inviteIn.offering4", "add.inviteIn.offering5"];
const SEEKING_PRESETS: readonly MessageKey[] = ["add.inviteIn.seeking1", "add.inviteIn.seeking2", "add.inviteIn.seeking3", "add.inviteIn.seeking4", "add.inviteIn.seeking5"];

function TagPicker({ label, presets, value, onChange, testID }: { label: string; presets: readonly MessageKey[]; value: string[]; onChange: (next: string[]) => void; testID: string }) {
  const { t } = useOrbitLocale();
  const copy = useStandardCopy();
  const { styles } = useAddStyles();
  const [draft, setDraft] = useState("");
  const presetLabels = presets.map((key) => t(key));
  const extra = value.filter((item) => !presetLabels.some((preset) => sameTag(preset, item)));
  const full = value.length >= INVITE_PROFILE_TAG_LIMIT;
  const add = () => {
    onChange(toggleTag(value, draft));
    setDraft("");
  };
  return (
    <View style={styles.stack} testID={testID}>
      <UiText style={styles.strong}>{label}</UiText>
      <View style={styles.row}>
        {[...presetLabels, ...extra].map((item) => {
          const on = value.some((entry) => sameTag(entry, item));
          return <FilterOption key={item} label={item} selected={on} onToggle={() => { if (on || !full) onChange(toggleTag(value, item)); }} />;
        })}
      </View>
      <View style={styles.row}>
        <View style={styles.grow}><TextField label={t("add.inviteIn.chipAddLabel")} value={draft} maxLength={40} editable={!full} onChangeText={setDraft} onSubmitEditing={add} returnKeyType="done" /></View>
        <Button label={copy.action.add} size="sm" disabled={full || !draft.trim()} onPress={add} />
      </View>
    </View>
  );
}

function ProfileStep({ profile, accountName, api, onSaved, onError }: { profile: InviteProfile | null; accountName: string | null; api: InviteApi; onSaved: () => void; onError: (message: string) => void }) {
  const { t } = useOrbitLocale();
  const { styles } = useAddStyles();
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
    const result = await api.saveShortProfile({ displayName: name.trim().slice(0, 80), offering, organization: company.trim().slice(0, 120), role: role.trim().slice(0, 80), seeking }, profile?.updatedAt ?? null);
    setBusy(false);
    if (result.ok) onSaved();
    else onError(t("add.inviteIn.profileSaveFailed"));
  };
  return (
    <View style={styles.stack} testID="invite-profile">
      <UiText accessibilityRole="header" style={styles.title}>{t("add.inviteIn.profileTitle")}</UiText>
      <Caption>{t("add.inviteIn.profileSub")}</Caption>
      <Card>
        <View style={styles.stack}>
          <TextField label={`${t("add.inviteIn.fieldName")} · ${t("add.inviteIn.required")}`} value={name} maxLength={80} autoComplete="name" textContentType="name"
            {...(missing && !name.trim() ? { error: t("add.inviteIn.nameMissing") } : {})} onChangeText={setName} testID="invite-field-name" />
          <TextField label={t("add.inviteIn.fieldCompany")} value={company} maxLength={120} textContentType="organizationName" onChangeText={setCompany} testID="invite-field-company" />
          <TextField label={t("add.inviteIn.fieldRole")} value={role} maxLength={80} textContentType="jobTitle" onChangeText={setRole} testID="invite-field-role" />
        </View>
      </Card>
      <Card>
        <View style={styles.stack}>
          <TagPicker label={t("add.inviteIn.fieldOffering")} presets={OFFERING_PRESETS} value={offering} onChange={setOffering} testID="invite-tags-offering" />
          <TagPicker label={t("add.inviteIn.fieldSeeking")} presets={SEEKING_PRESETS} value={seeking} onChange={setSeeking} testID="invite-tags-seeking" />
        </View>
      </Card>
      <View testID="invite-profile-next"><Button label={t("add.inviteIn.next")} variant="primary" block loading={busy} onPress={() => void save()} /></View>
    </View>
  );
}

function ConfirmStep({ preview, profile, accountEmail, api, onResult, onNotNow }: {
  preview: InviteCodePreview;
  profile: InviteProfile | null;
  /** 「… でログイン中」: the signed-in account (only ever shown to that account). */
  accountEmail: string | null;
  api: InviteApi;
  onResult: (next: InviteLandingView | "login", sharedKeys: InviteSharedFieldKey[]) => void;
  onNotNow: () => void;
}) {
  const { t } = useOrbitLocale();
  const { styles } = useAddStyles();
  const colors = useAddColors();
  const mine = useMemo(() => inviteFieldsFromProfile(profile), [profile]);
  const available = useMemo(() => inviteKeysWithValues(mine), [mine]);
  const [keys, setKeys] = useState<InviteSharedFieldKey[]>(() => inviteDefaultKeys(available));
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  // One key per visit: a retry after a lost response is answered from the first connection (no second use).
  const redeemKey = useRef(newInviteKey("invite-redeem"));
  const inviter = preview.shared.displayName;

  const connect = async () => {
    setBusy(true);
    setFailed(false);
    const sent = orderedInviteKeys(keys);
    const result = await api.redeem(preview.code, { idempotencyKey: redeemKey.current, sharedKeys: sent });
    setBusy(false);
    if (result.ok) {
      onResult(viewForRedeemResult(result.data), sent);
      return;
    }
    const next = viewForRedeemFailure(result.status, result.reason);
    if (next) onResult(next, sent);
    else setFailed(true);
  };

  const me = mine?.displayName ?? "";
  return (
    <View style={styles.stack} testID="invite-confirm">
      <Card>
        <View style={styles.row}>
          <Avatar name={me} />
          <View style={styles.grow}>
            <UiText style={styles.strong}>{me}</UiText>
            <Caption>{t("add.inviteIn.signedInAs", { name: accountEmail || me })}</Caption>
          </View>
          <Chip label={t("add.inviteIn.usingOrbit")} tone="teal" />
        </View>
      </Card>
      <View style={[styles.stack, styles.centered]}>
        <View style={styles.row}><Avatar name={me} size="lg" /><Avatar name={inviter} size="lg" /></View>
        <UiText accessibilityRole="header" style={styles.bigTitle}>{t("add.inviteIn.confirmTitle", { name: inviter })}</UiText>
        <UiText style={styles.body}>{t("add.inviteIn.confirmSub")}</UiText>
      </View>
      <Card variant="flat">
        <View style={styles.stack}>
          <UiText style={styles.strong}>{t("add.inviteIn.showTitle", { name: inviter })}</UiText>
          <InviteKeySwitches name={me} fields={mine} available={available} keys={keys} onToggle={(key, on) => setKeys((current) => toggleInviteKey(current, key, on))} />
          {available.includes("email") || available.includes("phone") ? <Caption>{t("add.inviteIn.showHint")}</Caption> : null}
        </View>
      </Card>
      {/* R15 复核 S1: no client-side 「すでに人脈にいます」 guess; the owner checks 「同じ人かも」 after connecting. */}
      <View testID="invite-same-later"><Caption>{t("add.inviteIn.sameLater")}</Caption></View>
      {failed ? (
        <View style={[styles.notice, styles.noticeError]} testID="invite-connect-failed">
          <Icon name="alert" size={16} color={colors.coralText} />
          <View style={styles.grow}><Caption tone="error">{t("add.inviteIn.connectFailed")}</Caption></View>
        </View>
      ) : null}
      <View testID="invite-connect"><Button label={t("add.inviteIn.connect")} variant="primary" block loading={busy} onPress={() => void connect()} /></View>
      <View testID="invite-not-now"><Button label={t("add.inviteIn.notNow")} variant="ghost" block onPress={onNotNow} /></View>
      <View style={styles.centered}><Caption>{t("add.inviteIn.changeLater")}</Caption></View>
    </View>
  );
}

function DoneView({ preview, result, sharedByMe, onOpen }: { preview: InviteCodePreview; result: Extract<InviteLandingView, { view: "done" }>["result"]; sharedByMe: InviteSharedFieldKey[]; onOpen: (contactId: string) => void }) {
  const { t } = useOrbitLocale();
  const { styles } = useAddStyles();
  const colors = useAddColors();
  const peer = result.peer ?? preview.shared;
  const inviter = peer.displayName || preview.shared.displayName;
  const peerKeys = inviteKeysWithValues(peer);
  return (
    <View style={styles.stack} testID={`invite-done-${result.outcome}`}>
      <View style={[styles.stack, styles.centered]}>
        <Icon name="check-circle" size={24} color={colors.okText} />
        <UiText accessibilityRole="header" style={styles.bigTitle}>{t("add.inviteIn.doneTitle", { name: inviter })}</UiText>
        <UiText style={styles.body}>{t("add.inviteIn.doneSub")}</UiText>
      </View>
      <Card>
        <View style={styles.stack} testID="invite-from-peer">
          <UiText style={styles.strong}>{t("add.inviteIn.fromPeer", { name: inviter })}</UiText>
          <Fact label={t("add.invite.keyName")} value={inviter} />
          {peerKeys.map((key) => <Fact key={key} label={t(INVITE_KEY_COPY[key])} value={inviteKeyValue(key, peer, t)} />)}
          <View style={styles.row}><Chip label={t("add.invite.selfChip")} tone="teal" /></View>
        </View>
      </Card>
      <Card>
        <View style={styles.stack} testID="invite-to-peer">
          <UiText style={styles.strong}>{t("add.inviteIn.toPeer", { name: inviter })}</UiText>
          <View style={styles.row}>
            <Chip label={t("add.invite.keyName")} tone="lav" />
            {sharedByMe.map((key) => <Chip key={key} label={t(INVITE_KEY_COPY[key])} tone="lav" />)}
          </View>
          <Caption>{t("add.inviteIn.autoUpdate")}</Caption>
        </View>
      </Card>
      <View testID="invite-view-contact"><Button label={t("add.inviteIn.viewInNetwork")} variant="primary" block onPress={() => onOpen(result.contactId)} /></View>
    </View>
  );
}

function ExpiredView({ preview, full }: { preview: InviteCodePreview; full: boolean }) {
  const { language, t } = useOrbitLocale();
  const copy = useStandardCopy();
  const toast = useToast();
  const { styles } = useAddStyles();
  const local = useStyles().styles;
  const inviter = preview.shared.displayName;
  const draft = inviteResendRequestText({ inviter, language });
  const copyDraft = async () => {
    try {
      await Clipboard.setStringAsync(draft);
      toast.success(t("add.invite.linkCopied"));
    } catch {
      toast.error(t("add.invite.copyFailed"));
    }
  };
  return (
    <View style={styles.stack}>
      <Notice emoji="⌛" title={t(full ? "add.inviteIn.fullTitle" : "add.inviteIn.expiredTitle")} testID={full ? "invite-full" : "invite-expired"}>
        <UiText style={[styles.body, local.center]}>{full ? t("add.inviteIn.fullBody", { name: inviter }) : t("add.inviteIn.expiredBody", { date: inviteDate(preview.expiresAt, language, t), name: inviter })}</UiText>
      </Notice>
      <Card>
        <View style={styles.stack} testID="invite-ask">
          <UiText style={styles.strong}>{t("add.inviteIn.askTitle", { name: inviter })}</UiText>
          <View style={local.draftBox}><UiText selectable style={styles.body} testID="invite-ask-text">{draft}</UiText></View>
          <View style={styles.row}>
            <View testID="invite-ask-copy"><Button label={copy.action.copy} icon="copy" size="sm" variant="primary" onPress={() => void copyDraft()} /></View>
            <View testID="invite-ask-line"><Button label={t("add.invite.openLine")} icon="chat" size="sm" onPress={() => void openInviteDraft(lineShareUrl(draft)).then((ok) => { if (!ok) toast.error(t("add.invite.openFailed")); })} /></View>
          </View>
          <Caption>{t("add.inviteIn.noSend")}</Caption>
        </View>
      </Card>
    </View>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  emoji: { fontSize: 40 },
  full: { alignSelf: "stretch" },
  center: { textAlign: "center" },
  draftBox: { backgroundColor: colors.surface2, borderRadius: radius.md, padding: 12 },
}));
