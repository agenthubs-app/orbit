import { Ionicons } from "@expo/vector-icons";
import { type Href, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, AppState, Pressable, ScrollView, StyleSheet, Text, View, type DimensionValue } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { createBusinessCardImportClient, type BusinessCardImportJob } from "../../api/business-card-import";
import { createThemedStyles } from "../../design/theme";

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u;
const activeJob = (job: BusinessCardImportJob | null) => Boolean(job && ["pending", "processing", "ready"].includes(job.state));
const labels: Record<BusinessCardImportJob["state"], string> = {
  pending: "等待准备", processing: "正在准备文件", ready: "正在创建待确认批次",
  completed: "文件准备完成", failed: "文件准备失败", cancelled: "导入已取消",
};
const errors: Record<NonNullable<BusinessCardImportJob["errorCode"]>, string> = {
  SOURCE_UNAVAILABLE: "暂时无法读取源文件。",
  PDF_INVALID: "这份 PDF 无法处理，请检查文件后重新选择。",
  IMAGE_INVALID: "图片无法处理，请换一张清晰、完整的名片图片。",
  BATCH_TOO_LARGE: "这批文件过大，请减少文件或页面后重新导入。",
  SOURCE_EXPIRED: "源文件已过期，请重新选择文件。",
};
type Scope = {
  key: number;
  id: string;
  ready: boolean;
  client: ReturnType<typeof createBusinessCardImportClient>;
};

export function BusinessCardImportScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = typeof params.id === "string" ? params.id : "";
  const auth = useOrbitAuthSession();
  const server = useOrbitApiBaseUrl();
  const subject = auth.user?.id ?? "";
  const ready = auth.ready && server.ready && auth.signedIn && Boolean(subject);
  const sequence = useRef(0);
  // Actor is part of scope even when two browser sessions have no explicit
  // cookie header. A late response must never become the next actor's state.
  const scope = useMemo<Scope>(() => ({
    key: ++sequence.current, id, ready,
    client: createBusinessCardImportClient({ baseUrl: server.baseUrl, authCookieHeader: auth.cookieHeader }),
  }), [id, ready, subject, server.baseUrl, auth.cookieHeader]);
  const latest = useRef(scope);
  latest.current = scope;
  const current = useCallback(() => latest.current === scope && scope.ready, [scope]);
  return <ImportProgress key={scope.key} scope={scope} current={current} />;
}

function ImportProgress({ scope, current }: { scope: Scope; current: () => boolean }) {
  const router = useRouter();
  const { styles, colors } = useStyles();
  const validId = UUID.test(scope.id);
  const [job, setJob] = useState<BusinessCardImportJob | null>(null);
  const [error, setError] = useState("");
  const [active, setActive] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const runtime = useRef({
    alive: true, focused: false, foreground: AppState.currentState === "active",
    generation: 0, reading: false, mutating: false, stopped: false,
    job: null as BusinessCardImportJob | null, controllers: new Set<AbortController>(),
  });
  const invalidate = useCallback(() => {
    const r = runtime.current;
    r.generation++;
    r.controllers.forEach(controller => controller.abort());
    r.controllers.clear(); r.reading = false; r.mutating = false;
  }, []);
  const isCurrent = useCallback(() => {
    const r = runtime.current;
    return r.alive && r.focused && r.foreground && current() && validId;
  }, [current, validId]);
  const capture = useCallback(() => {
    const r = runtime.current;
    const generation = r.generation;
    const controller = new AbortController();
    r.controllers.add(controller);
    return {
      signal: controller.signal,
      valid: () => isCurrent() && runtime.current.generation === generation && !controller.signal.aborted,
      release: () => runtime.current.controllers.delete(controller),
    };
  }, [isCurrent]);

  const read = useCallback(async (force = false) => {
    const r = runtime.current;
    if (!isCurrent() || r.reading || r.mutating || (r.stopped && !force)) return;
    r.reading = true; r.stopped = false;
    setError("");
    const ticket = capture();
    try {
      const result = await scope.client.getJob(scope.id, ticket.signal);
      if (!ticket.valid()) return;
      r.reading = false;
      if (result.success) {
        r.job = result.data; setJob(result.data); r.stopped = !activeJob(result.data);
      } else {
        // A stale successful read is not cancellation authority after an error.
        r.job = null; setJob(null); r.stopped = true; setError(result.error.message);
      }
    } finally { ticket.release(); }
  }, [capture, isCurrent, scope]);

  useFocusEffect(useCallback(() => {
    const r = runtime.current; r.focused = true; r.stopped = false;
    setActive(r.foreground);
    return () => {
      r.focused = false; invalidate(); r.job = null;
      setJob(null); setCancelling(false); setActive(false);
    };
  }, [invalidate]));
  useEffect(() => {
    const r = runtime.current; r.alive = true;
    const listener = AppState.addEventListener("change", state => {
      r.foreground = state === "active";
      if (!r.foreground) {
        invalidate(); r.job = null; setJob(null); setCancelling(false);
      } else r.stopped = false;
      setActive(r.foreground && r.focused);
    });
    return () => { r.alive = false; invalidate(); listener.remove(); };
  }, [invalidate]);
  useEffect(() => {
    if (!active) return;
    void read();
    const timer = setInterval(() => { void read(); }, 3000);
    return () => clearInterval(timer);
  }, [active, read]);

  async function cancel(generation: number) {
    const r = runtime.current;
    if (!isCurrent() || r.generation !== generation || r.mutating || !activeJob(r.job)) return;
    invalidate();
    r.mutating = true; r.stopped = true; setCancelling(true); setError("");
    const ticket = capture();
    try {
      const result = await scope.client.cancelJob(scope.id, ticket.signal);
      if (!ticket.valid()) return;
      r.mutating = false; setCancelling(false);
      if (result.success) {
        r.job = result.data; setJob(result.data); r.stopped = !activeJob(result.data);
      } else {
        r.job = null; setJob(null); setError(result.error.message);
        if (result.status === 409) void read(true);
      }
    } finally { ticket.release(); }
  }
  function askCancel() {
    const r = runtime.current;
    if (!isCurrent() || r.mutating || !activeJob(r.job)) return;
    const generation = r.generation;
    Alert.alert("取消这次导入？", "尚未准备完成的文件将停止处理。已经保存的人脉不会改变。", [
      { text: "继续准备", style: "cancel" },
      { text: "取消导入", style: "destructive", onPress: () => { void cancel(generation); } },
    ]);
  }
  function openBatch() {
    const latestJob = runtime.current.job;
    if (isCurrent() && latestJob?.state === "completed" && latestJob.batchId) {
      router.push(("/contacts/new/batch/" + encodeURIComponent(latestJob.batchId)) as Href);
    }
  }

  return <SafeAreaView edges={["top", "bottom"]} style={styles.screen}>
    <View style={styles.navigation}>
      <Pressable accessibilityRole="button" accessibilityLabel="返回导入中心" onPress={() => router.replace("/contacts/new" as Href)} style={styles.back}>
        <Ionicons name="chevron-back" size={19} color={colors.accent} /><Text style={styles.backLabel}>导入中心</Text>
      </Pressable>
      <Text style={styles.navTitle}>名片导入</Text><View style={styles.navBalance} />
    </View>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text accessibilityRole="header" style={styles.title}>准备名片导入</Text>
      <Text style={styles.copy}>文件会在后台准备。你可以离开此页，稍后回来查看进度。</Text>
      {!validId ? <Text accessibilityRole="alert" style={styles.error}>导入地址无效，请返回导入中心重新选择。</Text> :
        !job && !error ? <View accessibilityLabel="正在读取导入进度" accessibilityRole="progressbar" style={styles.loading}>
          <ActivityIndicator color={colors.accent} /><Text style={styles.copy}>正在读取导入进度…</Text>
        </View> : null}
      {job && active ? <>
        <View style={styles.summary}>
          <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={styles.sectionTitle}>{labels[job.state]}</Text>
          <Text style={styles.status}>{job.completedSources} / {job.sourceCount} 个文件</Text>
        </View>
        <View accessibilityLabel="文件准备进度" accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: job.sourceCount, now: job.completedSources }}
          aria-valuemin={0} aria-valuemax={job.sourceCount} aria-valuenow={job.completedSources} style={styles.track}>
          <View style={[styles.progress, { width: (job.completedSources / job.sourceCount * 100 + "%") as DimensionValue }]} />
        </View>
        <View style={styles.row}><Text style={styles.label}>页面</Text><Text style={styles.value}>已准备 {job.preparedPages} 页</Text></View>
        {job.currentSourcePage !== null && job.currentSourcePageCount !== null ? <View style={styles.row}>
          <Text style={styles.label}>当前文件</Text><Text style={styles.value}>已准备 {job.currentSourcePage - 1} / {job.currentSourcePageCount} 页</Text>
        </View> : null}
        {job.errorCode ? <Text accessibilityRole="alert" style={styles.error}>{errors[job.errorCode]}</Text> : null}
        {job.retryAt ? <Text style={styles.copy}>文件暂时未能准备完成，后台会继续重试。</Text> : null}
        {job.state === "completed" ? <>
          <Text style={styles.notice}>接下来请检查识别结果并逐项确认。准备完成不会直接保存联系人。</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="查看待确认名片" onPress={openBatch} style={styles.primary}>
            <Text style={styles.primaryText}>查看待确认名片</Text>
          </Pressable>
        </> : null}
        {activeJob(job) ? <Pressable accessibilityRole="button" accessibilityLabel="取消导入" accessibilityState={{ disabled: cancelling }}
          disabled={cancelling} onPress={askCancel} style={[styles.secondary, cancelling && styles.disabled]}>
          <Text style={styles.secondaryText}>{cancelling ? "正在取消…" : "取消导入"}</Text>
        </Pressable> : null}
        {job.state === "failed" || job.state === "cancelled" ? <Pressable accessibilityRole="button" accessibilityLabel="重新选择文件"
          onPress={() => router.replace("/contacts/new" as Href)} style={styles.primary}>
          <Text style={styles.primaryText}>重新选择文件</Text>
        </Pressable> : null}
      </> : null}
      {error ? <View style={styles.errorGroup}>
        <Text accessibilityRole="alert" style={styles.error}>{error}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="重新读取进度" onPress={() => { void read(true); }} style={styles.secondary}>
          <Text style={styles.secondaryText}>重新读取进度</Text>
        </Pressable>
      </View> : null}
    </ScrollView>
  </SafeAreaView>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  navigation: { flexDirection: "row", alignItems: "center", minHeight: 48, paddingHorizontal: 16 },
  back: { flex: 1, flexDirection: "row", alignItems: "center", minHeight: 44 },
  backLabel: { color: colors.accent, fontSize: 15, fontWeight: "600", flexShrink: 1 },
  navTitle: { color: colors.ink, fontSize: 16, fontWeight: "800", textAlign: "center", flex: 1 },
  navBalance: { flex: 1 },
  content: { alignSelf: "center", width: "100%", maxWidth: 540, padding: 16, paddingBottom: 40, gap: 16 },
  title: { color: colors.ink, fontSize: 22, lineHeight: 30, fontWeight: "800" },
  copy: { color: colors.text2, fontSize: 14, lineHeight: 22 },
  loading: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 24 },
  summary: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8, justifyContent: "space-between", paddingTop: 16 },
  sectionTitle: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  status: { color: colors.accent, fontSize: 13, fontWeight: "700" },
  track: { height: 4, backgroundColor: colors.surface2, overflow: "hidden", borderRadius: 2 },
  progress: { height: 4, backgroundColor: colors.accent },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: colors.border, minHeight: 48, paddingVertical: 12 },
  label: { color: colors.text3, fontSize: 14 },
  value: { color: colors.ink, fontSize: 15, fontWeight: "600" },
  notice: { color: colors.text2, fontSize: 14, lineHeight: 22, backgroundColor: colors.surface2, padding: 16, borderRadius: 12 },
  primary: { minHeight: 50, justifyContent: "center", alignItems: "center", padding: 12, backgroundColor: colors.ink, borderRadius: 12 },
  primaryText: { color: colors.surface, fontWeight: "700", fontSize: 16, textAlign: "center" },
  secondary: { minHeight: 48, justifyContent: "center", alignItems: "center", padding: 12, borderWidth: 1, borderColor: colors.ink, borderRadius: 12 },
  secondaryText: { color: colors.ink, fontSize: 15, fontWeight: "700", textAlign: "center" },
  disabled: { opacity: 0.5 },
  error: { color: colors.rose, fontSize: 14, lineHeight: 22 },
  errorGroup: { gap: 16 },
}));
