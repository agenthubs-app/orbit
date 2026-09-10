import { Ionicons } from "@expo/vector-icons";
import { type Href, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, AppState, Pressable, StyleSheet, Text, View } from "react-native";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { BatchImageError, loadSelectedBatchImage } from "../../api/batch-images";
import type { BusinessCardBatchDetailContract } from "../../api/contract/business-card-batch";
import { businessCardBatchFinishResponseSchema, businessCardBatchRetryResponseSchema, businessCardBatchSkipResponseSchema } from "../../api/schema/business-card-batch";
import type { ApiResult } from "../../api/types";
import { AppScreen } from "../../components/AppScreen";
import { BusinessCardBatchReviewForm, type BusinessCardReviewImage } from "../../components/BusinessCardBatchReviewForm";
import { createThemedStyles } from "../../design/theme";
import { spacing, typography } from "../../design/tokens";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { acceptedLegacyBatch, acceptedLegacyConfirmation, legacyBatchPath, legacyBatchPresentation, reconcileBusinessCardReviewDraft, type BusinessCardReviewDraft, type BusinessCardReviewFields } from "../../view-models/business-card-batch";

type Action = "confirm" | "skip" | "retry" | "finish";
type Item = BusinessCardBatchDetailContract["items"][number];
interface BatchState {
  detail: BusinessCardBatchDetailContract | null;
  selectedId: string | null;
  drafts: Record<string, BusinessCardReviewDraft>;
  authorized: boolean;
  loading: boolean;
  busy: Action | null;
  duplicate: { itemId: string; contactId: string; fields: BusinessCardReviewFields; version: string } | null;
  error: string | null;
  notice: string | null;
}
function emptyState(): BatchState { return { detail: null, selectedId: null, drafts: {}, authorized: false, loading: false, busy: null, duplicate: null, error: null, notice: null }; }
const statusLabels: Record<Item["status"], string> = { pending: "等待识别", processing: "正在识别", extracted: "待复核", failed: "识别失败", confirmed: "已收录", skipped: "已跳过" };

function BatchButton({ label, icon, disabled = false, selected = false, iconOnly = false, onPress }: { label: string; icon: keyof typeof Ionicons.glyphMap; disabled?: boolean; selected?: boolean; iconOnly?: boolean; onPress: () => void }) {
  const { colors, styles } = useStyles();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, selected }} disabled={disabled} onPress={onPress} style={[styles.button, selected && styles.selected, iconOnly && styles.iconButton, disabled && styles.disabled]}>
    <Ionicons name={icon} size={20} color={colors.accent} />{!iconOnly ? <Text style={styles.buttonText}>{label}</Text> : null}
  </Pressable>;
}

export function BusinessCardBatchScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const batchId = (Array.isArray(params.id) ? params.id[0] : params.id) ?? "";
  const auth = useOrbitAuthSession();
  const server = useOrbitApiBaseUrl();
  const client = useOrbitApiClient();
  const router = useRouter();
  const { styles } = useStyles();
  // Session subject scopes requests; the authenticated batch supplies its canonical owner.
  const actorId = auth.user?.id ?? "";
  const ready = auth.ready && server.ready && auth.signedIn && Boolean(actorId && batchId.trim());
  const [scope, setScope] = useState({ client, actorId, batchId, baseUrl: server.baseUrl, ready });
  const scopeRef = useRef(scope);
  const mounted = useRef(true);
  const operation = useRef(0);
  const lock = useRef(false);
  const transport = useRef<AbortController | null>(null);
  const imageTransport = useRef<AbortController | null>(null);
  const [state, setState] = useState<BatchState>(emptyState);
  const current = useRef(state);
  const [focused, setFocused] = useState(false);
  const [foreground, setForeground] = useState(AppState.currentState === "active");
  const activity = useRef({ focused: false, foreground });
  const active = focused && foreground;
  const [now, setNow] = useState(Date.now);
  const [imageAttempt, setImageAttempt] = useState(0);
  const [image, setImage] = useState<{ key: string; value: BusinessCardReviewImage } | null>(null);

  function update(patch: Partial<BatchState>) { current.current = { ...current.current, ...patch }; setState(current.current); }
  function invalidate() { operation.current++; lock.current = false; transport.current?.abort(); imageTransport.current?.abort(); }
  function isCurrent() { return mounted.current && scopeRef.current === scope && scope.ready && activity.current.focused && activity.current.foreground; }
  function expired(detail = current.current.detail) { return Boolean(detail && Date.parse(detail.batch.expiresAt) <= Date.now()); }
  function terminal(detail = current.current.detail) { return detail?.batch.status === "completed" || detail?.batch.status === "cancelled"; }
  const batchExpired = expired();

  useFocusEffect(useCallback(() => {
    activity.current.focused = true; setFocused(true);
    return () => { activity.current.focused = false; setFocused(false); invalidate(); };
  }, []));
  useEffect(() => {
    mounted.current = true;
    const subscription = AppState.addEventListener("change", value => {
      activity.current.foreground = value === "active";
      if (value !== "active") invalidate();
      setForeground(value === "active");
    });
    return () => { mounted.current = false; invalidate(); subscription.remove(); };
  }, []);
  useEffect(() => {
    if (scope.ready && active) void load();
    else update({ authorized: false, loading: false, busy: null, duplicate: null });
    return () => { invalidate(); };
  }, [scope, active]);
  useEffect(() => {
    if (!scope.ready || !active || state.detail?.batch.status !== "processing" || expired()) return;
    const timer = setInterval(() => {
      setNow(Date.now());
      if (expired()) { clearInterval(timer); invalidate(); update({ authorized: false, busy: null, loading: false, duplicate: null, error: "批次已过期，无法继续操作。" }); return; }
      void load();
    }, 3000);
    return () => clearInterval(timer);
  }, [scope, active, state.detail?.batch.status, state.detail?.batch.expiresAt, batchExpired]);
  useEffect(() => {
    if (!state.detail || terminal(state.detail) || expired()) return;
    const timer = setTimeout(() => { setNow(Date.now()); if (expired()) { invalidate(); update({ authorized: false, busy: null, loading: false, duplicate: null, error: "批次已过期，无法继续操作。" }); } }, Math.min(2147483647, Date.parse(state.detail.batch.expiresAt) - Date.now()));
    return () => clearTimeout(timer);
  }, [state.detail?.batch.expiresAt, state.detail?.batch.status]);

  const selected = state.detail?.items.find(item => item.id === state.selectedId);
  const imageKey = scopeRef.current === scope && ready && active && !expired() && !terminal(state.detail) && selected?.imagePath && !["confirmed", "skipped"].includes(selected.status)
    ? JSON.stringify([scope.baseUrl, scope.actorId, scope.batchId, selected.id, selected.imagePath, selected.imageDigest, imageAttempt]) : "";
  useEffect(() => {
    setImage(null);
    if (!imageKey || !selected) return;
    const controller = new AbortController(); imageTransport.current = controller;
    const valid = () => !controller.signal.aborted && isCurrent() && current.current.selectedId === selected.id;
    setImage({ key: imageKey, value: { status: "loading" } });
    void loadSelectedBatchImage(client, legacyBatchPath(batchId, selected.id, "image"), { signal: controller.signal }).then(result => {
      if (valid()) setImage({ key: imageKey, value: { status: "available", uri: result.uri } });
    }).catch(error => {
      if (valid()) setImage({ key: imageKey, value: { status: "unavailable", message: error instanceof BatchImageError ? error.message : "暂时无法读取名片图片。" } });
    });
    return () => { controller.abort(); };
  }, [scope, imageKey]);

  // Invalidate during render so even retained callbacks cannot cross identities
  // before effects run, including account changes with the same memoized client.
  if (scope.client !== client || scope.actorId !== actorId || scope.batchId !== batchId || scope.baseUrl !== server.baseUrl || scope.ready !== ready) {
    const next = { client, actorId, batchId, baseUrl: server.baseUrl, ready };
    scopeRef.current = next; invalidate(); setScope(next); current.current = emptyState(); setState(current.current); setImage(null);
    return null;
  }

  function failureMessage(result: ApiResult<unknown>): string {
    if (result.status === 409) return "批次状态已变化，正在重新读取；修改已保留。";
    if (result.status === 403) return "无权访问此批次。";
    if (result.status === 404) return "找不到此批次，可能已被移除。";
    return result.success ? "服务器返回的数据无法确认，请刷新批次。" : result.error.message;
  }

  async function load(reloadItemId?: string) {
    if (!isCurrent() || lock.current) return;
    const consentedDraft = reloadItemId !== undefined && Object.hasOwn(current.current.drafts, reloadItemId) ? current.current.drafts[reloadItemId] : undefined;
    const id = ++operation.current;
    const controller = new AbortController(); transport.current = controller;
    const valid = () => isCurrent() && operation.current === id && !controller.signal.aborted;
    lock.current = true; update({ loading: true, authorized: false, busy: null, duplicate: null });
    try {
      // Signal-bearing reads bypass client coalescing across empty-cookie actors.
      const result = await client.get<unknown>(legacyBatchPath(batchId), { signal: controller.signal });
      if (!valid()) return;
      const detail = acceptedLegacyBatch(result, batchId, current.current.detail?.batch.actorId ?? null);
      const previous = current.current;
      const regressed = detail && previous.detail && (terminal(previous.detail) && detail.batch.status !== previous.detail.batch.status || previous.detail.items.some(item => ["confirmed", "skipped"].includes(item.status) && detail.items.find(next => next.id === item.id)?.status !== item.status));
      if (!detail || regressed) { update({ error: failureMessage(result) }); return; }
      if (terminal(detail)) {
        imageTransport.current?.abort(); setImage(null);
        update({ detail, selectedId: null, drafts: {}, duplicate: null, authorized: false, error: null });
        return;
      }
      const drafts: Record<string, BusinessCardReviewDraft> = Object.create(null);
      for (const item of detail.items) {
        if (["confirmed", "skipped"].includes(item.status)) continue;
        const previousDraft = Object.hasOwn(previous.drafts, item.id) ? previous.drafts[item.id] : undefined;
        const draft = reconcileBusinessCardReviewDraft(item.extraction, previousDraft, reloadItemId === item.id && consentedDraft !== undefined && previousDraft === consentedDraft);
        if (draft) drafts[item.id] = draft;
      }
      update({ detail, selectedId: legacyBatchPresentation(detail, previous.selectedId).selectedId, drafts, authorized: !expired(detail), error: expired(detail) ? "批次已过期，无法继续操作。" : null });
    } catch {
      if (valid()) update({ error: "暂时无法读取批次，修改已保留，请刷新重试。" });
    } finally {
      if (valid()) { lock.current = false; update({ loading: false }); }
    }
  }

  function canAct(action: Action) {
    const s = current.current;
    if (!isCurrent() || lock.current || !s.authorized || !s.detail || expired() || terminal(s.detail)) return false;
    if (action === "finish") return legacyBatchPresentation(s.detail, s.selectedId).canFinish;
    const item = s.detail.items.find(item => item.id === s.selectedId);
    if (!item) return false;
    if (action === "confirm") return item.status === "extracted" && Boolean(item.extraction && s.drafts[item.id]);
    return action === "retry" ? item.status === "failed" : ["extracted", "failed"].includes(item.status);
  }

  async function mutate(action: Action, allowDuplicate = false) {
    if (!canAct(action)) return;
    const s = current.current;
    const item = s.detail!.items.find(item => item.id === s.selectedId);
    const fields = item ? s.drafts[item.id]?.fields : undefined;
    if (action === "confirm" && (allowDuplicate ? !s.duplicate || s.duplicate.fields !== fields || s.duplicate.itemId !== item?.id || s.duplicate.version !== item.updatedAt : Boolean(s.duplicate))) return;
    const id = ++operation.current;
    const controller = new AbortController(); transport.current = controller;
    const valid = () => isCurrent() && operation.current === id && !controller.signal.aborted;
    lock.current = true; update({ busy: action, error: null, notice: null });
    let refresh = false;
    try {
      const path = legacyBatchPath(batchId, action === "finish" ? undefined : item!.id, action);
      const result = await client.post<unknown>(path, { body: action === "confirm" ? { ...fields, allowDuplicate } : {}, signal: controller.signal });
      if (!valid()) return;
      const confirmation = action === "confirm" ? acceptedLegacyConfirmation(result) : null;
      const schema = action === "retry" ? businessCardBatchRetryResponseSchema : action === "skip" ? businessCardBatchSkipResponseSchema : businessCardBatchFinishResponseSchema;
      const accepted = action === "confirm" ? confirmation !== null : result.success && result.status >= 200 && result.status < 300 && schema.safeParse(result.data).success;
      if (!accepted) { update({ authorized: false, duplicate: null, error: failureMessage(result) }); refresh = result.status === 409; return; }
      if (confirmation?.state === "duplicate_review") {
        update({ duplicate: { itemId: item!.id, contactId: confirmation.duplicateContactId, fields: fields!, version: item!.updatedAt } }); return;
      }
      const detail: BusinessCardBatchDetailContract = {
        batch: { ...s.detail!.batch, status: action === "finish" ? "completed" : action === "retry" ? "processing" : s.detail!.batch.status },
        items: s.detail!.items.map(previous => action === "finish" ? { ...previous, imagePath: null } : previous.id !== item!.id ? previous : {
          ...previous, status: action === "retry" ? "pending" : action === "skip" ? "skipped" : "confirmed",
          imagePath: action === "retry" ? previous.imagePath : null,
          confirmedContactId: confirmation?.state === "created" ? confirmation.contactId : previous.confirmedContactId,
        }),
      };
      const drafts = { ...s.drafts };
      if (item && (action === "confirm" || action === "skip")) delete drafts[item.id];
      update({ detail, drafts, selectedId: legacyBatchPresentation(detail, s.selectedId).selectedId, duplicate: null, authorized: false, notice: action === "finish" ? "批次已完成" : action === "confirm" ? "联系人已收录。" : action === "skip" ? "名片已跳过。" : "已提交重试。" });
      refresh = true;
    } catch {
      if (valid()) update({ authorized: false, duplicate: null, error: "暂时无法连接服务，修改已保留，请刷新后重试。" });
    } finally {
      if (valid()) { lock.current = false; update({ busy: null }); if (refresh) void load(); }
    }
  }

  function confirmCommand(command: "override" | "skip" | "finish" | "reload") {
    if (!isCurrent() || lock.current || (command !== "reload" && !canAct(command === "override" ? "confirm" : command))) return;
    const intended = current.current;
    const intendedOperation = operation.current;
    const item = intended.detail?.items.find(item => item.id === intended.selectedId);
    if (command === "override" && !intended.duplicate) return;
    let used = false;
    const run = () => {
      const latest = current.current;
      if (used || !isCurrent() || lock.current || operation.current !== intendedOperation || latest.selectedId !== intended.selectedId || latest.detail !== intended.detail || latest.drafts[intended.selectedId ?? ""] !== intended.drafts[intended.selectedId ?? ""] || latest.duplicate !== intended.duplicate) return;
      used = true;
      if (command === "reload") void load(item?.id); else void mutate(command === "override" ? "confirm" : command, command === "override");
    };
    Alert.alert(command === "override" ? "仍然收录" : command === "skip" ? "跳过名片" : command === "finish" ? "完成批次" : "重新载入识别结果", command === "override" ? "这可能创建重复联系人。确认仍要收录？" : command === "skip" ? "确认跳过此名片？图片将被移除。" : command === "finish" ? "确认结束此批次？识别失败的名片不会被收录，剩余图片将被移除。" : "重新载入会丢弃此名片尚未保存的修改。确认继续？", [{ text: "取消", style: "cancel" }, { text: "确认", onPress: run }]);
  }

  const detail = state.detail;
  const draft = selected ? state.drafts[selected.id] : undefined;
  const imageValue: BusinessCardReviewImage = imageKey ? image?.key === imageKey ? image.value : { status: "loading" } : { status: "none" };
  const disabled = !active || !ready || Boolean(state.busy) || expired();
  function formIsCurrent() { return isCurrent() && current.current.selectedId === selected?.id && current.current.detail === detail && current.current.drafts[selected?.id ?? ""] === draft; }
  return <AppScreen eyebrow="人脉" title="批量名片复核">
    <View style={styles.row}>
      <BatchButton label="刷新批次" icon="refresh-outline" iconOnly disabled={!ready || !active || state.loading || Boolean(state.busy)} onPress={() => void load()} />
      <BatchButton label="返回人脉" icon="people-outline" onPress={() => router.push("/contacts" as Href)} />
    </View>
    {!ready ? <Text style={styles.caption}>{batchId ? "正在确认账号与服务状态..." : "缺少批次编号。"}</Text> : null}
    {state.loading ? <Text accessibilityLiveRegion="polite" style={styles.caption}>正在读取批次...</Text> : null}
    {state.error ? <Text accessibilityRole="alert" style={styles.error}>{state.error}</Text> : null}
    {state.notice ? <Text accessibilityLiveRegion="polite" style={styles.caption}>{state.notice}</Text> : null}
    {detail ? <>
      <Text style={styles.heading}>{detail.batch.status === "cancelled" ? "已取消" : detail.batch.status === "completed" ? "已完成" : detail.batch.status === "processing" ? "正在处理名片" : "待复核批次"}</Text>
      <Text style={styles.caption}>共 {detail.items.length} 张 · 已处理 {detail.items.filter(item => !["pending", "processing"].includes(item.status)).length} 张 · 已收录 {detail.items.filter(item => item.status === "confirmed").length} 张 · 失败 {detail.items.filter(item => item.status === "failed").length} 张 · 已跳过 {detail.items.filter(item => item.status === "skipped").length} 张</Text>
      {detail.batch.status === "processing" && now - Date.parse(detail.batch.updatedAt) >= 60000 ? <Text style={styles.caption}>处理时间较长。请稍后刷新；识别失败的名片可单独重试。</Text> : null}
      <View style={styles.list}>
        {detail.items.map(item => <View key={item.id} style={styles.item}>
          <Text style={styles.caption}>{item.seq}. {item.sourceFileName}{item.sourcePage ? ` / 第 ${item.sourcePage} 页` : ""} · {statusLabels[item.status]}</Text>
          {item.status === "confirmed" && item.confirmedContactId ? <BatchButton label={`查看联系人 ${item.seq}`} icon="person-outline" onPress={() => { if (isCurrent()) router.push(`/contacts/${encodeURIComponent(item.confirmedContactId!)}` as Href); }} /> : null}
          {!["confirmed", "skipped"].includes(item.status) && !terminal(detail) ? <BatchButton label={`选择名片 ${item.seq}`} icon="document-outline" selected={item.id === state.selectedId} disabled={disabled || Boolean(state.busy)} onPress={() => {
            if (!isCurrent() || current.current.busy || current.current.detail !== detail || current.current.selectedId === item.id) return;
            update({ selectedId: item.id, duplicate: null }); imageTransport.current?.abort();
          }} /> : null}
        </View>)}
      </View>
      {selected && !terminal(detail) ? <>
        <BusinessCardBatchReviewForm fields={draft?.fields ?? null} image={imageValue} reviewIssues={selected.reviewIssues} statusLabel={statusLabels[selected.status]} disabled={disabled} canConfirm={canAct("confirm")} canSkip={canAct("skip")} canRetry={canAct("retry")} duplicateContactId={state.duplicate?.contactId ?? null}
          onImageError={() => {
            setImage(latest => {
              if (!isCurrent() || expired() || current.current.selectedId !== selected.id || imageTransport.current?.signal.aborted || !latest || latest !== image || latest.key !== imageKey || latest.value.status !== "available") return latest;
              return { key: imageKey, value: { status: "unavailable", message: "名片图片无法显示，请重新加载。" } };
            });
          }}
          onChange={fields => {
            if (!isCurrent() || current.current.busy || expired() || current.current.selectedId !== selected.id || current.current.drafts[selected.id] !== draft) return;
            update({ drafts: { ...current.current.drafts, [selected.id]: { fields, dirty: true } }, duplicate: null });
          }}
          onConfirm={() => { if (formIsCurrent()) void mutate("confirm"); }}
          onSkip={() => { if (formIsCurrent()) confirmCommand("skip"); }} onRetry={() => { if (formIsCurrent()) void mutate("retry"); }} onOverride={() => { if (formIsCurrent()) confirmCommand("override"); }}
          onOpenDuplicate={() => { if (isCurrent() && current.current.duplicate === state.duplicate && state.duplicate) router.push(`/contacts/${encodeURIComponent(state.duplicate.contactId)}` as Href); }} />
        <View style={styles.row}>
          {draft ? <BatchButton label="重新载入识别结果" icon="refresh-outline" disabled={disabled || state.loading || selected.extraction === undefined} onPress={() => confirmCommand("reload")} /> : null}
          {imageValue.status === "unavailable" ? <BatchButton label="重载图片" icon="image-outline" disabled={disabled} onPress={() => { if (isCurrent()) setImageAttempt(value => value + 1); }} /> : null}
        </View>
      </> : null}
      {!terminal(detail) ? <BatchButton label="完成批次" icon="checkmark-done-outline" disabled={!canAct("finish")} onPress={() => confirmCommand("finish")} /> : null}
    </> : null}
  </AppScreen>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm },
  list: { gap: spacing.sm },
  item: { borderBottomWidth: 1, borderColor: colors.border, paddingBottom: spacing.sm, gap: spacing.xs },
  heading: { color: colors.ink, fontSize: typography.body, fontWeight: "700" },
  caption: { color: colors.text3, fontSize: typography.small, lineHeight: 20 },
  error: { color: colors.rose, fontSize: typography.small, lineHeight: 20 },
  button: { minHeight: 44, maxWidth: "100%", borderRadius: 6, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm },
  buttonText: { color: colors.ink, fontSize: typography.small, lineHeight: 20, fontWeight: "700", flexShrink: 1 },
  iconButton: { width: 44, height: 44, paddingHorizontal: 0, paddingVertical: 0 },
  selected: { borderColor: colors.accent, backgroundColor: colors.surface2 },
  disabled: { opacity: 0.45 },
}));
