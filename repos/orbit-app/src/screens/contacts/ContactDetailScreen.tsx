import { Ionicons } from "@expo/vector-icons";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Image,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions
} from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { z } from "zod";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import type { OrbitApiClient } from "../../api/client";
import { ContactNotesSection } from "./ContactNotesSection";
import type { IndustryIdCode, SecondaryIndustryIdCode } from "../../api/contract/industries";
import { INDUSTRY_CATALOG, listSecondaryIndustries, secondaryIndustryLabel } from "../../api/domain/industries";
import {
  contactDetailPath,
  ORBIT_API_ENDPOINTS,
  relationshipCommunicationEligibilityPath,
  relationshipValueAnalysisPath,
  relationshipValueRecomputePath
} from "../../api/endpoints";
import { ContactPage } from "./ContactPage";
import { validateApiResourceState } from "../../api/validated-resource-state";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { radius, spacing, textStyles, type OrbitColors } from "../../design/tokens";
import { createControlStyles } from "../../design/controls";
import { createThemedStyles, useOrbitTheme } from "../../design/theme";
import {
  useApiResource,
  type ApiResourceState
} from "../../hooks/useApiResource";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { contactMessageTemplate, registerAiTemplatePrefill } from "../../data/ai-template-prefill";
import {
  contactDetailHeroToView,
  contactDetailToSummary,
  type ContactAvatarTone,
  type ContactDetailSummary
} from "../../view-models/contacts";
import {
  relationshipConnectionIdForContact,
  relationshipValueStateIsEmpty,
  relationshipValueToView
} from "../../view-models/relationship-value";
import { buildContactDetailEditRequest, confirmContactDetailEdit, contactDetailEditorFrom, contactDetailReadSchema as detailReadSchema, type ContactDetailEditor, type ContactDetailEditDraft } from "../../view-models/contact-detail-editor";
import { applyContactInitializationView } from "../../view-models/relationship-initialization";
import { ContactRelationshipInitializer, contactInitializationStageText, useContactInitialization, type ContactInitializationBinding } from "./ContactRelationshipInitializer";
import { isRelationshipEligibility, relationshipCommunicationEligibilityToView } from "../../view-models/contact-communication";

const detailFont = Platform.select({ web: '-apple-system,BlinkMacSystemFont,"PingFang SC","Hiragino Sans GB","Noto Sans SC","Microsoft YaHei",sans-serif', ios: "System", default: "sans-serif" });
const recomputeReadSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("empty"), assessment: z.null(), summary: z.string(), nextAction: z.string() }).passthrough(),
  z.object({ state: z.literal("success"), summary: z.string(), nextAction: z.string(), assessment: z.object({
    id: z.string().min(1), connectionId: z.string().min(1), contactId: z.string().min(1), contactDisplayName: z.string(), relationshipValueType: z.string(),
    priorityScore: z.object({ value: z.number().finite(), band: z.enum(["critical", "high", "medium", "low"]), factors: z.array(z.object({ label: z.string(), points: z.number().finite() }).passthrough()) }).passthrough(),
    rationale: z.object({ summary: z.string(), evidence: z.array(z.object({ label: z.string(), contribution: z.string() }).passthrough()) }).passthrough(),
    suggestedNextAction: z.object({ label: z.string(), dueWindow: z.string(), confidence: z.string() }).passthrough()
  }).passthrough() }).passthrough()
]);

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "contact";
  }

  return value ?? "contact";
}

function assetUrl(baseUrl: string, path: string): string {
  if (/^https?:\/\//iu.test(path)) {
    return path;
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl.replace(/\/+$/u, "")}${normalizedPath}`;
}

export function ContactDetailScreen({ scopeKey, isScopeCurrent }: { scopeKey?: string; isScopeCurrent?: () => boolean } = {}) {
  const { colors, styles } = useStyles();
  const locale = useOrbitLocale();
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const contactId = firstParam(id);
  const actorId = useOrbitAuthSession().actorId;
  const client = useOrbitApiClient(scopeKey === undefined ? {} : { scopeKey });
  const rawState = useApiResource<unknown>(
    contactDetailPath(contactId),
    () => false,
    { scopeKey: scopeKey ?? actorId }
  );
  const state = validateApiResourceState(rawState, detailReadSchema.refine(value => value.contact.id === contactId));
  const connectionsState = useApiResource<unknown>(
    ORBIT_API_ENDPOINTS.connections,
    () => false,
    { scopeKey: scopeKey ?? actorId }
  );
  const eligibilityState = useApiResource<unknown>(
    relationshipCommunicationEligibilityPath(contactId),
    () => false,
    { scopeKey: scopeKey ?? actorId, cachePolicy: "network-only" }
  );
  const connectionId =
    relationshipConnectionIdForContact(
      state.kind === "success" || state.kind === "empty" ? state.data : null,
      connectionsState.kind === "success" || connectionsState.kind === "empty"
        ? connectionsState.data
        : null,
      contactId
    ) ?? contactId;
  const relationshipValueState = useApiResource<unknown>(
    relationshipValueAnalysisPath(connectionId),
    relationshipValueStateIsEmpty,
    { scopeKey: JSON.stringify([scopeKey ?? actorId, connectionId]) }
  );
  const scrollRef = useRef<ScrollView>(null);
  const bodyTop = useRef(0);
  const scope = useMemo(() => ({ actorId, client, contactId, scopeKey }), [actorId, client, contactId, scopeKey]);
  const latestScope = useRef(scope);
  latestScope.current = scope;
  const valueScope = useMemo(() => ({ scope, connectionId }), [scope, connectionId]);
  const latestValueScope = useRef(valueScope);
  latestValueScope.current = valueScope;
  const lastValidDetail = useRef<{ scope: typeof scope; data: unknown } | null>(null);
  if (state.kind === "success" || state.kind === "empty") lastValidDetail.current = { scope, data: state.data };
  // A malformed refresh must remain visible as an error without discarding a
  // note already being edited. Never reuse this data across identity scopes.
  const detailData = state.kind === "success" || state.kind === "empty" ? state.data
    : (rawState.kind === "success" || rawState.kind === "empty") && lastValidDetail.current?.scope === scope ? lastValidDetail.current.data : null;
  const mounted = useRef(true);
  const editController = useRef<AbortController | null>(null);
  const valueController = useRef<AbortController | null>(null);
  const [editing, setEditing] = useState<{ original: ContactDetailEditor; draft: ContactDetailEditDraft; tagInput: string; scope: typeof scope } | null>(null);
  const currentEdit = editing?.scope === scope ? editing : null;
  const [editPending, setEditPending] = useState(false);
  const [pendingValueScope, setPendingValueScope] = useState<typeof valueScope | null>(null);
  const relationshipValuePending = pendingValueScope === valueScope;
  const [relationshipValueOverride, setRelationshipValueOverride] =
    useState<{ scope: typeof valueScope; data: unknown } | null>(null);
  const [valueFeedback, setValueFeedback] = useState<{ scope: typeof valueScope; message: string; error: boolean } | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const refreshing =
    state.refreshing ||
    connectionsState.refreshing ||
    eligibilityState.refreshing ||
    relationshipValueState.refreshing ||
    relationshipValuePending;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; editController.current?.abort(); valueController.current?.abort(); };
  }, [scope]);

  function isCurrent() { return mounted.current && latestScope.current === scope && isScopeCurrent?.() !== false; }
  const initialization = useContactInitialization(contactId, scopeKey, isCurrent, () => {
    if (!isCurrent()) return;
    setEditing(null); state.refresh(); connectionsState.refresh();
  });
  const canEditContact = initialization.state.view.kind === "hidden" || initialization.state.view.kind === "initialized";

  useEffect(() => () => {
    valueController.current?.abort();
    valueController.current = null;
  }, [valueScope]);

  function isValueCurrent() { return isCurrent() && latestValueScope.current === valueScope; }

  function refreshAll() {
    if (!isCurrent()) return;
    void initialization.controller.refresh();
    setRelationshipValueOverride(null);
    state.refresh();
    connectionsState.refresh();
    eligibilityState.refresh();
    relationshipValueState.refresh();
  }

  async function recomputeRelationshipValue() {
    if (!isValueCurrent() || valueController.current) return;
    const controller = new AbortController();
    valueController.current = controller;
    setPendingValueScope(valueScope);
    setValueFeedback(null);
    setFeedback(null);
    setActionError(null);

    try {
      const result = await client.post<unknown>(relationshipValueRecomputePath(), {
        body: { connectionId }, signal: controller.signal
      });
      if (!isValueCurrent() || controller.signal.aborted) return;
      const parsed = result.success && result.status >= 200 && result.status < 300 ? recomputeReadSchema.safeParse(result.data) : null;
      if (parsed?.success && (parsed.data.state === "empty" || (parsed.data.assessment.contactId === contactId && parsed.data.assessment.connectionId === connectionId))) {
        setRelationshipValueOverride({ scope: valueScope, data: parsed.data });
        setValueFeedback({ scope: valueScope, error: false, message: parsed.data.state === "empty" ? locale.t("contacts.valueInsufficient") : locale.t("contacts.valueRecomputed") });
      } else {
        setValueFeedback({ scope: valueScope, error: true, message: locale.t("contacts.valueError") });
      }
    } catch {
      if (isValueCurrent() && !controller.signal.aborted) setValueFeedback({ scope: valueScope, error: true, message: locale.t("contacts.valueError") });
    } finally {
      if (isValueCurrent() && !controller.signal.aborted) setPendingValueScope(null);
      if (valueController.current === controller) valueController.current = null;
    }
  }

  function openEditor() {
    if (!isCurrent() || !canEditContact || (state.kind !== "success" && state.kind !== "empty")) return;
    const original = contactDetailEditorFrom(applyContactInitializationView(state.data, initialization.state.view), contactId);
    setFeedback(null);
    if (!original) { setActionError(locale.t("contacts.editUnavailable")); return; }
    setEditing({ original, draft: original.draft, tagInput: "", scope });
    setActionError(null); scrollRef.current?.scrollTo({ y: 0, animated: false });
  }

  function cancelEditor() {
    if (!isCurrent() || editController.current) return;
    setEditing(null); setActionError(null); scrollRef.current?.scrollTo({ y: 0, animated: false });
  }

  async function saveEditor() {
    if (!isCurrent() || !currentEdit || editController.current) return;
    const request = buildContactDetailEditRequest(currentEdit.original, {
      ...currentEdit.draft,
      tags: currentEdit.tagInput.trim() ? [...currentEdit.draft.tags, currentEdit.tagInput.trim()] : currentEdit.draft.tags
    });
    if (!request.success) { setActionError(request.error); return; }
    if (Object.keys(request.body).length === 0) { cancelEditor(); return; }
    const controller = new AbortController(); editController.current = controller;
    setEditPending(true); setActionError(null); setFeedback(null);
    try {
      const result = await client.patch<unknown>(contactDetailPath(contactId), { body: request.body, signal: controller.signal });
      if (!isCurrent() || controller.signal.aborted) return;
      if (result.success && result.status >= 200 && result.status < 300 && confirmContactDetailEdit(result.data, contactId, request.body)) {
        setEditing(null); setFeedback(locale.t("contacts.saved")); refreshAll(); scrollRef.current?.scrollTo({ y: 0, animated: false });
      } else {
        setActionError(locale.t("contacts.saveUnconfirmed"));
      }
    } catch {
      if (isCurrent() && !controller.signal.aborted) setActionError(locale.t("contacts.saveUnconfirmed"));
    } finally {
      if (isCurrent() && !controller.signal.aborted) setEditPending(false);
      if (editController.current === controller) editController.current = null;
    }
  }

  return (
    <ContactPage
      detail
      backLabel={locale.t("contacts.back")}
      backHref="/contacts"
      scrollRef={scrollRef}
      isCurrent={isCurrent}
      onBodyLayout={event => { bodyTop.current = event.nativeEvent.layout.y; }}
      toolbarLeft={currentEdit ? <Pressable accessibilityRole="button" accessibilityLabel={locale.language === "zh" ? "取消编辑" : locale.t("common.cancel")} disabled={editPending} onPress={cancelEditor} style={styles.cancelHeaderButton}><Text style={styles.cancelHeaderText}>{locale.t("common.cancel")}</Text></Pressable> : undefined}
      toolbarRight={currentEdit
        ? <Pressable accessibilityRole="button" accessibilityLabel={locale.language === "zh" ? "保存人脉" : locale.t("common.save")} disabled={editPending} onPress={saveEditor} style={[styles.editHeaderButton, editPending && styles.disabled]}><Text style={styles.editHeaderText}>{editPending ? locale.t("contacts.saving") : locale.t("common.save")}</Text></Pressable>
        : canEditContact && (state.kind === "success" || state.kind === "empty") ? <Pressable accessibilityRole="button" accessibilityLabel={locale.t("contacts.edit")} onPress={openEditor} style={styles.editHeaderButton}><Text style={styles.editHeaderText}>{locale.t("contacts.edit")}</Text></Pressable> : null}
      refreshControl={
        <RefreshControl
          onRefresh={refreshAll}
          refreshing={refreshing}
          tintColor={colors.accent}
        />
      }
      title={currentEdit ? locale.t("contacts.editTitle") : locale.t("contacts.detailTitle")}
    >
      {state.kind === "loading" ? <LoadingState /> : null}
      {state.kind === "offline" ? (
        <ErrorState message={state.error.message} title={locale.t("contacts.serverUnavailable")} />
      ) : null}
      {state.kind === "failure" ? (
        <ErrorState message={state.error.message} />
      ) : null}
      {state.kind === "offline" || state.kind === "failure" ? <Pressable accessibilityRole="button" accessibilityLabel={locale.t("contacts.retryDetail")} onPress={refreshAll} style={styles.statusButton}><Text style={styles.statusButtonText}>{locale.t("contacts.readAgain")}</Text></Pressable> : null}
      {feedback ? <Text style={styles.feedbackText}>{feedback}</Text> : null}
      {actionError ? <Text style={styles.errorText}>{actionError}</Text> : null}
      {valueFeedback?.scope === valueScope ? <Text style={valueFeedback.error ? styles.errorText : styles.feedbackText}>{valueFeedback.message}</Text> : null}
      {currentEdit ? <UpdateContactPanel original={currentEdit.original} draft={currentEdit.draft} tagInput={currentEdit.tagInput} onChangeTagInput={tagInput => { if (!isCurrent() || editController.current) return; setEditing(value => value?.scope === scope ? { ...value, tagInput } : value); }} pending={editPending} onChange={patch => { if (!isCurrent() || editController.current) return; setEditing(value => value?.scope === scope ? { ...value, draft: { ...value.draft, ...patch } } : value); setActionError(null); }} /> : null}
      <View style={currentEdit ? styles.hidden : undefined}>
      {detailData !== null ? (
        <ContactDetailCard
          actorId={actorId}
          client={client}
          contactId={contactId}
          data={applyContactInitializationView(detailData, initialization.state.view)}
          initialization={initialization}
          eligibilityState={eligibilityState}
          isScopeCurrent={isCurrent}
          onScrollTo={y => scrollRef.current?.scrollTo({ y: bodyTop.current + y, animated: true })}
          onNotesRefresh={state.refresh}
          onRecompute={recomputeRelationshipValue}
          relationshipValueOverride={relationshipValueOverride?.scope === valueScope ? relationshipValueOverride.data : null}
          relationshipValuePending={relationshipValuePending}
          relationshipValueState={relationshipValueState}
        />
      ) : null}
      </View>
    </ContactPage>
  );
}

function ContactDetailCard({
  actorId,
  client,
  contactId,
  data,
  initialization,
  eligibilityState,
  isScopeCurrent,
  onScrollTo,
  onNotesRefresh,
  onRecompute,
  relationshipValueOverride,
  relationshipValuePending,
  relationshipValueState
}: {
  actorId: string | null;
  client: OrbitApiClient;
  contactId: string;
  data: unknown;
  initialization: ContactInitializationBinding;
  eligibilityState: ApiResourceState<unknown>;
  isScopeCurrent: () => boolean;
  onScrollTo: (y: number) => void;
  onNotesRefresh: () => void;
  onRecompute: () => void;
  relationshipValueOverride: unknown | null;
  relationshipValuePending: boolean;
  relationshipValueState: ApiResourceState<unknown>;
}) {
  const { colors } = useOrbitTheme();
  const { styles } = useStyles();
  const locale = useOrbitLocale();
  const router = useRouter();
  const { baseUrl } = useOrbitApiBaseUrl();
  const contact = contactDetailToSummary(data, locale.language);
  const baseHero = contactDetailHeroToView(contact);
  const initView = initialization.state.view;
  const hero = { ...baseHero, status: initView.kind === "hidden" ? baseHero.status : contactInitializationStageText(initView.kind === "initialized" ? initView.stage : initView.kind, locale.language) };
  const toneStyle = avatarToneStyles(colors)[hero.avatar.tone];
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [prefillError, setPrefillError] = useState<string | null>(null);
  const [notesRequest, setNotesRequest] = useState(0);
  const notesTop = useRef(0);
  function openMessageDraft() {
    if (!isScopeCurrent()) return;
    if (!actorId || !baseUrl) { setPrefillError(locale.t("contacts.signInForAi")); return; }
    const prefillIntent = registerAiTemplatePrefill({ actorId, baseUrl, ...contactMessageTemplate(contact) });
    setPrefillError(null);
    router.push({ pathname: "/ai/[id]", params: { id: "new", prefillIntent } } as Href);
  }

  return (
    <>
      <ContactIdentityHeader
        baseUrl={baseUrl}
        hero={{ ...hero, detailLine: [contact.role, contact.organization].filter(Boolean).join(" · ") }}
        location={contact.location}
        sourceLabel={contact.sourceLabel}
        toneStyle={toneStyle}
      />
      <ContactCommunicationStatus contactId={contactId} state={eligibilityState} />
      <ContactRelationshipInitializer binding={initialization} />
      {initView.kind === "hidden" || initView.kind === "initialized" ? <NextStepCard
        action={initView.kind === "hidden" ? contact.nextAction : ""}
        onPress={openMessageDraft}
        onSchedule={() => { if (isScopeCurrent()) router.push("/schedule"); }}
        onNotes={() => { if (isScopeCurrent()) { setNotesRequest(value => value + 1); onScrollTo(notesTop.current); } }}
      /> : null}
      {prefillError ? <Text style={styles.errorText}>{prefillError}</Text> : null}
      <ContactOverview contact={contact} email={detailReadSchema.safeParse(data).data?.contact.primaryEmail} />
      <View onLayout={event => { notesTop.current = event.nativeEvent.layout.y; }}><ContactNotesSection actorId={actorId} client={client} colors={colors} contactId={contactId} data={data} onRefresh={onNotesRefresh} openRequest={notesRequest} preview isScopeCurrent={isScopeCurrent} /></View>
      <DisclosureSection
        detail={locale.t("contacts.fullDetailsDetail")}
        expanded={detailsExpanded}
        onPress={() => setDetailsExpanded((current) => !current)}
        title={locale.t("contacts.fullDetails")}
      >
        <FullDetailsPanel
          contact={contact}
          onRecompute={onRecompute}
          relationshipValueOverride={relationshipValueOverride}
          relationshipValuePending={relationshipValuePending}
          relationshipValueState={relationshipValueState}
        />
      </DisclosureSection>
    </>
  );
}

function ContactCommunicationStatus({ contactId, state }: { contactId: string; state: ApiResourceState<unknown> }) {
  const { styles } = useStyles();
  const locale = useOrbitLocale();
  const router = useRouter();
  const data = state.kind === "success" || state.kind === "empty" ? state.data : null;
  if (state.kind === "loading") {
    return <View style={styles.nextStepCard}><Text style={styles.bodyText}>{locale.t("contacts.chatChecking")}</Text></View>;
  }
  if (!isRelationshipEligibility(data) || data.contactId !== contactId) {
    return <View style={styles.nextStepCard}><Text style={styles.bodyText}>{locale.t("contacts.chatUnavailable")}</Text></View>;
  }
  const view = relationshipCommunicationEligibilityToView(data);
  const statusLabel = {
    confirmed: locale.t("contacts.statusConfirmed"),
    conflict: locale.t("contacts.statusConflict"),
    expired: locale.t("contacts.statusExpired"),
    forbidden: locale.t("contacts.statusForbidden"),
    pending: locale.t("contacts.statusPending"),
    revoked: locale.t("contacts.statusRevoked"),
    unregistered: locale.t("contacts.statusUnregistered")
  }[view.status];
  return (
    <View style={styles.nextStepCard}>
      <View style={{ flex: 1, gap: spacing.xs }}>
        <Text style={styles.sectionTitle}>{locale.t("contacts.chatEligibility")}</Text>
        <Text style={styles.bodyText}>{statusLabel}{view.remoteName ? ` · ${locale.t.literal(view.remoteName)}` : ""}</Text>
      </View>
      {view.canSend ? (
        <Pressable accessibilityRole="button" onPress={() => router.push(`/chat/${encodeURIComponent(view.conversationId)}` as Href)} style={styles.secondaryActionButton}>
          <Text style={styles.secondaryActionText}>{locale.t("contacts.openChat")}</Text>
        </Pressable>
      ) : view.canInvite ? (
        <Pressable accessibilityRole="button" onPress={() => router.push("/contacts/intros" as Href)} style={styles.secondaryActionButton}>
          <Text style={styles.secondaryActionText}>{locale.t("contacts.createInvitation")}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function ContactIdentityHeader({
  baseUrl,
  hero,
  location,
  sourceLabel,
  toneStyle
}: {
  baseUrl: string;
  hero: ReturnType<typeof contactDetailHeroToView>;
  location: string;
  sourceLabel: string;
  toneStyle: { backgroundColor: string; color: string };
}) {
  const { styles } = useStyles();
  const gradientId = useId().replace(/:/gu, "");
  return (
    <View style={styles.contactHero}>
      <View style={styles.contactHeroHeader}>
        <View
          testID="contact-detail-avatar"
          style={[
            styles.heroAvatar,
            { backgroundColor: toneStyle.backgroundColor }
          ]}
        >
          {hero.avatar.imageUrl ? (
            <Image
              resizeMode="cover"
              source={{ uri: assetUrl(baseUrl, hero.avatar.imageUrl) }}
              style={styles.heroAvatarImage}
            />
          ) : (
            <><Svg accessible={false} width="100%" height="100%" viewBox="0 0 72 72" style={StyleSheet.absoluteFill}><Defs><LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor="#7FB3FF" /><Stop offset="1" stopColor="#3B82F6" /></LinearGradient></Defs><Rect width="72" height="72" fill={`url(#${gradientId})`} /></Svg><Text style={styles.heroAvatarText}>
              {hero.avatar.initial}
            </Text></>
          )}
        </View>
        <View style={styles.contactHeroTitleBlock}>
          <Text style={styles.contactHeroName}>
            {hero.name}
          </Text>
          <Text style={styles.contactHeroDetail}>
            {hero.detailLine}
          </Text>
          {location ? <Text style={styles.heroLocation}>{location}</Text> : null}
          <View style={styles.heroMetaRow}>
            {sourceLabel ? <Text style={styles.sourcePill}>{sourceLabel}</Text> : null}
            <Text style={styles.statusPill}>{hero.status}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

function NextStepCard({
  action,
  onPress,
  onSchedule,
  onNotes
}: {
  action: string;
  onPress: () => void;
  onSchedule: () => void;
  onNotes: () => void;
}) {
  const { styles } = useStyles();
  const locale = useOrbitLocale();
  const { width, fontScale } = useWindowDimensions();
  return (
    <View accessibilityHint={action} style={[styles.nextStepCard, (fontScale >= 1.4 || width < 360) && styles.actionStack]}>
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [
          styles.primaryActionButton,
          pressed ? styles.pressed : null
        ]}
      >
        <Text style={styles.primaryActionButtonText}>{locale.t("contacts.draftMessage")}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={onSchedule} style={styles.secondaryActionButton}><Text style={styles.secondaryActionText}>{locale.t("contacts.viewSchedule")}</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={onNotes} style={styles.secondaryActionButton}><Text style={styles.secondaryActionText}>{locale.t("contacts.writeNote")}</Text></Pressable>
    </View>
  );
}

function ContactOverview({ contact, email }: { contact: ContactDetailSummary; email?: string | undefined }) {
  const { styles } = useStyles();
  const locale = useOrbitLocale();
  const exchange = relationshipExchangeFor(contact);

  return (
    <View style={styles.overviewSurface}>
      <DetailSection title={locale.t("contacts.basicDetails")}>
        <View>{[[locale.t("contacts.identity"), contact.role], [locale.t("profile.organization"), contact.organization], [locale.t("contacts.filterIndustry"), [contact.primaryIndustryLabel, contact.secondaryIndustryLabel || (contact.primaryIndustryId ? locale.t("contacts.secondaryIndustryMissing") : "")].filter(Boolean).join(" / ")], [locale.t("profile.email"), email]].map(([label, value]) => <View key={label} style={styles.basicRow}><Text style={styles.basicLabel}>{label}</Text><Text selectable style={styles.basicValue}>{value || locale.t("profile.notFilled")}</Text></View>)}</View>
      </DetailSection>
      <DetailSection title={locale.t("contacts.aboutCollaboration")}>
        <Text style={styles.bodyText}>{locale.t.literal(contact.publicBio || contact.relationship) || locale.t("contacts.noIntroduction")}</Text>
        <View style={styles.exchangeRows}>
          <ExchangeValueRow label={locale.t("contacts.offering")} values={exchange.offering} />
          <ExchangeValueRow label={locale.t("contacts.seeking")} values={exchange.seeking} />
        </View>
      </DetailSection>
    </View>
  );
}

function ExchangeValueRow({
  label,
  values
}: {
  label: string;
  values: string[];
}) {
  const { styles } = useStyles();
  const locale = useOrbitLocale();

  return (
    <View style={styles.exchangeRow}>
      <Text style={styles.exchangeLabel}>{label}</Text>
      <Text style={styles.exchangeValue}>
        {values.length > 0 ? locale.t.literal(values.join(" · ")) : locale.t("contacts.notRecorded")}
      </Text>
    </View>
  );
}

function LatestActivityPreview({
  contact
}: {
  contact: ContactDetailSummary;
}) {
  const { colors, styles } = useStyles();
  const locale = useOrbitLocale();
  const hasInteraction = contact.lastInteractionAt !== locale.t("profile.notFilled") && contact.lastInteractionAt !== "暂无记录";
  const latest = hasInteraction ? contact.lastInteractionSummary || contact.noteSummaries[0] : undefined;
  const meta = compactInteractionDate(contact.lastInteractionAt, locale.language);

  return (
    <DetailSection detail={meta} title={locale.t("contacts.latestActivity")}>
      <View style={styles.activityRow}>
        <View style={styles.activityIcon}>
          <Ionicons color={colors.text3} name="time-outline" size={24} />
        </View>
        <Text numberOfLines={2} style={latest ? styles.activityText : styles.emptyText}>
          {latest ? locale.t.literal(latest) : locale.t("contacts.noInteractions")}
        </Text>
      </View>
    </DetailSection>
  );
}

function DisclosureSection({
  children,
  detail,
  expanded,
  onPress,
  title
}: {
  children: ReactNode;
  detail: string;
  expanded: boolean;
  onPress: () => void;
  title: string;
}) {
  const { colors, styles } = useStyles();
  return (
    <View style={styles.disclosureSurface}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={onPress}
        style={({ pressed }) => [
          styles.disclosureHeader,
          pressed ? styles.pressed : null
        ]}
      >
        <View style={styles.disclosureCopy}>
          <Text style={styles.disclosureTitle}>{title}</Text>
          <Text numberOfLines={2} style={styles.disclosureDetail}>
            {detail}
          </Text>
        </View>
        <Ionicons
          color={colors.text3}
          name={expanded ? "chevron-up" : "chevron-down"}
          size={19}
        />
      </Pressable>
      {expanded ? <View style={styles.disclosureContent}>{children}</View> : null}
    </View>
  );
}

function FullDetailsPanel({
  contact,
  onRecompute,
  relationshipValueOverride,
  relationshipValuePending,
  relationshipValueState
}: {
  contact: ContactDetailSummary;
  onRecompute: () => void;
  relationshipValueOverride: unknown | null;
  relationshipValuePending: boolean;
  relationshipValueState: ApiResourceState<unknown>;
}) {
  const { styles } = useStyles();
  const locale = useOrbitLocale();
  const publicTags = uniqueDisplayItems([
    ...contact.publicTopics,
    ...contact.valueLabels
  ]).filter(
    (tag) =>
      tag.length <= 20 &&
      tag !== contact.publicBio &&
      tag !== contact.relationship
  );
  return (
    <>
      <DetailSection title={locale.t("contacts.relationshipBackground")}><Text style={styles.bodyText}>{locale.t.literal(contact.relationship)}</Text><Text style={styles.bodyText}>{relationshipSummaryFor(contact, locale.t)}</Text></DetailSection>
      <DetailSection title={locale.t("contacts.nextStep")}><Text style={styles.bodyText}>{locale.t.literal(contact.nextAction)}</Text></DetailSection>
      <LatestActivityPreview contact={contact} />
      {publicTags.length > 0 ? <DetailSection detail={locale.t("contacts.publicTopicsDetail")} title={locale.t("contacts.publicTopics")}><TagList items={publicTags} /></DetailSection> : null}
      <SectionDivider />
      <DetailSection title={locale.t("contacts.relationshipValue")}>
        <RelationshipValueCard
          onRecompute={onRecompute}
          overrideData={relationshipValueOverride}
          pending={relationshipValuePending}
          state={relationshipValueState}
        />
      </DetailSection>
      <SectionDivider />
      <DetailSection detail={locale.t.literal(contact.sourceLabel)} title={locale.t("contacts.sourceRecords")}>
        <EvidenceList contact={contact} />
      </DetailSection>
      {contact.noteSummaries.length > 1 ? (
        <>
          <SectionDivider />
          <DetailSection detail={locale.t.literal(contact.lastInteractionAt)} title={locale.t("contacts.moreRecords")}>
            <PromptList prompts={contact.noteSummaries.slice(1)} />
          </DetailSection>
        </>
      ) : null}
    </>
  );
}

function UpdateContactPanel({
  original,
  draft,
  tagInput,
  onChangeTagInput,
  pending,
  onChange
}: {
  original: ContactDetailEditor;
  draft: ContactDetailEditDraft;
  tagInput: string;
  onChangeTagInput: (value: string) => void;
  pending: boolean;
  onChange: (patch: Partial<ContactDetailEditDraft>) => void;
}) {
  const { colors, styles } = useStyles();
  const locale = useOrbitLocale();
  const { baseUrl } = useOrbitApiBaseUrl();
  const { width, fontScale } = useWindowDimensions();
  const gradientId = useId().replace(/:/gu, "");
  const contact = original.contact;
  const avatar = contactDetailHeroToView(contactDetailToSummary({ contact }, locale.language)).avatar;
  const statusLabels = { active: locale.t("contacts.statusActive"), needs_follow_up: locale.t("contacts.statusNeedsFollowUp"), nurture: locale.t("contacts.statusNurture"), archived: locale.t("contacts.statusArchived") };
  const channels = [{ id: "manual_note", label: locale.t("contacts.channelManualNote") }, { id: "event_note", label: locale.t("contacts.channelEventNote") }, { id: "email_signal", label: locale.t("contacts.channelEmail") }, { id: "calendar_signal", label: locale.t("contacts.channelCalendar") }, { id: "referral", label: locale.t("contacts.channelReferral") }];

  return (
    <View testID="contact-editor">
      <View style={styles.editIdentity}>
        <View testID="contact-edit-avatar" style={[styles.heroAvatar, styles.editAvatar]}>
          {avatar.imageUrl ? <Image accessibilityLabel={locale.t("contacts.avatarFor", { name: locale.t.literal(contact.displayName) })} source={{ uri: assetUrl(baseUrl, avatar.imageUrl) }} style={styles.heroAvatarImage} />
            : <><Svg accessible={false} width="100%" height="100%" viewBox="0 0 76 76" style={StyleSheet.absoluteFill}><Defs><LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor="#7FB3FF" /><Stop offset="1" stopColor="#3B82F6" /></LinearGradient></Defs><Rect width="76" height="76" fill={`url(#${gradientId})`} /></Svg><Text style={styles.heroAvatarText}>{avatar.initial}</Text></>}
        </View>
        <Text style={styles.editReadOnlyHint}>{locale.t("contacts.readOnlyIdentity")}</Text>
      </View>
      <View style={styles.editForm}>
        <EditReadOnlyField label={locale.t("contacts.name")} value={contact.displayName} prominent />
        <View style={[styles.editColumns, (width < 360 || fontScale >= 1.4) && styles.actionStack]}><EditReadOnlyField label={locale.t("profile.organization")} value={contact.organization} column={width >= 360 && fontScale < 1.4} /><EditReadOnlyField label={locale.t("profile.role")} value={contact.role} column={width >= 360 && fontScale < 1.4} /></View>
        <View><Text style={styles.editLabel}>{locale.t("contacts.filterIndustry")}</Text><IndustryPicker pending={pending} selectedId={draft.primaryIndustryId ?? undefined} selectedLabel={INDUSTRY_CATALOG.find(item => item.id === draft.primaryIndustryId)?.labels[locale.language]} onSelect={primaryIndustryId => onChange({ primaryIndustryId, ...(primaryIndustryId !== draft.primaryIndustryId ? { secondaryIndustryId: null } : {}) })} /></View>
        <View><Text style={styles.editLabel}>{locale.t("contacts.secondaryIndustry")}</Text><SecondaryIndustryPicker pending={pending} primaryIndustryId={draft.primaryIndustryId} selectedId={draft.secondaryIndustryId ?? null} onSelect={secondaryIndustryId => onChange({ secondaryIndustryId })} /></View>
        <EditReadOnlyField label={locale.t("profile.email")} value={contact.primaryEmail ?? ""} />
        {original.statusOptions.length ? <View><Text style={styles.editLabel}>{locale.t("contacts.followUpStatus")}</Text><View style={styles.editChips}>{original.statusOptions.map(status => <Pressable key={status} accessibilityRole="button" accessibilityLabel={locale.language === "zh" ? `跟进状态：${statusLabels[status]}` : `${locale.t("contacts.followUpStatus")}: ${statusLabels[status]}`} accessibilityState={{ selected: draft.status === status }} aria-selected={draft.status === status} disabled={pending} onPress={() => onChange({ status })} style={[styles.editChip, draft.status === status && styles.editChipSelected]}><Text style={[styles.editChipText, draft.status === status && styles.editChipSelectedText]}>{statusLabels[status]}</Text></Pressable>)}</View></View> : <Text style={styles.editReadOnlyHint}>{locale.language === "zh" ? "关系阶段由关系生命周期管理；此处仅编辑私有资料。" : locale.language === "ja" ? "関係段階はライフサイクルで管理します。ここでは個人用情報のみ編集できます。" : "Relationship stage is managed by its lifecycle; edit private details here."}</Text>}
        <View><Text style={styles.editLabel}>{locale.t("contacts.tags")}</Text><View style={styles.editChips}>{draft.tags.map(tag => <Pressable key={tag} accessibilityRole="button" accessibilityLabel={locale.t("contacts.removeTag", { tag: locale.t.literal(tag) })} disabled={pending} onPress={() => onChange({ tags: draft.tags.filter(value => value !== tag) })} style={[styles.editChip, styles.editChipSelected]}><Text style={[styles.editChipText, styles.editChipSelectedText]}>{locale.t.literal(tag)}</Text><Ionicons color={colors.onAccent} name="close" size={14} /></Pressable>)}</View>
          <View style={styles.editTagEntry}><TextInput accessibilityLabel={locale.t("contacts.addTag")} editable={!pending} value={tagInput} onChangeText={onChangeTagInput} placeholder={locale.t("contacts.inputNewTag")} placeholderTextColor={colors.text3} style={[styles.editInput, styles.editTagInput]} /><Pressable accessibilityRole="button" accessibilityLabel={locale.t("contacts.addThisTag")} disabled={pending || !tagInput.trim()} onPress={() => { if (pending || !tagInput.trim()) return; onChange({ tags: [...new Set([...draft.tags, tagInput.trim()])] }); onChangeTagInput(""); }} style={[styles.editChip, styles.editTagAdd]}><Ionicons color={colors.text3} name="add" size={16} /><Text style={styles.editChipText}>{locale.t("contacts.add")}</Text></Pressable></View>
        </View>
        <View style={styles.editInteraction}><Text style={styles.sectionTitle}>{locale.t("contacts.interactionHistory")}</Text><Text style={styles.editReadOnlyHint}>{locale.t("contacts.interactionOnlyUpdatesLatest")}</Text>
          <Text style={styles.editLabel}>{locale.t("contacts.time")}</Text><TextInput accessibilityLabel={locale.language === "zh" ? "互动时间" : locale.t("contacts.time")} editable={!pending} value={draft.lastInteraction.occurredAt} onChangeText={occurredAt => onChange({ lastInteraction: { ...draft.lastInteraction, occurredAt } })} placeholder={locale.t("contacts.interactionTimePlaceholder")} placeholderTextColor={colors.text3} style={styles.editInput} />
          <Text style={styles.editLabel}>{locale.t("contacts.channel")}</Text><View style={styles.editChips}>{channels.map(channel => <Pressable key={channel.id} accessibilityRole="button" accessibilityLabel={locale.language === "zh" ? `互动渠道：${channel.label}` : `${locale.t("contacts.channel")}: ${channel.label}`} accessibilityState={{ selected: draft.lastInteraction.channel === channel.id }} aria-selected={draft.lastInteraction.channel === channel.id} disabled={pending} onPress={() => onChange({ lastInteraction: { ...draft.lastInteraction, channel: channel.id } })} style={[styles.editChip, draft.lastInteraction.channel === channel.id && styles.editChipSelected]}><Text style={[styles.editChipText, draft.lastInteraction.channel === channel.id && styles.editChipSelectedText]}>{channel.label}</Text></Pressable>)}</View>
          <Text style={styles.editLabel}>{locale.t("contacts.summary")}</Text><TextInput accessibilityLabel={locale.language === "zh" ? "互动摘要" : locale.t("contacts.summary")} editable={!pending} multiline value={draft.lastInteraction.summary} onChangeText={summary => onChange({ lastInteraction: { ...draft.lastInteraction, summary } })} placeholder={locale.t("contacts.interactionSummaryPlaceholder")} placeholderTextColor={colors.text3} style={[styles.editInput, styles.editSummary]} textAlignVertical="top" />
        </View>
      </View>
    </View>
  );
}

function EditReadOnlyField({ label, value, prominent = false, column = false }: { label: string; value: string; prominent?: boolean; column?: boolean }) {
  const { styles } = useStyles();
  const locale = useOrbitLocale();
  return <View style={[styles.editField, column && styles.editColumn]}><Text style={styles.editLabel}>{label}</Text><View style={[styles.editReadOnlyValue, prominent && styles.editNameLine]}><Text selectable style={[styles.editValueText, prominent && styles.editNameText]}>{locale.t.literal(value) || locale.t("profile.notFilled")}</Text></View></View>;
}

function SecondaryIndustryPicker({ primaryIndustryId, selectedId, pending, onSelect }: {
  primaryIndustryId: IndustryIdCode | null;
  selectedId: SecondaryIndustryIdCode | null;
  pending: boolean;
  onSelect: (value: SecondaryIndustryIdCode) => void;
}) {
  const { styles } = useStyles();
  const locale = useOrbitLocale();
  const [expanded, setExpanded] = useState(false);
  return <View style={styles.industryPicker}>
    <Pressable accessibilityRole="button" accessibilityLabel={locale.t("contacts.selectSecondaryIndustry")} accessibilityState={{ expanded }} disabled={pending || !primaryIndustryId} onPress={() => setExpanded(value => !value)} style={[styles.editIndustryButton, (pending || !primaryIndustryId) && styles.disabled]}>
      <Text style={styles.editValueText}>{selectedId ? secondaryIndustryLabel(selectedId, locale.language) : locale.t("contacts.secondaryIndustryMissing")}</Text>
      <Ionicons color="#C4C9D4" name={expanded ? "caret-up" : "caret-down"} size={12} />
    </Pressable>
    {expanded && primaryIndustryId ? <View style={styles.industryOptions}>
      {listSecondaryIndustries(primaryIndustryId).map(industry => <Pressable key={industry.id} accessibilityRole="button" accessibilityLabel={locale.t("contacts.setSecondaryIndustry", { name: industry.labels[locale.language] })} accessibilityState={{ selected: selectedId === industry.id }} disabled={pending} onPress={() => { onSelect(industry.id); setExpanded(false); }} style={[styles.industryOption, selectedId === industry.id && styles.industryOptionSelected]}>
        <Text style={[styles.industryOptionText, selectedId === industry.id && styles.industryOptionTextSelected]}>{industry.labels[locale.language]}</Text>
      </Pressable>)}
    </View> : null}
  </View>;
}

function IndustryPicker({
  onSelect,
  pending,
  selectedId,
  selectedLabel
}: {
  onSelect: (industryId: IndustryIdCode | null) => void;
  pending: boolean;
  selectedId: IndustryIdCode | undefined;
  selectedLabel: string | undefined;
}) {
  const { colors, styles } = useStyles();
  const locale = useOrbitLocale();
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={styles.industryPicker}>
      <Pressable
        accessibilityLabel={locale.t("contacts.selectPrimaryIndustry")}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        disabled={pending}
        onPress={() => setExpanded((current) => !current)}
        style={({ pressed }) => [
          styles.editIndustryButton,
          pending ? styles.disabled : null,
          pressed ? styles.pressed : null
        ]}
      >
        <View style={styles.industryPickerCopy}>
          <Text style={styles.editValueText}>
            {selectedLabel || locale.t("profile.notFilled")}
          </Text>
        </View>
        <Ionicons
          color="#C4C9D4"
          name={expanded ? "caret-up" : "caret-down"}
          size={12}
        />
      </Pressable>
      {expanded ? (
        <View style={styles.industryOptions}>
          <Pressable accessibilityRole="button" accessibilityLabel={locale.t("contacts.clearPrimaryIndustry")} disabled={pending} onPress={() => { onSelect(null); setExpanded(false); }} style={styles.industryOption}><Text style={styles.industryOptionText}>{locale.t("profile.notFilled")}</Text></Pressable>
          {INDUSTRY_CATALOG.map((industry) => {
            const selected = industry.id === selectedId;

            return (
              <Pressable
                accessibilityLabel={locale.t("contacts.setPrimaryIndustry", { name: industry.labels[locale.language] })}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                disabled={pending}
                key={industry.id}
                onPress={() => {
                  onSelect(industry.id);
                  setExpanded(false);
                }}
                style={({ pressed }) => [
                  styles.industryOption,
                  selected ? styles.industryOptionSelected : null,
                  pressed ? styles.pressed : null
                ]}
              >
                <Text
                  style={[
                    styles.industryOptionText,
                    selected ? styles.industryOptionTextSelected : null
                  ]}
                >
                  {industry.labels[locale.language]}
                </Text>
                {selected ? (
                  <Ionicons color={colors.accent} name="checkmark" size={18} />
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function DetailSection({
  children,
  detail,
  title
}: {
  children: ReactNode;
  detail?: string;
  title: string;
}) {
  const { styles } = useStyles();
  return (
    <View style={styles.detailSection}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {detail ? (
          <Text numberOfLines={2} style={styles.sectionDetail}>
            {detail}
          </Text>
        ) : null}
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function SectionDivider() {
  const { styles } = useStyles();
  return <View style={styles.sectionDivider} />;
}

function uniqueDisplayItems(items: string[]): string[] {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}

function relationshipSummaryFor(contact: ContactDetailSummary, t: ReturnType<typeof useOrbitLocale>["t"]): string {
  const identity = contact.organization && contact.role
    ? `${contact.organization} · ${contact.role}`
    : contact.organization || contact.role || contact.name;
  const location = contact.location ? t("contacts.relationshipLocation", { location: t.literal(contact.location) }) : "";

  return t("contacts.relationshipSummary", { identity: t.literal(identity), location, status: contact.status });
}

function relationshipExchangeFor(contact: ContactDetailSummary): {
  offering: string[];
  seeking: string[];
} {
  const structuredMatch =
    /(?:本次关注|正在寻找)[「“"]([^」”"]+)[」”"].*?可提供[「“"]([^」”"]+)[」”"]/u.exec(
      contact.relationship
    );

  if (structuredMatch?.[1] && structuredMatch[2]) {
    return {
      offering: [structuredMatch[2].trim()],
      seeking: [structuredMatch[1].trim()]
    };
  }

  return {
    offering: uniqueDisplayItems(contact.publicOffering),
    seeking: uniqueDisplayItems([
      ...contact.publicSeeking,
      ...contact.publicPrompts
    ])
  };
}

function compactInteractionDate(value: string, language: "en" | "ja" | "zh"): string {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})/u.exec(value);

  if (!dateMatch) {
    return value;
  }

  const locale = language === "zh" ? "zh-CN" : language === "ja" ? "ja-JP" : "en-US";
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(Date.UTC(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3])))
  );
}

const avatarToneStyles = (colors: OrbitColors): Record<
  ContactAvatarTone,
  { backgroundColor: string; color: string }
> => ({
  amber: { backgroundColor: colors.amberSoft, color: colors.amber },
  emerald: { backgroundColor: colors.liveSoft, color: colors.live },
  rose: { backgroundColor: colors.roseSoft, color: colors.rose },
  sky: { backgroundColor: colors.skySoft, color: colors.sky },
  violet: { backgroundColor: colors.accentSofter, color: colors.accent }
});

function TagList({ items }: { items: string[] }) {
  const { styles } = useStyles();
  return (
    <View style={styles.tagsRow}>
      {items.map((label) => (
        <Text key={label} style={styles.tagText}>
          {label}
        </Text>
      ))}
    </View>
  );
}

function PromptList({ prompts }: { prompts: string[] }) {
  const { styles } = useStyles();
  return (
    <View style={styles.promptStack}>
      {prompts.map((prompt) => (
        <Text key={prompt} style={styles.promptText}>
          {prompt}
        </Text>
      ))}
    </View>
  );
}

function EvidenceList({ contact }: { contact: ContactDetailSummary }) {
  const { styles } = useStyles();
  const locale = useOrbitLocale();
  if (contact.evidenceExcerpts.length === 0) {
    return <Text style={styles.bodyText}>{locale.t("contacts.sourceEvidenceExists")}</Text>;
  }

  return (
    <View style={styles.promptStack}>
      {contact.evidenceExcerpts.map((excerpt) => (
        <Text key={excerpt} style={styles.bodyText}>
          {excerpt}
        </Text>
      ))}
    </View>
  );
}

function RelationshipValueCard({
  onRecompute,
  overrideData,
  pending,
  state
}: {
  onRecompute: () => void;
  overrideData: unknown | null;
  pending: boolean;
  state: ApiResourceState<unknown>;
}) {
  const { styles } = useStyles();
  const locale = useOrbitLocale();
  if (!overrideData && state.kind === "loading") {
    return (
      <View style={styles.relationshipValueContent}>
        <Text style={styles.sectionDetail}>{locale.t("contacts.valueReading")}</Text>
        <Text style={styles.bodyText}>{locale.t("contacts.valueReadingBody")}</Text>
        <RelationshipRecomputeButton onPress={onRecompute} pending={pending} />
      </View>
    );
  }

  if (!overrideData && (state.kind === "failure" || state.kind === "offline")) {
    return (
      <View style={styles.relationshipValueContent}>
        <Text style={styles.sectionDetail}>{locale.t("contacts.unavailable")}</Text>
        <Text style={styles.bodyText}>{locale.t("contacts.valueUnavailableBody")}</Text>
        <RelationshipRecomputeButton onPress={onRecompute} pending={pending} />
      </View>
    );
  }

  const sourceData =
    overrideData ?? (state.kind === "success" || state.kind === "empty" ? state.data : null);
  const view = relationshipValueToView(sourceData);

  if (view.kind !== "ready") {
    return (
      <View style={styles.relationshipValueContent}>
        <Text style={styles.bodyText}>{view.body}</Text>
        <RelationshipRecomputeButton onPress={onRecompute} pending={pending} />
      </View>
    );
  }

  return (
    <View style={styles.relationshipValueContent}>
      <View style={styles.relationshipHeaderRow}>
        <View style={styles.relationshipScoreBlock}>
          <Text style={styles.relationshipScore}>{view.scoreLabel}</Text>
          <Text style={styles.relationshipPriority}>{view.priorityLabel}</Text>
        </View>
        <Text style={styles.relationshipSafety}>{view.safetyText}</Text>
      </View>
      <Text style={styles.bodyText}>{view.summary}</Text>
      <RelationshipRecomputeButton onPress={onRecompute} pending={pending} />
    </View>
  );
}

function RelationshipRecomputeButton({
  onPress,
  pending
}: {
  onPress: () => void;
  pending: boolean;
}) {
  const { colors, styles } = useStyles();
  const locale = useOrbitLocale();
  return (
    <Pressable
      accessibilityRole="button"
      disabled={pending}
      onPress={onPress}
      style={({ pressed }) => [
        styles.relationshipRecomputeButton,
        pending ? styles.disabled : null,
        pressed ? styles.pressed : null
      ]}
    >
      <Ionicons color={colors.accent} name="refresh-outline" size={16} />
      <Text style={styles.relationshipRecomputeButtonText}>
        {pending ? locale.t("contacts.calculating") : locale.t("contacts.recalculate")}
      </Text>
    </Pressable>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  hidden: { display: "none" },
  cancelHeaderButton: { minHeight: 44, minWidth: 82, justifyContent: "center", alignItems: "flex-start" },
  cancelHeaderText: { color: colors.text3, fontFamily: detailFont, fontSize: 15, lineHeight: 22, fontWeight: "600" },
  editIdentity: { alignItems: "center", gap: 8, paddingTop: 4 },
  editAvatar: { width: 76, height: 76 },
  editReadOnlyHint: { color: colors.text3, fontFamily: detailFont, fontSize: 13, lineHeight: 20 },
  editForm: { gap: 18, paddingTop: 16 },
  editField: { flexGrow: 1, flexShrink: 1, flexBasis: "auto", minWidth: 0 },
  editColumn: { flexBasis: 0 },
  editColumns: { flexDirection: "row", gap: 16 },
  editLabel: { color: colors.text3, fontFamily: detailFont, fontSize: 12, lineHeight: 18, fontWeight: "700", letterSpacing: 0.48 },
  editReadOnlyValue: { minHeight: 44, justifyContent: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  editValueText: { color: colors.ink, fontFamily: detailFont, fontSize: 15, lineHeight: 22 },
  editNameLine: { borderBottomColor: colors.ink, borderBottomWidth: 1.5 },
  editNameText: { fontSize: 16, fontWeight: "600" },
  editIndustryButton: { minHeight: 44, paddingVertical: 10, borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  editChips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  editChip: { minHeight: 44, minWidth: 44, maxWidth: "100%", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 4 },
  editChipSelected: { backgroundColor: colors.ink, borderColor: colors.ink },
  editChipText: { color: colors.ink, fontFamily: detailFont, fontSize: 13, lineHeight: 20, flexShrink: 1 },
  editChipSelectedText: { color: colors.onAccent, fontWeight: "600" },
  editTagEntry: { flexDirection: "row", gap: 8, marginTop: 10 },
  editTagAdd: { borderStyle: "dashed" },
  editTagInput: { flex: 1, minWidth: 0 },
  editInput: { color: colors.ink, fontFamily: detailFont, fontSize: 15, lineHeight: 22, minHeight: 44, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  editSummary: { minHeight: 92 },
  editInteraction: { gap: 8, paddingTop: 18, borderTopWidth: 1, borderTopColor: colors.border2 },
  editHeaderButton: { minHeight: 44, minWidth: 64, justifyContent: "center", alignItems: "flex-end" },
  editHeaderText: { color: colors.accent, fontFamily: detailFont, fontSize: 15, lineHeight: 22, fontWeight: "600" },
  heroLocation: { color: colors.text3, fontFamily: detailFont, fontSize: 12, lineHeight: 18, marginTop: 2 },
  sourcePill: { color: colors.accent, fontSize: 11, lineHeight: 16, fontWeight: "700", borderColor: colors.accent, borderWidth: 1, borderRadius: 6, paddingVertical: 3, paddingHorizontal: 8 },
  basicRow: { flexDirection: "row", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border2 },
  basicLabel: { width: 72, color: colors.text3, fontFamily: detailFont, fontSize: 14, lineHeight: 20 },
  basicValue: { flex: 1, minWidth: 0, color: colors.ink, fontFamily: detailFont, fontSize: 14, lineHeight: 20, fontWeight: "500" },
  actionStack: { flexDirection: "column" },
  secondaryActionButton: { minHeight: 44, paddingHorizontal: 8, paddingVertical: 10, flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, borderRadius: 10, borderWidth: 1, borderColor: colors.ink, justifyContent: "center", alignItems: "center" },
  secondaryActionText: { color: colors.ink, fontFamily: detailFont, fontSize: 13, lineHeight: 20, fontWeight: "600", textAlign: "center" },
  bodyText: {
    color: colors.text,
    fontFamily: detailFont,
    fontSize: 14,
    lineHeight: 23
  },
  archiveButton: {
    ...createControlStyles(colors).secondaryButton,
    alignSelf: "flex-start",
    borderColor: colors.rose,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.xs,
    maxWidth: "100%"
  },
  archiveButtonText: {
    ...createControlStyles(colors).secondaryButtonText,
    color: colors.rose
  },
  contactHero: { marginBottom: 16 },
  contactHeroDetail: {
    color: colors.text3,
    fontFamily: detailFont,
    fontSize: 13,
    lineHeight: 19
  },
  contactHeroHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 16
  },
  contactHeroName: {
    color: colors.ink,
    fontFamily: detailFont,
    fontSize: 24,
    fontWeight: "900",
    lineHeight: 32
  },
  contactHeroRelationship: {
    ...textStyles.small,
    color: colors.text
  },
  contactHeroTitleBlock: {
    flex: 1,
    gap: 2,
    minWidth: 0
  },
  disabled: { opacity: 0.54 },
  errorText: {
    ...textStyles.small,
    color: colors.rose
  },
  feedbackText: {
    ...textStyles.small,
    color: colors.live,
    fontWeight: "600"
  },
  heroAvatar: {
    alignItems: "center",
    borderRadius: radius.pill,
    height: 72,
    justifyContent: "center",
    overflow: "hidden",
    width: 72,
    flexShrink: 0
  },
  heroAvatarImage: {
    height: "100%",
    width: "100%"
  },
  heroAvatarText: {
    color: "#FFFFFF",
    fontFamily: detailFont,
    fontSize: 26,
    fontWeight: "800",
    lineHeight: 34
  },
  heroMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 6
  },
  inputLabel: {
    ...textStyles.caption,
    color: colors.text3,
    fontWeight: "600"
  },
  industryOption: {
    ...createControlStyles(colors).chip,
    backgroundColor: "transparent",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md
  },
  industryOptionSelected: {
    backgroundColor: colors.accentSofter,
    borderColor: colors.accentSoft
  },
  industryOptionText: {
    ...textStyles.small,
    color: colors.text2,
    fontWeight: "600"
  },
  industryOptionTextSelected: { color: colors.accent },
  industryOptions: { gap: spacing.xs },
  industryPicker: { gap: spacing.sm },
  industryPickerButton: {
    alignItems: "center",
    backgroundColor: colors.surface2,
    borderColor: colors.border2,
    borderRadius: radius.control,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 50,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  industryPickerCopy: {
    flex: 1,
    gap: spacing.xxs
  },
  industryPickerLabel: {
    ...textStyles.caption,
    color: colors.text4,
    fontWeight: "600"
  },
  industryPickerValue: {
    ...textStyles.small,
    color: colors.ink,
    fontWeight: "600"
  },
  metadataColumn: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0
  },
  metadataInput: {
    ...createControlStyles(colors).input,
    minWidth: 0
  },
  metadataRow: {
    flexDirection: "row",
    gap: spacing.sm
  },
  metadataStack: { gap: spacing.sm },
  noteButton: {
    ...createControlStyles(colors).primaryButton,
    flexDirection: "row",
    gap: spacing.xs
  },
  noteButtonText: { ...createControlStyles(colors).primaryButtonText },
  noteInput: {
    ...createControlStyles(colors).input,
    minHeight: 92,
    textAlignVertical: "top"
  },
  pressed: { opacity: 0.72 },
  primaryHeroButton: {
    ...createControlStyles(colors).primaryButton,
    flexDirection: "row",
    gap: spacing.xs
  },
  primaryHeroButtonText: { ...createControlStyles(colors).primaryButtonText },
  promptStack: { gap: 8 },
  promptText: {
    ...textStyles.caption,
    backgroundColor: colors.liveSoft,
    borderRadius: 10,
    color: colors.live,
    fontWeight: "600",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  factorPoint: {
    ...textStyles.caption,
    color: colors.accent,
    fontWeight: "600"
  },
  relationshipFactorRow: {
    alignItems: "center",
    backgroundColor: colors.surface2,
    borderColor: colors.border2,
    borderRadius: radius.control,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  relationshipHeaderRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between"
  },
  relationshipPriority: {
    ...textStyles.caption,
    color: colors.accent,
    fontWeight: "600"
  },
  relationshipRecomputeButton: {
    ...createControlStyles(colors).secondaryButton,
    flexDirection: "row",
    gap: spacing.xs,
    maxWidth: "100%"
  },
  relationshipRecomputeButtonText: {
    ...createControlStyles(colors).secondaryButtonText,
    color: colors.accent
  },
  relationshipSafety: {
    ...textStyles.caption,
    color: colors.text3,
    flexShrink: 1,
    textAlign: "right"
  },
  relationshipScore: {
    ...textStyles.title,
    color: colors.ink,
    fontWeight: "600"
  },
  relationshipScoreBlock: { gap: 2 },
  relationshipSectionTitle: {
    ...textStyles.caption,
    color: colors.text3,
    fontWeight: "600"
  },
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6
  },
  statusButton: {
    ...createControlStyles(colors).secondaryButton,
    flexDirection: "row",
    gap: spacing.xs,
    maxWidth: "100%"
  },
  statusButtonText: {
    ...createControlStyles(colors).secondaryButtonText,
    color: colors.accent
  },
  scorePill: {
    ...textStyles.caption,
    backgroundColor: colors.accentSofter,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    color: colors.accent,
    fontWeight: "600",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  statusPill: {
    fontSize: 11,
    lineHeight: 16,
    backgroundColor: colors.ink,
    borderColor: colors.ink,
    borderRadius: 6,
    borderWidth: 1,
    color: colors.surface,
    fontWeight: "700",
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 3
  },
  tagText: {
    ...textStyles.caption,
    backgroundColor: colors.accentSofter,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    color: colors.accent,
    fontWeight: "600",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  activityIcon: {
    alignItems: "center",
    height: 28,
    justifyContent: "center",
    width: 28
  },
  activityRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md
  },
  activityText: {
    ...textStyles.small,
    color: colors.text,
    flex: 1,
    minWidth: 0
  },
  detailSection: { gap: 4 },
  disclosureContent: {
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.lg,
    paddingVertical: 20
  },
  disclosureCopy: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0
  },
  disclosureDetail: {
    ...textStyles.caption,
    color: colors.text3
  },
  disclosureHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 68,
    paddingVertical: 14
  },
  disclosureSurface: {
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth
  },
  disclosureTitle: {
    ...textStyles.listTitle,
    color: colors.ink
  },
  emptyText: {
    ...textStyles.small,
    color: colors.text3,
    flex: 1,
    minWidth: 0
  },
  exchangeLabel: {
    color: colors.text3,
    fontSize: 13,
    fontFamily: detailFont,
    lineHeight: 22,
    width: 64
  },
  exchangeRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 8
  },
  exchangeRows: { gap: 4 },
  exchangeValue: {
    color: colors.text,
    flex: 1,
    fontSize: 13,
    fontFamily: detailFont,
    lineHeight: 22,
    minWidth: 0
  },
  managementActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  nextStepCard: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 20
  },
  nextStepCopy: {
    flex: 1,
    gap: 6,
    minWidth: 0
  },
  nextStepEyebrow: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20
  },
  nextStepHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.md
  },
  nextStepText: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "600",
    lineHeight: 27,
    maxWidth: 242
  },
  overviewSurface: {
    gap: 16,
    paddingBottom: 16
  },
  primaryActionButton: {
    minHeight: 44, paddingHorizontal: 8, paddingVertical: 10, flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0,
    borderRadius: 10, backgroundColor: colors.accent, justifyContent: "center", alignItems: "center"
  },
  primaryActionButtonText: { fontFamily: detailFont, fontSize: 13, lineHeight: 20, fontWeight: "700", color: colors.onAccent, textAlign: "center" },
  relationshipValueContent: { gap: spacing.md },
  sectionBody: { gap: spacing.sm },
  sectionDetail: {
    ...textStyles.caption,
    color: colors.text3
  },
  sectionDivider: {
    backgroundColor: colors.border,
    height: StyleSheet.hairlineWidth,
    width: "100%"
  },
  sectionHeader: { gap: spacing.xs },
  sectionTitle: {
    ...textStyles.section,
    fontFamily: detailFont,
    color: colors.ink
  }
}));
