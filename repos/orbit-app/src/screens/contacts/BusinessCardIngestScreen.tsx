import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Alert, Text, View } from "react-native";
import { prepareBatchImages } from "../../api/batch-images";
import type { IngestBatchDetailContract, IngestItemContract } from "../../api/contract/business-card-batch";
import { ingestBatchActionResponseSchema, ingestFinalizeResponseSchema, ingestItemActionResponseSchema } from "../../api/schema/business-card-batch";
import { AppScreen } from "../../components/AppScreen";
import { acceptedIngestDetail, canFinalizeIngest, ingestBatchPath, ingestExpired, ingestItemPath, ingestTerminal, isHttpSuccess, uploadPendingPass } from "../../view-models/business-card-ingest";
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
}
const emptyState = (): IngestState => ({ detail: null, authorized: false, busy: false, loading: false, error: null, notice: null, failures: {}, unmatched: [] });

export function BusinessCardIngestScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = (Array.isArray(params.id) ? params.id[0] : params.id) ?? "";
  const session = useIngestScope(id);
  return <IngestContent key={session.scope.key} session={session} />;
}
function IngestContent({ session }: { session: IngestSession }) {
  const { scope, active, isCurrent, capture } = session;
  const { styles } = useIngestStyles();
  const [state, setState] = useState<IngestState>(emptyState);
  const current = useRef(state);
  const lock = useRef(false);
  const fileScope = { identity: scope.identity, batchId: scope.batchId };
  function update(patch: Partial<IngestState>) { current.current = { ...current.current, ...patch }; setState(current.current); }
  function expire() {
    clearPendingFiles(fileScope); session.invalidate(); lock.current = false;
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

  async function load() {
    if (!isCurrent() || !scope.batchId.trim() || lock.current) return;
    lock.current = true; update({ loading: true, authorized: false });
    const ticket = capture();
    try {
      const response = await scope.client.get<unknown>(ingestBatchPath(scope.batchId), { signal: ticket.signal });
      if (!ticket.valid()) return;
      const previous = current.current.detail;
      const detail = acceptedIngestDetail(response, scope.batchId, previous?.batch.actorId ?? null);
      const regressed = detail && previous && (detail.batch.version < previous.batch.version || detail.batch.idempotencyKey !== previous.batch.idempotencyKey || detail.batch.manifestFingerprint !== previous.batch.manifestFingerprint || detail.items.length !== previous.items.length || previous.items.some(i => {
        const next = detail.items.find(n => n.id === i.id);
        return !next || next.version < i.version || next.seq !== i.seq || (["excluded", "confirmed", "skipped"].includes(i.status) && next.status !== i.status);
      }) || (["completed", "cancelled", "expired"].includes(previous.batch.status) && detail.batch.status !== previous.batch.status));
      if (!detail || regressed) {
        if (response.status === 410) clearPendingFiles(fileScope);
        update({ error: "批次读取结果无法确认，请刷新重试。" }); return;
      }
      pendingFiles(fileScope, detail);
      // Prune only resolved upload failures. A successful poll does not hide a failed file.
      const failures = Object.fromEntries(Object.entries(current.current.failures).filter(([id]) => detail.items.some(i => i.id === id && i.status === "awaiting_upload")));
      if (ingestTerminal(detail)) clearPendingFiles(fileScope);
      update({ detail, failures, authorized: !ingestTerminal(detail), ...(ingestExpired(detail) ? { error: "批次已过期，无法继续操作。" } : {}) });
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
      if (!ticket.valid() || current.current.detail !== detail || ingestExpired(detail)) return;
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
        if (response.status === 410) clearPendingFiles(fileScope);
        update({ error: response.status === 409 || response.status === 410 ? "批次状态已变化，正在重新读取。" : "操作结果无法确认，请刷新后重试。" });
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
  const detail = state.detail;
  const terminal = detail ? ingestTerminal(detail) : false;
  const collecting = detail?.batch.status === "collecting" && !terminal;
  const enabled = active && state.authorized && !state.busy && !state.loading;
  const local = detail ? pendingFiles(fileScope, detail) : new Map();
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
    </View>)}
  </AppScreen>;
}
