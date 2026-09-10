import * as ImagePicker from "expo-image-picker";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Alert, Text, View } from "react-native";
import { loadSelectedBatchImage, prepareBatchImage, prepareBatchImages, readPreparedBatchImage, type PreparedBatchImage } from "../../api/batch-images";
import type { IngestBatchDetailContract, IngestItemContract } from "../../api/contract/business-card-batch";
import { ingestBatchActionResponseSchema, ingestFinalizeResponseSchema, ingestItemActionResponseSchema } from "../../api/schema/business-card-batch";
import { AppScreen } from "../../components/AppScreen";
import { BusinessCardBatchReviewForm, type BusinessCardReviewImage } from "../../components/BusinessCardBatchReviewForm";
import { businessCardReviewFields, reconcileBusinessCardReviewDraft, type BusinessCardReviewDraft } from "../../view-models/business-card-batch";
import { acceptedIngestDetail, acceptedIngestReview, canFinalizeIngest, canReviewIngest, ingestBatchPath, ingestExpired, ingestItemPath, itemReplacePath, ingestTerminal, isHttpSuccess, uploadPendingPass, type IngestReviewAction } from "../../view-models/business-card-ingest";
import { clearPendingFiles, pendingFiles, rememberPendingFiles } from "./business-card-pending-files";
import { batchPickerOptions, batchStatusLabel, IngestButton, useIngestScope, useIngestStyles, type IngestSession } from "./BusinessCardIngestStartScreen";

type Action = "exclude" | "cancel" | "finalize";
interface IngestState {
  detail: IngestBatchDetailContract | null;
  authorized: boolean;
  busy: boolean;
  loading: boolean;
  error: string | null;
  notice: string | null;
  failures: Record<string, string>;
  unmatched: string[];
  selectedId: string | null;
  reviewInvalidated: boolean;
  drafts: Map<string, BusinessCardReviewDraft>;
  duplicate: { item: IngestItemContract; draft: BusinessCardReviewDraft; contactId: string } | null;
}
const emptyState = (): IngestState => ({ detail: null, authorized: false, busy: false, loading: false, error: null, notice: null, failures: {}, unmatched: [], selectedId: null, reviewInvalidated: false, drafts: new Map(), duplicate: null });

export function BusinessCardIngestScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = (Array.isArray(params.id) ? params.id[0] : params.id) ?? "";
  const session = useIngestScope(id);
  return <IngestContent key={session.scope.key} session={session} />;
}
function IngestContent({ session }: { session: IngestSession }) {
  const { scope, active, isCurrent, capture } = session;
  const { styles } = useIngestStyles();
  const router = useRouter();
  const [state, setState] = useState<IngestState>(emptyState);
  const current = useRef(state);
  const lock = useRef(false);
  const [image, setImage] = useState<BusinessCardReviewImage>({ status: "none" });
  const [imageRetry, setImageRetry] = useState(0);
  const imageAttempt = useRef<object | null>(null);
  const imageOwner = useRef<string | null>(null);
  const selectionEpoch = useRef(0);
  const fileScope = { identity: scope.identity, batchId: scope.batchId };
  function update(patch: Partial<IngestState>) {
    if (patch.detail && ingestTerminal(patch.detail)) {
      clearPendingFiles(fileScope); imageAttempt.current = null; setImage({ status: "none" });
      patch = { ...patch, drafts: new Map(), selectedId: null, duplicate: null, authorized: false };
    }
    if (patch.selectedId !== undefined && patch.selectedId !== current.current.selectedId) selectionEpoch.current++;
    current.current = { ...current.current, ...patch }; setState(current.current);
  }
  function expire() {
    clearPendingFiles(fileScope); session.invalidate(); lock.current = false;
    clearReview();
    update({ authorized: false, busy: false, loading: false, error: "批次已过期，无法继续操作。" });
  }
  useEffect(() => {
    if (session.hasPicker()) return;
    if (active && scope.batchId.trim()) void load();
    else { lock.current = false; update({ authorized: false, busy: false, loading: false }); }
  }, [scope, active, session.focused]);
  useEffect(() => {
    const detail = state.detail;
    if (!active || !detail || ingestTerminal(detail) || !["collecting", "processing"].includes(detail.batch.status)) return;
    const timer = setInterval(() => {
      if (ingestExpired(detail)) { clearInterval(timer); expire(); } else void load();
    }, 3000);
    return () => clearInterval(timer);
  }, [scope, active, state.detail]);
  useEffect(() => {
    const detail = state.detail;
    if (!detail || ingestTerminal(detail)) return;
    const timer = setTimeout(() => { if (ingestExpired(detail)) expire(); }, Math.min(2147483647, Math.max(0, Date.parse(detail.batch.expiresAt) - Date.now())));
    return () => clearTimeout(timer);
  }, [scope, state.detail]);

  async function load(reload?: { id: string; draft: BusinessCardReviewDraft | undefined; selectionEpoch: number }) {
    if (!isCurrent() || !scope.batchId.trim() || lock.current) return;
    lock.current = true; update({ loading: true, authorized: false });
    const ticket = capture();
    try {
      const response = await scope.client.get<unknown>(ingestBatchPath(scope.batchId), { signal: ticket.signal });
      if (!ticket.valid()) return;
      const previous = current.current.detail;
      const detail = acceptedIngestDetail(response, scope.batchId, previous?.batch.actorId ?? null);
      const regressed = detail && previous && (detail.batch.version < previous.batch.version || detail.batch.reviewGeneration < previous.batch.reviewGeneration || detail.batch.idempotencyKey !== previous.batch.idempotencyKey || detail.batch.manifestFingerprint !== previous.batch.manifestFingerprint || detail.items.length !== previous.items.length || previous.items.some(i => {
        const next = detail.items.find(n => n.id === i.id);
        return !next || next.version < i.version || next.seq !== i.seq || next.clientDigest !== i.clientDigest || next.rawSize !== i.rawSize || next.rawMimeType !== i.rawMimeType || next.sourceFileName !== i.sourceFileName || (["excluded", "confirmed", "skipped"].includes(i.status) && next.status !== i.status);
      }) || (["completed", "cancelled", "expired"].includes(previous.batch.status) && detail.batch.status !== previous.batch.status));
      if (!detail || regressed) {
        observeUnavailable(response.status, true);
        update({ error: "批次读取结果无法确认，请刷新重试。" }); return;
      }
      pendingFiles(fileScope, detail);
      // Prune only resolved upload failures. A successful poll does not hide a failed file.
      const failures = Object.fromEntries(Object.entries(current.current.failures).filter(([id]) => detail.items.some(i => i.id === id && i.status === "awaiting_upload")));
      if (ingestTerminal(detail)) clearPendingFiles(fileScope);
      const drafts = new Map<string, BusinessCardReviewDraft>();
      for (const item of detail.items) {
        if (!["extracted", "terminal_failed", "queued", "processing"].includes(item.status)) continue;
        const before = current.current.drafts.get(item.id);
        const reset = reload?.id === item.id && reload.draft === before && current.current.selectedId === item.id && reload.selectionEpoch === selectionEpoch.current;
        const draft = reconcileBusinessCardReviewDraft(item.extraction, before, reset) ?? (item.status === "terminal_failed" ? { fields: businessCardReviewFields(null), dirty: false } : null);
        if (draft) drafts.set(item.id, draft);
      }
      const candidates = detail.items.filter(i => ["extracted", "terminal_failed"].includes(i.status));
      const selectedId = candidates.find(i => i.id === current.current.selectedId)?.id ?? candidates[0]?.id ?? null;
      update({ detail, failures, drafts, selectedId, reviewInvalidated: false, duplicate: null, authorized: !ingestTerminal(detail), ...(ingestExpired(detail) ? { error: "批次已过期，无法继续操作。" } : {}) });
    } catch { if (ticket.valid()) update({ error: "暂时无法读取批次，请刷新重试。" }); }
    finally { if (ticket.valid()) { lock.current = false; update({ loading: false }); } ticket.release(); }
  }
  function canCollect() {
    const s = current.current;
    return isCurrent() && !lock.current && s.authorized && s.detail && !ingestTerminal(s.detail) && s.detail.batch.status === "collecting";
  }
  async function reselect() {
    if (!canCollect()) return;
    const detail = current.current.detail!;
    const ticket = session.capturePicker();
    if (!ticket) return;
    lock.current = true; update({ busy: true, error: null, notice: null });
    const valid = () => ticket.valid() && current.current.detail === detail && !ingestTerminal(detail);
    try {
      const selection = await ImagePicker.launchImageLibraryAsync(batchPickerOptions);
      if (!await ticket.waitForForeground() || !valid() || selection.canceled) return;
      const files = await prepareBatchImages(selection.assets, { signal: ticket.signal });
      if (!valid()) return;
      const unmatched = rememberPendingFiles(fileScope, detail, files);
      update({ unmatched: unmatched.map(f => f.fileName) });
    } catch (error) { if (await ticket.waitForForeground() && valid()) update({ error: error instanceof Error ? error.message : "无法读取所选名片。" }); }
    finally { if (ticket.owned()) { lock.current = false; update({ busy: false }); } ticket.release(); }
  }
  async function upload() {
    if (!canCollect()) return;
    const detail = current.current.detail!;
    const files = pendingFiles(fileScope, detail);
    if (!files.size) return;
    lock.current = true; update({ busy: true, error: null, notice: null });
    const ticket = capture();
    try {
      const result = await uploadPendingPass({
        client: scope.client, detail, files, signal: ticket.signal,
        isCurrent: item => ticket.valid() && current.current.detail === detail && current.current.detail.items.some(i => i.id === item.id && i.version === item.version && i.status === "awaiting_upload"),
        onUnavailable: status => { if (ticket.valid()) observeUnavailable(status); },
      });
      if (!ticket.valid()) return;
      if (result.gone) clearPendingFiles(fileScope);
      const uploaded = new Map(result.uploaded.map(item => [item.id, item]));
      update({
        detail: { ...detail, items: detail.items.map(item => uploaded.get(item.id) ?? item) },
        failures: Object.fromEntries(result.failed.map(f => [f.itemId, f.message])),
        error: result.recovery ? "批次状态已变化，正在重新读取。" : null,
      });
    } finally {
      if (ticket.valid()) { lock.current = false; update({ busy: false, authorized: false }); await load(); }
      ticket.release();
    }
  }
  function canAct(action: Action, itemId?: string) {
    const s = current.current;
    if (!isCurrent() || lock.current || !s.authorized || !s.detail || ingestTerminal(s.detail)) return false;
    if (action === "cancel") return ["collecting", "processing", "ready_for_review"].includes(s.detail.batch.status);
    if (action === "finalize") return canFinalizeIngest(s.detail);
    return s.detail.batch.status === "collecting" && s.detail.items.some(i => i.id === itemId && ["awaiting_upload", "uploaded"].includes(i.status));
  }
  function ask(action: Action, itemId?: string) {
    if (!canAct(action, itemId)) return;
    const snapshot = current.current.detail!;
    const title = action === "exclude" ? "排除此名片？" : action === "cancel" ? "取消此批次？" : "开始识别这些名片？";
    Alert.alert(title, action === "finalize" ? "提交后将开始识别。" : "此操作不能撤销。", [
      { text: "返回", style: "cancel" },
      { text: "确认", style: action === "finalize" ? "default" : "destructive", onPress: () => {
        if (current.current.detail === snapshot && canAct(action, itemId)) void mutate(action, snapshot, itemId);
      } },
    ]);
  }
  async function mutate(action: Action, detail: IngestBatchDetailContract, itemId?: string) {
    if (current.current.detail !== detail || !canAct(action, itemId)) return;
    lock.current = true; update({ busy: true, error: null, notice: null });
    const ticket = capture();
    try {
      const path = action === "exclude" ? ingestItemPath(scope.batchId, itemId!) + "/exclude" : ingestBatchPath(scope.batchId) + "/" + action;
      const response = await scope.client.post<unknown>(path, { body: {}, signal: ticket.signal });
      if (!ticket.valid()) return;
      if (observeUnavailable(response.status)) return;
      if (current.current.detail !== detail || ingestExpired(detail)) return;
      let accepted = false;
      if (isHttpSuccess(response)) {
        if (action === "exclude") {
          const parsed = ingestItemActionResponseSchema.safeParse(response.data);
          const old = detail.items.find(i => i.id === itemId)!;
          const item = parsed.success ? parsed.data.item : null;
          accepted = Boolean(item && item.id === itemId && item.batchId === detail.batch.id && item.status === "excluded" && item.version >= old.version && item.seq === old.seq && item.clientDigest === old.clientDigest && item.rawSize === old.rawSize && item.rawMimeType === old.rawMimeType);
          if (accepted && item) update({ detail: { ...detail, items: detail.items.map(i => i.id === itemId ? item : i) } });
        } else {
          const parsed = (action === "finalize" ? ingestFinalizeResponseSchema : ingestBatchActionResponseSchema).safeParse(response.data);
          const batch = parsed.success ? parsed.data.batch : null;
          accepted = Boolean(batch && batch.id === detail.batch.id && batch.actorId === detail.batch.actorId && batch.expectedItems === detail.batch.expectedItems && batch.idempotencyKey === detail.batch.idempotencyKey && batch.manifestFingerprint === detail.batch.manifestFingerprint && batch.version >= detail.batch.version && (action === "cancel" ? batch.status === "cancelled" : ["processing", "ready_for_review", "completed"].includes(batch.status) && batch.finalizedAt));
          if (accepted && batch) update({ detail: { ...detail, batch } });
        }
      }
      if (!accepted) {
        update({ error: response.status === 409 ? "批次状态已变化，正在重新读取。" : "操作结果无法确认，请刷新后重试。" });
      } else {
        pendingFiles(fileScope, current.current.detail!);
        update({ notice: action === "exclude" ? "已排除名片。" : action === "cancel" ? "批次已取消。" : "已提交识别。" });
      }
    } catch { if (ticket.valid()) update({ error: "操作结果无法确认，请刷新后重试。" }); }
    finally {
      if (ticket.valid()) { lock.current = false; update({ busy: false, authorized: false }); await load(); }
      ticket.release();
    }
  }
  function observeUnavailable(status: number, wholeBatch = false) {
    if (status !== 404 && status !== 410) return false;
    const definitive = wholeBatch || status === 410;
    if (definitive) clearPendingFiles(fileScope);
    clearReview(!definitive);
    update({ error: "批次状态无法确认，请刷新重试。" });
    return true;
  }
  function clearReview(preserveDrafts = false) {
    imageAttempt.current = null; setImage({ status: "none" });
    // Ambiguous item 404 retains data, never authority; only accepted detail releases it.
    update({ ...(preserveDrafts ? {} : { drafts: new Map() }), selectedId: null, duplicate: null, reviewInvalidated: true, authorized: false });
  }
  function reviewSnapshot(item: IngestItemContract) {
    const detail = current.current.detail!;
    const draft = current.current.drafts.get(item.id);
    const selectedId = current.current.selectedId;
    const epoch = selectionEpoch.current;
    return { detail, item, draft, valid: () => isCurrent() && selectionEpoch.current === epoch && current.current.detail === detail && current.current.selectedId === selectedId && current.current.drafts.get(item.id) === draft && !ingestTerminal(detail) };
  }
  function reviewAllowed(item: IngestItemContract, action: IngestReviewAction) {
    const s = current.current;
    return isCurrent() && !lock.current && s.authorized && s.detail && s.detail.items.includes(item) && canReviewIngest(s.detail, item, action);
  }
  function askReview(item: IngestItemContract, action: IngestReviewAction, override = false) {
    if (!reviewAllowed(item, action)) return;
    const snapshot = reviewSnapshot(item);
    const duplicate = current.current.duplicate;
    if (override && (!duplicate || duplicate.item !== item || duplicate.draft !== snapshot.draft)) return;
    const run = () => {
      if (!snapshot.valid() || !reviewAllowed(item, action) || (override && current.current.duplicate !== duplicate)) return;
      if (action === "replace") void replace(snapshot);
      else void reviewMutation(snapshot, action, override);
    };
    if ((action === "confirm" || action === "manual-entry") && !override) { run(); return; }
    Alert.alert(override ? "仍然创建联系人？" : action === "replace" ? "替换此名片？" : action === "retry" ? "重新识别此名片？" : "跳过此名片？", override ? "将创建独立的联系人。" : action === "skip" ? "此操作不能撤销。" : "现有编辑将保留，识别结果可能改变。", [
      { text: "返回", style: "cancel" }, { text: "确认", onPress: run },
    ]);
  }
  async function reviewMutation(snapshot: ReturnType<typeof reviewSnapshot>, action: Exclude<IngestReviewAction, "replace">, override: boolean) {
    if (!snapshot.valid() || !reviewAllowed(snapshot.item, action)) return;
    if ((action === "confirm" || action === "manual-entry") && !snapshot.draft?.fields.displayName.trim()) { update({ error: "请填写姓名。" }); return; }
    lock.current = true; update({ busy: true, error: null, notice: null });
    const ticket = capture();
    let refresh = true;
    try {
      const response = await scope.client.post<unknown>(ingestItemPath(scope.batchId, snapshot.item.id) + "/" + action, { body: action === "confirm" || action === "manual-entry" ? { ...snapshot.draft!.fields, allowDuplicate: override } : {}, signal: ticket.signal });
      if (!ticket.valid()) return;
      if (observeUnavailable(response.status)) return;
      if (!snapshot.valid()) return;
      const accepted = acceptedIngestReview(response, snapshot.detail, snapshot.item, action);
      if (accepted?.state === "duplicate_review") {
        refresh = false;
        update({ duplicate: { item: snapshot.item, draft: snapshot.draft!, contactId: accepted.duplicateContactId } });
      } else if (accepted) {
        const drafts = new Map(current.current.drafts);
        if (action !== "retry") drafts.delete(snapshot.item.id);
        update({ drafts, duplicate: null, detail: { ...snapshot.detail, items: snapshot.detail.items.map(i => i.id === accepted.item.id ? accepted.item : i) }, notice: action === "retry" ? "已提交重新识别。" : action === "skip" ? "已跳过名片。" : "已收录。" });
      } else {
        update({ error: response.status === 409 ? "版本已变化，编辑已保留，请核对刷新后的名片。" : "操作结果无法确认，请刷新后重试。" });
      }
    } catch { if (ticket.valid()) update({ error: "操作结果无法确认，请刷新后重试。" }); }
    finally {
      if (ticket.valid()) { lock.current = false; update({ busy: false, ...(refresh ? { authorized: false } : {}) }); if (refresh) await load(); }
      ticket.release();
    }
  }
  async function replace(snapshot: ReturnType<typeof reviewSnapshot>) {
    if (!snapshot.valid() || !reviewAllowed(snapshot.item, "replace")) return;
    const ticket = session.capturePicker();
    if (!ticket) return;
    lock.current = true; update({ busy: true, error: null, notice: null });
    let dispatched = false;
    try {
      const selection = await ImagePicker.launchImageLibraryAsync({ ...batchPickerOptions, allowsMultipleSelection: false, selectionLimit: 1 });
      if (!await ticket.waitForForeground() || !snapshot.valid() || selection.canceled) return;
      if (selection.assets.length !== 1) throw new Error("请选择一张名片。");
      const file: PreparedBatchImage = await prepareBatchImage(selection.assets[0]!, { signal: ticket.signal });
      if (!ticket.valid() || !snapshot.valid()) return;
      const bytes = await readPreparedBatchImage(file, { signal: ticket.signal });
      if (!ticket.valid() || !snapshot.valid()) return;
      dispatched = true;
      const response = await scope.client.post<unknown>(itemReplacePath(scope.batchId, snapshot.item.id), { rawBody: bytes, headers: { "Content-Type": file.mimeType, "If-Match": String(snapshot.item.version) }, signal: ticket.signal });
      if (!ticket.valid()) return;
      if (observeUnavailable(response.status)) return;
      if (!snapshot.valid()) return;
      const accepted = acceptedIngestReview(response, snapshot.detail, snapshot.item, "replace", file);
      if (accepted?.state === "accepted") {
        imageAttempt.current = null; setImage({ status: "none" });
        update({ duplicate: null, detail: { ...snapshot.detail, items: snapshot.detail.items.map(i => i.id === accepted.item.id ? accepted.item : i) }, notice: "已替换名片。" });
      } else {
        update({ error: response.status === 409 ? "版本已变化，编辑已保留，请核对刷新后的名片。" : "替换结果无法确认，请刷新后重试。" });
      }
    } catch (error) { if (await ticket.waitForForeground() && snapshot.valid()) update({ error: error instanceof Error ? error.message : "无法替换名片。" }); }
    finally {
      const owned = ticket.owned(); const valid = ticket.valid();
      ticket.release();
      if (owned) { lock.current = false; update({ busy: false, ...(dispatched ? { authorized: false } : {}) }); if (dispatched && valid) await load(); }
    }
  }
  function reloadFields(item: IngestItemContract) {
    if (!isCurrent() || lock.current || current.current.reviewInvalidated) return;
    const snapshot = reviewSnapshot(item);
    Alert.alert("重新载入字段？", "将丢弃当前名片的本地编辑。", [{ text: "返回", style: "cancel" }, { text: "确认", onPress: () => { if (snapshot.valid()) void load({ id: item.id, draft: snapshot.draft, selectionEpoch: selectionEpoch.current }); } }]);
  }
  const detail = state.detail;
  const terminal = detail ? ingestTerminal(detail) : false;
  const collecting = detail?.batch.status === "collecting" && !terminal;
  const enabled = active && state.authorized && !state.busy && !state.loading;
  const selected = !terminal && !state.reviewInvalidated ? detail?.items.find(i => i.id === state.selectedId && ["extracted", "terminal_failed"].includes(i.status)) : undefined;
  const draft = selected ? state.drafts.get(selected.id) : undefined;
  const imageKey = selected ? JSON.stringify([selected.id, selected.imageDigest, selected.derivativeObjectKey]) : null;
  useEffect(() => {
    const attempt = {}; imageAttempt.current = attempt;
    imageOwner.current = imageKey;
    setImage({ status: active && imageKey ? "loading" : "none" });
    if (!active || state.reviewInvalidated || !imageKey || !selected) return;
    const ticket = capture();
    let alive = true;
    const controller = new AbortController();
    const abort = () => controller.abort();
    ticket.signal.addEventListener("abort", abort, { once: true });
    void loadSelectedBatchImage(scope.client, ingestItemPath(scope.batchId, selected.id) + "/image", { signal: controller.signal }).then(value => {
      if (alive && ticket.valid() && imageAttempt.current === attempt) setImage({ status: "available", uri: value.uri });
    }).catch(() => {
      if (alive && ticket.valid() && imageAttempt.current === attempt) setImage({ status: "unavailable", message: "图片暂时无法显示。" });
    }).finally(ticket.release);
    return () => { alive = false; imageAttempt.current = null; controller.abort(); ticket.signal.removeEventListener("abort", abort); ticket.release(); };
  }, [scope, active, imageKey, imageRetry, state.reviewInvalidated]);
  const renderedImageAttempt = imageAttempt.current;
  const local = detail && !state.reviewInvalidated ? pendingFiles(fileScope, detail) : new Map();
  const labels: Record<IngestItemContract["status"], string> = { awaiting_upload: "等待上传", uploaded: "已上传", excluded: "已排除", queued: "等待识别", processing: "正在识别", extracted: "待复核", terminal_failed: "识别失败", confirmed: "已收录", skipped: "已跳过" };
  return <AppScreen title="名片批次">
    <View style={styles.row}><Text style={styles.heading}>{detail ? batchStatusLabel(ingestExpired(detail) ? "expired" : detail.batch.status) : "批次"}</Text><IngestButton label="刷新批次" icon="refresh-outline" disabled={!active || state.busy || state.loading} onPress={() => { update({ error: null }); void load(); }} /></View>
    {state.loading ? <Text style={styles.text}>正在读取批次...</Text> : null}
    {state.busy ? <Text style={styles.text}>正在处理...</Text> : null}
    {state.error ? <Text accessibilityRole="alert" style={styles.error}>{state.error}</Text> : null}
    {state.notice ? <Text style={styles.text}>{state.notice}</Text> : null}
    {state.unmatched.map((name, index) => <Text accessibilityRole="alert" key={index} style={styles.error}>未匹配名片：{name}</Text>)}
    {collecting ? <View style={styles.row}>
      <IngestButton label="重新选择名片" icon="images-outline" disabled={!enabled} onPress={() => void reselect()} />
      <IngestButton label="上传待传名片" icon="cloud-upload-outline" disabled={!enabled || !local.size} onPress={() => void upload()} />
      <IngestButton label="开始识别" icon="scan-outline" disabled={!enabled || !detail || !canFinalizeIngest(detail)} onPress={() => ask("finalize")} />
    </View> : null}
    {detail && !terminal ? <IngestButton label="取消批次" icon="close-circle-outline" disabled={!enabled} onPress={() => ask("cancel")} /> : null}
    {detail?.items.map(item => <View key={item.id} style={styles.fileRow}>
      <View style={styles.grow}><Text style={styles.text}>{item.seq}. {item.sourceFileName}</Text><Text style={styles.muted}>{labels[item.status]}{item.status === "awaiting_upload" ? local.has(item.id) ? " · 已匹配文件" : " · 尚未选择文件" : ""}</Text>
        {Object.hasOwn(state.failures, item.id) ? <Text accessibilityRole="alert" style={styles.error}>{state.failures[item.id]}</Text> : null}
      </View>
      {collecting && ["awaiting_upload", "uploaded"].includes(item.status) ? <IngestButton label={"排除名片 " + item.seq} icon="remove-circle-outline" disabled={!enabled} onPress={() => ask("exclude", item.id)} /> : null}
      {!terminal && ["extracted", "terminal_failed"].includes(item.status) ? <IngestButton label={"复核名片 " + item.seq} icon="create-outline" disabled={!active || state.reviewInvalidated} onPress={() => { if (isCurrent() && !current.current.reviewInvalidated && current.current.detail === detail) update({ selectedId: item.id, duplicate: null }); }} /> : null}
      {detail && canReviewIngest(detail, item, "replace") ? <IngestButton label={"替换名片 " + item.seq} icon="image-outline" disabled={!enabled} onPress={() => askReview(item, "replace")} /> : null}
      {item.status === "confirmed" && item.confirmedContactId ? <IngestButton label={"打开联系人 " + item.seq} icon="person-outline" disabled={!active} onPress={() => { if (isCurrent()) router.push(("/contacts/" + encodeURIComponent(item.confirmedContactId!)) as Href); }} /> : null}
    </View>)}
    {selected && detail ? <View>
      {selected.status === "terminal_failed" ? <Text style={styles.error}>{selected.errorCode === "IMAGE_INVALID" || selected.errorCode === "LEASE_EXHAUSTED" ? "识别失败，不再自动重试。可手动重试、替换图片或填写名片。" : "识别失败。可手动重试或填写名片。"}</Text> : null}
      <BusinessCardBatchReviewForm fields={draft?.fields ?? null} image={active && imageOwner.current === imageKey ? image : { status: "none" }} reviewIssues={selected.reviewIssues} statusLabel={selected.status === "terminal_failed" ? "手动填写名片" : "复核名片"}
        disabled={!active || state.busy} canConfirm={enabled && Boolean(draft?.fields.displayName.trim())} canSkip={enabled && canReviewIngest(detail, selected, "skip")} canRetry={enabled && canReviewIngest(detail, selected, "retry")} duplicateContactId={state.duplicate?.contactId ?? null}
        onChange={fields => { if (!isCurrent() || current.current.busy || current.current.selectedId !== selected.id) return; const drafts = new Map(current.current.drafts); drafts.set(selected.id, { fields, dirty: true }); update({ drafts, duplicate: null }); }}
        onImageError={() => { if (isCurrent() && current.current.selectedId === selected.id && imageAttempt.current === renderedImageAttempt && renderedImageAttempt) setImage({ status: "unavailable", message: "图片暂时无法显示。" }); }}
        onConfirm={() => askReview(selected, selected.status === "terminal_failed" ? "manual-entry" : "confirm")} onSkip={() => askReview(selected, "skip")} onRetry={() => askReview(selected, "retry")} onOverride={() => askReview(selected, selected.status === "terminal_failed" ? "manual-entry" : "confirm", true)}
        onOpenDuplicate={() => { if (isCurrent() && current.current.duplicate === state.duplicate && state.duplicate) router.push(("/contacts/" + encodeURIComponent(state.duplicate.contactId)) as Href); }} />
      <IngestButton label="重新载入字段" icon="refresh-outline" disabled={!enabled} onPress={() => reloadFields(selected)} />
      {image.status === "unavailable" ? <IngestButton label="重新读取图片" icon="image-outline" disabled={!active} onPress={() => { if (isCurrent() && !current.current.reviewInvalidated && current.current.detail === detail) { imageAttempt.current = null; setImageRetry(n => n + 1); } }} /> : null}
    </View> : null}
  </AppScreen>;
}
