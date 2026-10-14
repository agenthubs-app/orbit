// R15 `i/<code>` 招待コード · 受け取る側 (DESIGN add-and-invite §2.5; b9 A5 ② + 2/3 + 3/3, b11 A2 ⑤⑦⑧): the App
// opens the same steps as the Web page /i/<code> when a universal link or `orbit://i/<code>` arrives.
// Opened (the inviter's card — never e-mail or phone) → signed out: ログイン / 登録 and back here (`next=/i/<code>`)
// → a short profile when the account has no name yet (existing /api/profile save, only called) → what to share
// (名前 always; 会社・役職 / 提供 / 求めている on; メール / 電話 off; only what the profile has) → つながる (keys
// only, one idempotency key per visit) → done. Expired / full / already connected / own code / unavailable each
// get their own page; unknown, turned off, replaced, malformed and rate-limited codes look the same (§6).
// 「今はしない」 leaves no trace. 2026-10-14 pixel rework: the pages follow b11 #9 / #12 / #10 / #13 — no top bar, the
// small 「O Orbit」 head with a line per state (P2: never 「アプリなしで登録できます」 in the App), chips + 変更 for what I
// share, つながる / 今はしない pinned to the foot, and on 完了 「人脈で見る」 in the card where the Web page offers the app.
import * as Clipboard from "expo-clipboard";
import { type Href, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { useOrbitAuthSession } from "../../../api/AuthSessionProvider";
import { formatInviteCode } from "../../../api/compute/invite-code-format";
import { DEFAULT_INVITE_LINK_HOSTS } from "../../../view-models/invite-route";
import { inviteResendRequestText } from "../../../api/compute/invite-message-templates";
import type { InviteCodePreview, InviteSharedFieldKey, InviteSharedFields } from "../../../api/contract/invite-codes";
import { AppScreen } from "../../../components/AppScreen";
import { Avatar, Button, Card, FilterOption, Icon, RetryCard, Skeleton, TextField, UiPressable, UiText, useToast } from "../../../components/ui";
import { createThemedStyles } from "../../../design/theme";
import { useOrbitLocale } from "../../../i18n/OrbitLocaleContext";
import type { MessageKey } from "../../../i18n/messages";
import { useStandardCopy } from "../../../i18n/standard-copy";
import { addDesignMock } from "../add-design-mock";
import { Caption, FadeIn, KIT_PAGE_INSET, useAddColors, useAddStyles } from "../add-ui";
import { KIT_FOOT_SPACE, KitFoot } from "../scan-kit";
import { KitChip, KitGhost, KitGuide, KitLink, KitXl, useInviteKit } from "./invite-kit";
import { useInviteApi, type InviteApi } from "./invite-api";
import {
  INVITE_KEY_COPY,
  INVITE_PROFILE_TAG_LIMIT,
  inviteAuthHref,
  inviteCallName,
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

export function InviteLandingScreen({ code: rawCode, api: injected, design }: { code: string; api?: InviteApi; design?: string | undefined }) {
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
  const [foot, setFoot] = useState<ReactNode>(null);
  // A newcomer went through the short profile here: 完了 then says 登録が完了しました (else つながりました).
  const [newcomer, setNewcomer] = useState(false);
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
    // R15 pixel gate (dev build + EXPO_PUBLIC_ORBIT_REDESIGN_MOCK=add-scan only): `?design=done` opens 完了 read-only.
    if (design === "done" && addDesignMock("add-scan")) {
      setSharedByMe(["organization", "offering"]);
      setNewcomer(true);
      setView({ view: "done", result: { outcome: "connected", contactId: "demo-design-fixture", peer: result.data.shared } });
      return;
    }
    setView(viewForPreview(result.data, auth.signedIn));
  }, [api, auth.signedIn, code, design]);

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

  const head = view.view === "confirm" ? t("add.inviteIn.headHasAccount")
    : view.view === "done" ? t(newcomer ? "add.inviteIn.headDone" : "add.inviteIn.headConnected")
    : (view.view === "expired" || view.view === "full") && preview ? `${DEFAULT_INVITE_LINK_HOSTS[0]}/i/${preview.code}`
    : null;
  const pinned = view.view === "confirm";
  return (
    <View style={styles.grow}>
    <AppScreen title={t("add.inviteIn.title")} showBack={false} header={<LandingHead sub={head} />}>
      <FadeIn key={view.view} testID={`invite-landing-${view.view}`} style={[KIT_PAGE_INSET, pinned ? { paddingBottom: KIT_FOOT_SPACE } : null]}>
        <View style={styles.stack}>
          {view.view === "loading" || view.view === "checking" ? <Skeleton lines={4} /> : null}
          {view.view === "failed" ? <RetryCard title={t("add.inviteIn.loadFailed")} onRetry={() => void loadPreview()} /> : null}
          {view.view === "open" && preview ? <OpenView preview={preview} onSignup={() => router.push(inviteAuthHref("signup", preview.code) as Href)} onLogin={goLogin} /> : null}
          {view.view === "profile" ? <ProfileStep profile={profile} accountName={auth.user?.name ?? null} api={api} onSaved={() => { setNewcomer(true); setView({ view: "checking" }); }} onError={(message) => toast.error(message)} /> : null}
          {view.view === "confirm" && preview ? (
            <ConfirmStep
              preview={preview}
              profile={profile}
              accountEmail={auth.user?.email ?? null}
              api={api}
              onResult={(next, keys) => { setSharedByMe(keys); if (next === "login") goLogin(); else setView(next); }}
              onNotNow={() => router.replace("/home" as Href)}
              onFoot={setFoot}
            />
          ) : null}
          {view.view === "done" && preview ? <DoneView preview={preview} result={view.result} sharedByMe={sharedByMe} me={inviteFieldsFromProfile(profile)?.displayName || auth.user?.name || ""} onOpen={(id) => router.replace(`/contacts/${encodeURIComponent(id)}` as Href)} /> : null}
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
    {pinned && foot ? <KitFoot>{foot}</KitFoot> : null}
    </View>
  );
}

/** b11 head: .appic 28 / r 9 + 「Orbit」 15 / 700 and one line under it (or none). */
function LandingHead({ sub }: { sub: string | null }) {
  const { t } = useOrbitLocale();
  const { colors, styles: kit } = useInviteKit();
  const local = useStyles().styles;
  return (
    <View style={local.head}>
      <View style={[local.appic, { backgroundColor: colors.ink }]}><UiText style={[local.appicText, { color: colors.bg }]}>O</UiText></View>
      <View style={local.headText}>
        <UiText accessibilityRole="header" style={local.brand}>{t("add.inviteIn.brand")}</UiText>
        {sub ? <UiText style={kit.lbl}>{sub}</UiText> : null}
      </View>
    </View>
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

/** b11 #9 .k-irfrom: the inviter (avatar 56, 招待が届いています, name, 会社・役職), 提供 / 求めている, then the 🤝 line. */
function InviterCard({ shared, children }: { shared: InviteSharedFields; children?: ReactNode }) {
  const { t } = useOrbitLocale();
  const { styles: kit } = useInviteKit();
  const local = useStyles().styles;
  const organization = inviteKeyValue("organization", shared, t);
  const offering = inviteKeyValue("offering", shared, t);
  const seeking = inviteKeyValue("seeking", shared, t);
  return (
    <View style={kit.card} testID="invite-inviter">
      <View style={local.person}>
        <Avatar name={shared.displayName} size="lg" />
        <View style={local.grow}>
          <UiText style={kit.lbl}>{t("add.inviteIn.received")}</UiText>
          <UiText style={local.personName}>{t("add.inviteIn.inviterName", { name: shared.displayName })}</UiText>
          {organization ? <UiText style={kit.lbl}>{organization}</UiText> : null}
        </View>
      </View>
      {offering ? <><UiText style={[kit.lbl, local.factLabel]}>{t("add.inviteIn.offeringLabel")}</UiText><UiText style={local.fact}>{offering}</UiText></> : null}
      {seeking ? <><UiText style={[kit.lbl, local.factLabel, offering ? local.factNext : null]}>{t("add.inviteIn.seekingLabel")}</UiText><UiText style={local.fact}>{seeking}</UiText></> : null}
      {children}
    </View>
  );
}

function OpenView({ preview, onSignup, onLogin }: { preview: InviteCodePreview; onSignup: () => void; onLogin: () => void }) {
  const { language, t } = useOrbitLocale();
  const { styles: kit } = useInviteKit();
  const local = useStyles().styles;
  return (
    <View testID="invite-open">
      <InviterCard shared={preview.shared}>
        <View style={local.explain}>
          <UiText importantForAccessibility="no" accessibilityElementsHidden style={local.explainEmoji}>🤝</UiText>
          <UiText style={[kit.lbl, local.explainText]}>{t("add.inviteIn.explain")}</UiText>
        </View>
      </InviterCard>
      <UiText style={[kit.lbl, local.codeLine]}>{t("add.inviteIn.codeLine", { code: preview.code, date: inviteDate(preview.expiresAt, language, t) })}</UiText>
      <View style={local.openActions}>
        <KitXl label={t("add.inviteIn.signup")} onPress={onSignup} testID="invite-signup" />
        <KitXl label={t("add.inviteIn.login")} primary={false} onPress={onLogin} testID="invite-login" />
        <UiText style={[kit.lbl, local.center]}>{t("add.inviteIn.signupNote")}</UiText>
      </View>
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

function ConfirmStep({ preview, profile, accountEmail, api, onResult, onNotNow, onFoot }: {
  preview: InviteCodePreview;
  profile: InviteProfile | null;
  /** 「… でログイン中」: the signed-in account (only ever shown to that account). */
  accountEmail: string | null;
  api: InviteApi;
  onResult: (next: InviteLandingView | "login", sharedKeys: InviteSharedFieldKey[]) => void;
  onNotNow: () => void;
  /** つながる / 今はしない live in the page foot (b11 .foot), outside the scroll. */
  onFoot: (foot: ReactNode) => void;
}) {
  const { t } = useOrbitLocale();
  const { styles } = useAddStyles();
  const colors = useAddColors();
  const { styles: kit } = useInviteKit();
  const local = useStyles().styles;
  const mine = useMemo(() => inviteFieldsFromProfile(profile), [profile]);
  const available = useMemo(() => inviteKeysWithValues(mine), [mine]);
  const [keys, setKeys] = useState<InviteSharedFieldKey[]>(() => inviteDefaultKeys(available));
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  // One key per visit: a retry after a lost response is answered from the first connection (no second use).
  const redeemKey = useRef(newInviteKey("invite-redeem"));
  const inviter = preview.shared.displayName;
  const callName = inviteCallName(inviter);

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

  // The foot lives in the parent (outside the scroll): hand it buttons that read the latest handlers from refs, so the
  // effect only re-runs when `busy` changes (inline parent callbacks would otherwise loop — R15 返工复核 S1).
  const latest = useRef({ connect, onNotNow });
  latest.current = { connect, onNotNow };
  useEffect(() => {
    onFoot(
      <>
        <KitXl label={t("add.inviteIn.connect")} busy={busy} onPress={() => void latest.current.connect()} testID="invite-connect" />
        <KitGhost label={t("add.inviteIn.notNow")} onPress={() => latest.current.onNotNow()} testID="invite-not-now" />
      </>,
    );
  }, [busy, onFoot, t]);
  useEffect(() => () => onFoot(null), [onFoot]);

  const me = mine?.displayName ?? "";
  const contactOff = !keys.includes("email") && !keys.includes("phone");
  return (
    <View testID="invite-confirm">
      <View style={kit.card}>
        <View style={local.person}>
          <Avatar name={me} />
          <View style={local.grow}>
            <UiText style={local.accountName}>{me}</UiText>
            <UiText style={kit.lbl}>{t("add.inviteIn.signedInAs", { name: accountEmail || me })}</UiText>
          </View>
          <KitChip label={t("add.inviteIn.usingOrbit")} tone="teal" />
        </View>
      </View>
      <KitGuide style={local.connectGuide}>
        <View style={local.pair}><View style={[local.ring, { borderColor: colors.surface }]}><Avatar name={me} size="lg" /></View><View style={[local.ring, local.pairSecond, { borderColor: colors.surface }]}><Avatar name={inviter} size="lg" /></View></View>
        <UiText accessibilityRole="header" style={local.guideTitle}>{t("add.inviteIn.confirmTitle", { name: inviter })}</UiText>
        <UiText style={[kit.sub, local.guideSub]}>{t("add.inviteIn.confirmSub")}</UiText>
      </KitGuide>
      <View style={[kit.flat, local.gap12]} testID="invite-share-keys">
        <View style={kit.rowBetween}>
          <UiText style={kit.infoTitle}>{t("add.inviteIn.showTitle", { name: callName })}</UiText>
          {editing ? null : <KitLink label={t("add.invite.shareChange")} onPress={() => setEditing(true)} testID="invite-share-edit" />}
        </View>
        {editing ? (
          <View style={[styles.stack, local.gap12]}>
            <InviteKeySwitches name={me} fields={mine} available={available} keys={keys} onToggle={(key, on) => setKeys((current) => toggleInviteKey(current, key, on))} />
            {available.includes("email") || available.includes("phone") ? <Caption>{t("add.inviteIn.showHint")}</Caption> : null}
          </View>
        ) : (
          <View style={kit.chips} testID="invite-share-chips">
            {keys.map((key) => <KitChip key={key} label={t(INVITE_KEY_COPY[key])} />)}
            {contactOff ? <KitChip label={t("add.invite.shareOff", { label: t("add.invite.keyContact") })} off /> : null}
          </View>
        )}
      </View>
      {/* R15 复核 S1: no client-side 「すでに人脈にいます」 guess; the owner checks 「同じ人かも」 after connecting. */}
      <View style={[kit.flat, local.noteCard, local.gap12]} testID="invite-same-later">
        <UiText importantForAccessibility="no" accessibilityElementsHidden style={local.noteEmoji}>📇</UiText>
        <UiText style={[kit.lbl, local.noteText]}>{t("add.inviteIn.sameLater")}</UiText>
      </View>
      {failed ? (
        <View style={[styles.notice, styles.noticeError, local.gap12]} testID="invite-connect-failed">
          <Icon name="alert" size={16} color={colors.coralText} />
          <View style={styles.grow}><Caption tone="error">{t("add.inviteIn.connectFailed")}</Caption></View>
        </View>
      ) : null}
    </View>
  );
}

function DoneView({ preview, result, sharedByMe, me, onOpen }: { preview: InviteCodePreview; result: Extract<InviteLandingView, { view: "done" }>["result"]; sharedByMe: InviteSharedFieldKey[]; me: string; onOpen: (contactId: string) => void }) {
  const { t } = useOrbitLocale();
  const { colors, styles: kit } = useInviteKit();
  const local = useStyles().styles;
  const inviter = inviteCallName(result.peer?.displayName || preview.shared.displayName);
  return (
    <View testID={`invite-done-${result.outcome}`}>
      <View style={local.doneHero}>
        <View style={local.pair}><View style={[local.ring, { borderColor: colors.bg }]}><Avatar name={me || "?"} size="lg" /></View><View style={[local.ring, local.pairSecond, { borderColor: colors.bg }]}><Avatar name={inviter} size="lg" /></View></View>
        <UiText accessibilityRole="header" style={local.h1}>{t("add.inviteIn.doneTitle", { name: inviter })}</UiText>
        <UiText style={[kit.sub, local.doneSub]}>{t("add.inviteIn.doneSub")}</UiText>
      </View>
      <View style={[kit.card, local.gap16]} testID="invite-to-peer">
        <UiText style={kit.lbl}>{t("add.inviteIn.toPeer", { name: inviter })}</UiText>
        <View style={kit.chips}>
          <KitChip label={t("add.invite.keyName")} />
          {sharedByMe.map((key) => <KitChip key={key} label={t(INVITE_KEY_COPY[key])} />)}
        </View>
        <UiText style={[kit.lbl, local.gap8]}>{t("add.inviteIn.autoUpdate", { name: inviter })}</UiText>
      </View>
      {/* b11 #10's 「アプリで続ける」 card; in the App it opens the new person instead (the person is already in the App). */}
      <View style={[kit.flat, local.appCard]}>
        <View style={[local.appic, { backgroundColor: colors.ink }]}><UiText style={[local.appicText, { color: colors.bg }]}>O</UiText></View>
        <View style={local.grow}>
          <UiText style={local.appTitle}>{t("add.inviteIn.viewInNetwork")}</UiText>
          <UiText style={kit.lbl}>{t("add.inviteIn.viewInNetworkBody")}</UiText>
        </View>
        <UiPressable accessibilityRole="button" accessibilityLabel={t("add.inviteIn.openPerson")} onPress={() => onOpen(result.contactId)} style={[local.smBtn, { backgroundColor: colors.ink }]} testID="invite-view-contact">
          <UiText style={[local.smBtnText, { color: colors.bg }]}>{t("add.inviteIn.openPerson")}</UiText>
        </UiPressable>
      </View>
    </View>
  );
}

function ExpiredView({ preview, full }: { preview: InviteCodePreview; full: boolean }) {
  const { language, t } = useOrbitLocale();
  const copy = useStandardCopy();
  const toast = useToast();
  const { colors, styles: kit } = useInviteKit();
  const local = useStyles().styles;
  const inviter = preview.shared.displayName;
  const draft = inviteResendRequestText({ inviter: inviteCallName(inviter), language });
  const copyDraft = async () => {
    try {
      await Clipboard.setStringAsync(draft);
      toast.success(t("add.invite.linkCopied"));
    } catch {
      toast.error(t("add.invite.copyFailed"));
    }
  };
  return (
    <View>
      <KitGuide style={local.expiredGuide} testID={full ? "invite-full" : "invite-expired"}>
        <UiText importantForAccessibility="no" accessibilityElementsHidden style={local.bigEmoji}>⌛</UiText>
        <UiText accessibilityRole="header" style={local.guideTitle}>{t(full ? "add.inviteIn.fullTitle" : "add.inviteIn.expiredTitle")}</UiText>
        <UiText style={[kit.sub, local.expiredSub]}>{full ? t("add.inviteIn.fullBody", { name: inviter }) : t("add.inviteIn.expiredBody", { date: inviteDate(preview.expiresAt, language, t), name: inviter })}</UiText>
      </KitGuide>
      <View style={[kit.card, local.gap12]} testID="invite-ask">
        <UiText style={local.askTitle}>{t("add.inviteIn.askTitle", { name: inviteCallName(inviter) })}</UiText>
        <View style={local.draftBox}><UiText selectable style={local.draftText} testID="invite-ask-text">{draft}</UiText></View>
        <View style={local.askActions}>
          <UiPressable accessibilityRole="button" accessibilityLabel={copy.action.copy} onPress={() => void copyDraft()} style={[local.smBtn, { backgroundColor: colors.ink }]} testID="invite-ask-copy">
            <Icon name="copy" size={16} color={colors.bg} />
            <UiText style={[local.smBtnText, { color: colors.bg }]}>{copy.action.copy}</UiText>
          </UiPressable>
          <UiPressable accessibilityRole="button" accessibilityLabel={t("add.invite.openLine")} onPress={() => void openInviteDraft(lineShareUrl(draft)).then((ok) => { if (!ok) toast.error(t("add.invite.openFailed")); })} style={[local.smBtn, { backgroundColor: colors.surface2 }]} testID="invite-ask-line">
            <UiText style={[local.smBtnText, { color: colors.ink }]}>{t("add.invite.openLine")}</UiText>
          </UiPressable>
        </View>
        <UiText style={[kit.lbl, local.gap8]}>{t("add.inviteIn.noSend")}</UiText>
      </View>
      {full ? null : (
        <View style={[kit.flat, local.noteCard, local.gap12]} testID="invite-sender-note">
          <UiText importantForAccessibility="no" accessibilityElementsHidden style={local.noteEmoji}>🔁</UiText>
          <UiText style={[kit.lbl, local.noteText]}>{t("add.inviteIn.senderNoteLead")}<UiText style={local.noteStrong}>{t("add.inviteIn.senderNoteStrong")}</UiText>{t("add.inviteIn.senderNoteTail")}</UiText>
        </View>
      )}
    </View>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  emoji: { fontSize: 40 },
  full: { alignSelf: "stretch" },
  center: { textAlign: "center" },
  grow: { flex: 1, minWidth: 0 },
  gap8: { marginTop: 8 },
  gap12: { marginTop: 12 },
  gap16: { marginTop: 16 },
  // head（b11：.row gap 10 · padding 6 0 14；.appic 28 / r 9）
  head: { alignItems: "center", flexDirection: "row", gap: 10, marginHorizontal: 2, marginTop: -12, paddingBottom: 10, paddingTop: 6 },
  headText: { flex: 1, minWidth: 0 },
  brand: { color: colors.ink, fontSize: 15, fontWeight: "700", lineHeight: 22.5 },
  appic: { alignItems: "center", borderRadius: 9, height: 28, justifyContent: "center", width: 28 },
  appicText: { fontSize: 13, fontWeight: "900", lineHeight: 16 },
  // 開く（b11 #9）
  person: { alignItems: "center", flexDirection: "row", gap: 12 },
  personName: { color: colors.ink, fontSize: 16, fontWeight: "700", lineHeight: 24 },
  accountName: { color: colors.ink, fontSize: 14, fontWeight: "700", lineHeight: 21 },
  factLabel: { fontWeight: "700", marginTop: 10 },
  factNext: { marginTop: 8 },
  fact: { color: colors.ink, fontSize: 13, lineHeight: 19.5 },
  explain: { alignItems: "flex-start", backgroundColor: colors.surface2, borderRadius: 24, flexDirection: "row", gap: 8, marginTop: 10, paddingHorizontal: 12, paddingVertical: 10 },
  explainEmoji: { fontSize: 14, lineHeight: 21 },
  explainText: { color: colors.ink2, flex: 1, lineHeight: 18.4 },
  codeLine: { marginHorizontal: 4, marginTop: 12 },
  openActions: { gap: 8, marginTop: 14 },
  // 共有する項目（b11 #12）
  connectGuide: { alignItems: "center", marginTop: 12, padding: 18 },
  pair: { flexDirection: "row", justifyContent: "center" },
  pairSecond: { marginLeft: -12 },
  // .av box-shadow 0 0 0 3px: a ring drawn outside the 56 box (it takes no room, so −3 on every side).
  ring: { borderRadius: 31, borderWidth: 3, margin: -3 },
  guideTitle: { color: colors.ink, fontSize: 18, fontWeight: "800", lineHeight: 27, marginTop: 10, textAlign: "center" },
  guideSub: { lineHeight: 20, marginTop: 4, textAlign: "center" },
  noteCard: { alignItems: "center", flexDirection: "row", gap: 10 },
  noteEmoji: { fontSize: 18, lineHeight: 27 },
  noteText: { color: colors.ink2, flex: 1, lineHeight: 18.4 },
  noteStrong: { color: colors.ink, fontWeight: "700" },
  // 完了（b11 #10）
  doneHero: { alignItems: "center", marginTop: 20 },
  h1: { color: colors.ink, fontSize: 22, fontWeight: "900", letterSpacing: -0.22, lineHeight: 29.7, marginTop: 14, textAlign: "center" },
  doneSub: { marginTop: 4, textAlign: "center" },
  appCard: { alignItems: "center", flexDirection: "row", gap: 12, marginTop: 14, padding: 14 },
  appTitle: { color: colors.ink, fontSize: 13, fontWeight: "700", lineHeight: 19.5 },
  smBtn: { alignItems: "center", borderRadius: 999, flexDirection: "row", gap: 6, height: 32, justifyContent: "center", paddingHorizontal: 12 },
  smBtnText: { fontSize: 12, fontWeight: "700", lineHeight: 18 },
  // 期限切れ（b11 #13）
  expiredGuide: { alignItems: "center", paddingHorizontal: 20, paddingVertical: 24 },
  bigEmoji: { fontSize: 44, lineHeight: 44 },
  expiredSub: { lineHeight: 20, marginTop: 6, textAlign: "center" },
  askTitle: { color: colors.ink, fontSize: 13.5, fontWeight: "700", lineHeight: 20.25 },
  draftBox: { backgroundColor: colors.surface2, borderRadius: 16, marginTop: 8, paddingHorizontal: 14, paddingVertical: 12 },
  draftText: { color: colors.ink, fontSize: 12.5, lineHeight: 21.9 },
  askActions: { flexDirection: "row", gap: 8, marginTop: 10 },
}));
