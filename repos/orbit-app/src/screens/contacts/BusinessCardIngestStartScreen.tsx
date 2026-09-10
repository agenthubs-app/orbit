import { Ionicons } from "@expo/vector-icons";
import { randomUUID } from "expo-crypto";
import * as ImagePicker from "expo-image-picker";
import { type Href, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Pressable, StyleSheet, Text, View } from "react-native";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { prepareBatchImages, type PreparedBatchImage } from "../../api/batch-images";
import type { BusinessCardBatchContract, IngestBatchContract } from "../../api/contract/business-card-batch";
import { AppScreen } from "../../components/AppScreen";
import { createThemedStyles } from "../../design/theme";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { acceptedBatchCollection, acceptedIngestCreate, batchRoutePath, creationAttempt, INGEST_COLLECTION_PATH, LEGACY_COLLECTION_PATH, type BatchSource, type CreationAttempt } from "../../view-models/business-card-ingest";
import { activatePendingIdentity, rememberPendingFiles, retainPendingIdentity } from "./business-card-pending-files";

export const batchPickerOptions: ImagePicker.ImagePickerOptions = {
  mediaTypes: ["images"], allowsMultipleSelection: true, selectionLimit: 100,
  allowsEditing: false, quality: 1, base64: false,
  preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
};

// Shared by the two Task4 surfaces; each owns its own controllers and epoch.
export function useIngestScope(batchId: string) {
  const auth = useOrbitAuthSession();
  const server = useOrbitApiBaseUrl();
  const client = useOrbitApiClient();
  const subject = auth.user?.id ?? "";
  const ready = auth.ready && server.ready && auth.signedIn && Boolean(subject);
  const identity = activatePendingIdentity(server.baseUrl, subject, ready);
  const sequence = useRef(0);
  const scope = useMemo(() => ({ client, identity, batchId, ready, key: ++sequence.current }), [client, identity, batchId, ready]);
  const latest = useRef(scope);
  const mounted = useRef(true);
  const epoch = useRef(0);
  const controllers = useRef(new Set<AbortController>());
  const picker = useRef<{ controller: AbortController; preparing: boolean; resume: ((active: boolean) => void) | undefined } | null>(null);
  const [focused, setFocused] = useState(false);
  const [foreground, setForeground] = useState(AppState.currentState === "active");
  const activity = useRef({ focused: false, foreground });
  const invalidateNetwork = useCallback(() => {
    epoch.current++;
    controllers.current.forEach(c => c.abort()); controllers.current.clear();
  }, []);
  const invalidate = useCallback(() => {
    invalidateNetwork();
    const pending = picker.current;
    picker.current = null;
    pending?.controller.abort(); pending?.resume?.(false);
  }, [invalidateNetwork]);
  if (latest.current !== scope) { latest.current = scope; invalidate(); }
  useFocusEffect(useCallback(() => {
    activity.current.focused = true; setFocused(true);
    return () => { activity.current.focused = false; invalidate(); setFocused(false); };
  }, [invalidate]));
  useEffect(() => {
    mounted.current = true;
    const listener = AppState.addEventListener("change", value => {
      activity.current.foreground = value === "active";
      // Only native presentation survives host pause, never network or file preparation.
      if (value !== "active") {
        if (picker.current?.preparing) invalidate(); else invalidateNetwork();
      } else picker.current?.resume?.(true);
      setForeground(value === "active");
    });
    return () => { mounted.current = false; invalidate(); listener.remove(); };
  }, [invalidate, invalidateNetwork]);
  useEffect(() => retainPendingIdentity(identity), [identity]);
  function isCurrent() { return mounted.current && latest.current === scope && ready && activity.current.focused && activity.current.foreground; }
  function capture() {
    const generation = epoch.current;
    const controller = new AbortController();
    controllers.current.add(controller);
    return {
      signal: controller.signal,
      valid: () => isCurrent() && epoch.current === generation && !controller.signal.aborted,
      release: () => { controllers.current.delete(controller); },
    };
  }
  function capturePicker() {
    if (!isCurrent() || picker.current) return null;
    const pending = { controller: new AbortController(), preparing: false, resume: undefined as ((active: boolean) => void) | undefined };
    picker.current = pending;
    const owned = () => mounted.current && latest.current === scope && ready && activity.current.focused && picker.current === pending && !pending.controller.signal.aborted;
    const valid = () => owned() && activity.current.foreground;
    return {
      signal: pending.controller.signal, owned, valid,
      waitForForeground: async () => {
        if (!owned()) return false;
        if (!activity.current.foreground && !await new Promise<boolean>(resolve => { pending.resume = resolve; })) return false;
        if (!valid()) return false;
        pending.preparing = true;
        return true;
      },
      release: () => { if (picker.current === pending) picker.current = null; pending.resume?.(false); },
    };
  }
  return { scope, active: ready && focused && foreground, focused, isCurrent, capture, invalidate, capturePicker, hasPicker: () => picker.current !== null };
}
export type IngestSession = ReturnType<typeof useIngestScope>;

export function IngestButton({ label, icon, disabled = false, onPress }: { label: string; icon: keyof typeof Ionicons.glyphMap; disabled?: boolean; onPress: () => void }) {
  const { styles, colors } = useIngestStyles();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[styles.button, disabled && styles.disabled]}>
    <Ionicons name={icon} size={20} color={colors.accent} /><Text style={styles.buttonText}>{label}</Text>
  </Pressable>;
}

export function BusinessCardIngestStartScreen() {
  const session = useIngestScope("");
  return <IngestStartContent key={session.scope.key} session={session} />;
}
function IngestStartContent({ session }: { session: IngestSession }) {
  const { scope, active, isCurrent, capture } = session;
  const router = useRouter();
  const { styles } = useIngestStyles();
  const [files, setFiles] = useState<PreparedBatchImage[]>([]);
  const currentFiles = useRef(files);
  const attempt = useRef<CreationAttempt | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const listing = useRef(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  type Row = { source: BatchSource; batch: IngestBatchContract | BusinessCardBatchContract };
  const [rows, setRows] = useState<Row[]>([]);
  const [listErrors, setListErrors] = useState<Partial<Record<BatchSource, string>>>({});
  useEffect(() => {
    if (!active) { listing.current = false; setLoading(false); }
    if (session.hasPicker()) return;
    if (active) void refresh();
    else { lock.current = false; listing.current = false; setBusy(false); setLoading(false); }
  }, [scope, active, session.focused]);

  async function refresh() {
    if (!isCurrent() || listing.current) return;
    listing.current = true; setLoading(true);
    const ticket = capture();
    try {
      await Promise.all((["current", "legacy"] as const).map(async source => {
        try {
          const result = await scope.client.get<unknown>(source === "current" ? INGEST_COLLECTION_PATH : LEGACY_COLLECTION_PATH, { signal: ticket.signal });
          if (!ticket.valid()) return;
          const batches = acceptedBatchCollection(result, source);
          if (!batches) throw new Error(source === "current" ? "部分批次暂时无法读取，请刷新列表。" : "历史批次暂时无法读取，请刷新列表。");
          setRows(previous => [...previous.filter(r => r.source !== source), ...batches.map(batch => ({ source, batch }))].sort((a, b) => Date.parse(b.batch.createdAt) - Date.parse(a.batch.createdAt)));
          setListErrors(previous => ({ ...previous, [source]: undefined }));
        } catch (error) {
          if (ticket.valid()) setListErrors(previous => ({ ...previous, [source]: error instanceof Error ? error.message : "批次列表暂时无法读取。" }));
        }
      }));
    } finally { if (ticket.valid()) { listing.current = false; setLoading(false); } ticket.release(); }
  }
  async function select() {
    if (!isCurrent() || lock.current) return;
    const ticket = session.capturePicker();
    if (!ticket) return;
    lock.current = true; setBusy(true); setError(null);
    const before = currentFiles.current;
    try {
      const selection = await ImagePicker.launchImageLibraryAsync(batchPickerOptions);
      if (!await ticket.waitForForeground() || currentFiles.current !== before || selection.canceled) return;
      const prepared = await prepareBatchImages(selection.assets, { signal: ticket.signal });
      if (!ticket.valid() || currentFiles.current !== before) return;
      if (!prepared.length) return;
      currentFiles.current = prepared; setFiles(prepared);
      // A URI-only reselection retains the same server manifest/key.
      attempt.current = creationAttempt(prepared, attempt.current, randomUUID);
    } catch (error) { if (await ticket.waitForForeground()) setError(error instanceof Error ? error.message : "无法读取所选名片。"); }
    finally { if (ticket.owned()) { lock.current = false; setBusy(false); } ticket.release(); }
  }
  function remove(index: number) {
    if (!isCurrent() || lock.current) return;
    const next = currentFiles.current.filter((_, i) => i !== index);
    currentFiles.current = next; setFiles(next); setError(null);
    attempt.current = next.length ? creationAttempt(next, attempt.current, randomUUID) : null;
  }
  async function create() {
    if (!isCurrent() || lock.current || !currentFiles.current.length) return;
    lock.current = true; setBusy(true); setError(null);
    const ticket = capture();
    const selected = currentFiles.current;
    const submission = creationAttempt(selected, attempt.current, randomUUID);
    attempt.current = submission;
    try {
      const response = await scope.client.post<unknown>(INGEST_COLLECTION_PATH, { body: submission, signal: ticket.signal });
      if (!ticket.valid() || attempt.current !== submission || currentFiles.current !== selected) return;
      const detail = acceptedIngestCreate(response, submission);
      if (!detail) {
        setError(response.status === 409 || response.status === 410 ? "批次状态已变化，请刷新列表后重新打开。" : "创建结果无法确认；重试将保留相同名片和请求编号。");
        if (response.status === 409 || response.status === 410) void refresh();
        return;
      }
      rememberPendingFiles({ identity: scope.identity, batchId: detail.batch.id }, detail, selected);
      router.push(batchRoutePath("current", detail.batch.id) as Href);
    } catch { if (ticket.valid()) setError("创建结果无法确认；请重试或刷新列表。"); }
    finally { if (ticket.valid()) { lock.current = false; setBusy(false); } ticket.release(); }
  }
  return <AppScreen title="批量导入名片">
    <View style={styles.row}><IngestButton label="选择名片" icon="images-outline" disabled={!active || busy} onPress={() => void select()} /><IngestButton label="创建批次" icon="add-circle-outline" disabled={!active || busy || !files.length} onPress={() => void create()} /></View>
    {busy ? <Text style={styles.text}>正在处理...</Text> : null}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {files.map((file, index) => <View key={index} style={styles.fileRow}>
      <View style={styles.grow}><Text style={styles.text}>{file.fileName}</Text><Text style={styles.muted}>{(file.rawSize / 1048576).toFixed(2)} MiB</Text></View>
      <IngestButton label={"移除名片 " + (index + 1)} icon="close-outline" disabled={!active || busy} onPress={() => remove(index)} />
    </View>)}
    <View style={styles.row}><Text style={styles.heading}>最近批次</Text><IngestButton label="刷新列表" icon="refresh-outline" disabled={!active || loading} onPress={() => void refresh()} /></View>
    {loading ? <Text style={styles.text}>正在读取列表...</Text> : null}
    {Object.values(listErrors).filter(Boolean).map((message, index) => <Text key={index} accessibilityRole="alert" style={styles.error}>{message}</Text>)}
    {!loading && !rows.length && !Object.values(listErrors).some(Boolean) ? <Text style={styles.muted}>暂无批次</Text> : null}
    {rows.map(({ source, batch }) => <View style={styles.fileRow} key={source + batch.id}>
      <View style={styles.grow}><Text style={styles.text}>{batch.createdAt.slice(0, 10)}</Text><Text style={styles.muted}>{batchStatusLabel(batch.status)}</Text></View>
      <IngestButton label={"打开批次 " + batch.id} icon="chevron-forward-outline" disabled={!active} onPress={() => { if (isCurrent()) router.push(batchRoutePath(source, batch.id) as Href); }} />
    </View>)}
  </AppScreen>;
}
export function batchStatusLabel(status: string): string {
  return ({ collecting: "等待上传", processing: "正在识别", ready_for_review: "待复核", completed: "已完成", cancelled: "已取消", expired: "已过期" } as Record<string, string>)[status] ?? status;
}
export const useIngestStyles = createThemedStyles(colors => StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 10 },
  fileRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 10, borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 12 },
  grow: { flexGrow: 1, flexShrink: 1, minWidth: 100 },
  button: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 44, maxWidth: "100%", paddingHorizontal: 10, paddingVertical: 8, borderRadius: 6, borderWidth: 1, borderColor: colors.border },
  buttonText: { color: colors.accent, fontSize: 14, flexShrink: 1, letterSpacing: 0 },
  disabled: { opacity: 0.45 }, text: { color: colors.ink, fontSize: 15, letterSpacing: 0 },
  muted: { color: colors.text3, fontSize: 13, letterSpacing: 0 },
  heading: { color: colors.ink, fontSize: 18, fontWeight: "700", flexGrow: 1, letterSpacing: 0 },
  error: { color: colors.rose, fontSize: 14, letterSpacing: 0 },
}));
