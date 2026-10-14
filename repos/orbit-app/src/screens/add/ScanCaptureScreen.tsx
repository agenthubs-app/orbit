// R12 `contacts/new/scan` 名刺をスキャン (DESIGN §2.2 steps 1–3, b11 A1 ①②, b1 B1 / B2, App):
//   はじめての方へ — the first three visits (counted on this device), 次回から表示しない,
//     「?」 opens it again;
//   permission — explain first, then ask; turned off: three steps + 設定を開く + 写真から選ぶ,
//     and the camera opens by itself when the person comes back from Settings;
//   camera — [表面][裏面], continuous shots, 「連続撮影 N枚 · あと M枚まで」 (100), a tray
//     (tap a photo to remove it), 裏なし, 完了 N; 写真から選ぶ picks several at once;
//   then the v2 batch is created, uploaded and finalized, and the batch page opens. The upload
//   runs in scan-upload-queue (R12 review m7): leaving this page does not stop it.
// No live frame hints and no auto-capture (§9 #6).
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { Fragment, useEffect, useRef, useState } from "react";
import { Image, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import type { PreparedBatchImage } from "../../api/batch-images";
import { AppScreen } from "../../components/AppScreen";
import { Button, Card, Chip, ConfirmDialog, Icon, IconButton, MacTile, ProgressBar, Segmented, Skeleton, UiPressable, UiText } from "../../components/ui";
import Svg, { Defs, RadialGradient, Rect, Stop } from "../../components/ui/svg";
import { createThemedStyles } from "../../design/theme";
import { radius } from "../../design/tokens";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { creationAttempt, type CreationAttempt, type IngestCardImage } from "../../view-models/business-card-ingest";
import { useAddApi } from "./add-api";
import { hideScanGuide, readScanGuide, recordScanGuideShown, shouldAutoShowGuide, type ScanGuideState } from "./add-storage";
import { Body, Caption, FadeIn, KIT_PAGE_INSET, useAddStyles } from "./add-ui";
import { KitChip } from "../plan/plan-kit";
import { KIT_FOOT_SPACE, KitFoot } from "./scan-kit";
import { newAddKey } from "./manual-model";
import { addFronts, addShot, canShootBack, cardCount, chooseSide, EMPTY_TRAY, remainingShots, removeShot, SCAN_MAX_PHOTOS, skipBack, trayImages, type ShotSide, type ShotTray } from "./scan-capture-model";
import { CardCamera, openAppSettings, pickCardImages, prepareCameraShot, uploadNative, useCameraAccess, type CardCameraHandle } from "./scan-media";
import { runScanUpload, startScanUpload, subscribeScanUpload, type ScanUploadState } from "./scan-upload-queue";

type Mode = "loading" | "guide" | "camera" | "upload";
type UploadState = { done: number; total: number; problem: "start" | "upload" | "unavailable" | null; busy: boolean };

export function scanBatchHref(batchId: string): string {
  return `/contacts/new/scan/${encodeURIComponent(batchId)}`;
}

export function ScanCaptureScreen() {
  const router = useRouter();
  const api = useAddApi();
  const { t } = useOrbitLocale();
  const { styles } = useAddStyles();
  const params = useLocalSearchParams<{ from?: string | string[] }>();
  const fromLegacy = (Array.isArray(params.from) ? params.from[0] : params.from) === "legacy";
  const [mode, setMode] = useState<Mode>("loading");
  const [guide, setGuide] = useState<ScanGuideState | null>(null);
  const [tray, setTray] = useState<ShotTray>(EMPTY_TRAY);
  const [notice, setNotice] = useState<"limit" | "pick" | "camera" | null>(null);
  const [upload, setUpload] = useState<UploadState>({ busy: false, done: 0, problem: null, total: 0 });
  const attempt = useRef<CreationAttempt | null>(null);
  const batchId = useRef<string | null>(null);
  const unwatch = useRef<(() => void) | null>(null);
  const ownerId = useOrbitAuthSession().actorId ?? null;
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; unwatch.current?.(); }, []);

  useEffect(() => {
    void (async () => {
      const state = await readScanGuide();
      if (!mounted.current) return;
      if (shouldAutoShowGuide(state)) {
        setGuide(await recordScanGuideShown(state));
        setMode("guide");
      } else {
        setGuide(state);
        setMode("camera");
      }
    })();
  }, []);

  async function pickPhotos(intoTray: boolean) {
    setNotice(null);
    try {
      const picked = await pickCardImages(remainingShots(tray));
      if (!picked || !mounted.current) return;
      const result = addFronts(intoTray ? tray : EMPTY_TRAY, picked.map((image) => ({ id: newAddKey("photo"), image })));
      if (result.leftOut > 0) setNotice("limit");
      if (intoTray) setTray(result.tray);
      else if (result.tray.shots.length) void startUpload(trayImages(result.tray));
    } catch {
      if (mounted.current) setNotice("pick");
    }
  }

  async function startUpload(images: IngestCardImage[]) {
    setMode("upload");
    setUpload({ busy: true, done: 0, problem: null, total: images.length });
    let submission: CreationAttempt;
    try {
      submission = creationAttempt(images, attempt.current, () => newAddKey("batch"));
    } catch {
      setUpload((current) => ({ ...current, busy: false, problem: "start" }));
      return;
    }
    attempt.current = submission;
    const created = await api.createBatch(submission);
    // Created while the person already left: the upload still starts (it does not need this page).
    if (!created.ok) {
      if (!mounted.current) return;
      setUpload((current) => ({ ...current, busy: false, problem: created.failure.kind === "notImplemented" ? "unavailable" : "start" }));
      return;
    }
    const files = new Map<string, PreparedBatchImage>();
    for (const item of created.data.items) {
      const image = images[item.seq - 1];
      if (image) files.set(item.id, image);
    }
    batchId.current = created.data.batch.id;
    // R12 review m7: the upload runs in the module-level queue, so leaving this page does not
    // stop it (the batch is finalized and read on the server; the batch page can watch / retry).
    watch(created.data.batch.id);
    await settled(await startScanUpload({ api, detail: created.data, files, native: uploadNative, ownerId }));
  }

  /** While this page is open it mirrors the queue's progress. */
  function watch(id: string) {
    unwatch.current?.();
    unwatch.current = subscribeScanUpload(ownerId, id, (state) => {
      if (mounted.current) setUpload({ busy: state.busy, done: state.done, problem: state.problem, total: state.total });
    });
  }

  /** Uploaded and reading: open the batch page (only if the person is still here). */
  async function settled(state: ScanUploadState) {
    if (state.finished && mounted.current) router.replace(scanBatchHref(state.batchId) as Href);
  }

  async function retryUpload() {
    const id = batchId.current;
    const running = id ? runScanUpload(ownerId, id) : null;
    if (!running) {
      void startUpload(trayImages(tray));
      return;
    }
    await settled(await running);
  }

  const helpButton = <IconButton icon="info" size={34} soft accessibilityLabel={t("add.scan.help")} onPress={() => setMode("guide")} />;

  if (mode === "camera") {
    return (
      <CameraMode
        tray={tray}
        notice={notice}
        onTray={setTray}
        onNotice={setNotice}
        onHelp={() => setMode("guide")}
        onPick={() => void pickPhotos(true)}
        onPickOnly={() => void pickPhotos(false)}
        onDone={() => void startUpload(trayImages(tray))}
        onClose={() => (router.canGoBack() ? router.back() : router.replace("/contacts/new" as Href))}
      />
    );
  }

  const guideOn = mode === "guide";
  return (
    <View style={{ flex: 1 }}>
    <AppScreen title={t("add.scan.title")} subtitle={guideOn ? t("add.scan.guideSub") : undefined} backIcon={guideOn ? "x" : "left"} headerActions={guideOn ? undefined : helpButton}>
      {fromLegacy && !guideOn ? <View style={styles.notice}><Body>{t("add.scan.legacyNotice")}</Body></View> : null}
      {mode === "loading" ? <Skeleton lines={4} /> : null}
      {mode === "guide" ? (
        <ScanGuide notice={notice} legacy={fromLegacy} />
      ) : null}
      {mode === "upload" ? (
        <FadeIn testID="add-scan-upload">
          <Card>
            <View style={styles.stack}>
              <UiText style={styles.title}>{t("add.scan.uploadingTitle", { done: upload.done, n: upload.total })}</UiText>
              <ProgressBar value={upload.total ? Math.round((upload.done / upload.total) * 100) : 0} accessibilityLabel={t("add.scan.uploadingTitle", { done: upload.done, n: upload.total })} />
              <Body>{t("add.scan.uploadingLead")}</Body>
              {upload.problem ? (
                <View style={[styles.notice, styles.noticeError]}>
                  <View style={styles.grow}>
                    <Caption tone="error">{t(upload.problem === "unavailable" ? "add.scan.unavailable" : upload.problem === "start" ? "add.scan.startFailed" : "add.scan.uploadFailed")}</Caption>
                  </View>
                </View>
              ) : null}
              {upload.problem && upload.problem !== "unavailable" ? <Button label={t("add.scan.retryUpload")} icon="refresh" onPress={() => void retryUpload()} loading={upload.busy} /> : null}
            </View>
          </Card>
        </FadeIn>
      ) : null}
    </AppScreen>
    {guideOn ? (
      <GuideFoot onCamera={() => setMode("camera")} onPick={() => void pickPhotos(false)} hidden={Boolean(guide?.hidden)}
        onHide={guide && !guide.hidden ? () => { void hideScanGuide(guide).then(setGuide); setMode("camera"); } : null} />
    ) : null}
    </View>
  );
}

/**
 * はじめての方へ (b11 A1 ①, App; 旧リンク N10 adds the teal note on top): a sample card in the camera frame,
 * うまく撮るコツ (4 tips, 連写 OK · 一度に最大 N枚), 撮ったあと (3 steps), the privacy note; カメラを開く,
 * 写真から選ぶ and 次回から表示しない sit in the bottom bar (GuideFoot, outside the scroll).
 */
function ScanGuide({ notice, legacy }: { notice: "limit" | "pick" | "camera" | null; legacy: boolean }) {
  const { t } = useOrbitLocale();
  const { colors, styles: g } = useGuideStyles();
  const tips: [string, string, string][] = [
    ["☀️", t("add.scan.tipLightTitle"), t("add.scan.tipLightBody")],
    ["📄", t("add.scan.tipFlatTitle"), t("add.scan.tipFlatBody")],
    ["⬜", t("add.scan.tipCornersTitle"), t("add.scan.tipCornersBody")],
    ["🔁", t("add.scan.tipBackTitle"), t("add.scan.tipBackBody")],
  ];
  return (
    <FadeIn testID="add-scan-guide" style={KIT_PAGE_INSET}>
      {legacy ? (
        <View style={g.mybar} testID="add-scan-legacy">
          <Icon name="check" size={16} color={colors.macTealText} />
          <UiText style={g.mybarText}>{t("add.scan.legacyNotice")}</UiText>
        </View>
      ) : null}
      <View style={g.frame}>
        <Svg style={StyleSheet.absoluteFill} width="100%" height={168}>
          <Defs>
            <RadialGradient id="scan-guide-frame" cx="50%" cy="50%" rx="260" ry="160" gradientUnits="userSpaceOnUse" fx="50%" fy="50%">
              <Stop offset={0} stopColor={colors.cam2} />
              <Stop offset={1} stopColor={colors.cam} />
            </RadialGradient>
          </Defs>
          <Rect x={0} y={0} width="100%" height={168} rx={22} fill="url(#scan-guide-frame)" />
        </Svg>
        <View style={g.mcard}>
          <UiText style={g.pCo}>{t("add.scan.sampleCompany")}</UiText>
          <UiText style={g.pR}>{t("add.scan.sampleRole")}</UiText>
          <UiText style={g.pN}>{t("add.scan.sampleName")}</UiText>
          <UiText style={g.pM}>{t("add.scan.sampleContact")}</UiText>
        </View>
        <View style={[g.corner, g.c1]} /><View style={[g.corner, g.c2]} /><View style={[g.corner, g.c3]} /><View style={[g.corner, g.c4]} />
      </View>
      <View style={g.card}>
        <View style={g.cardH}>
          <UiText accessibilityRole="header" style={g.h3}>{t("add.scan.tipsTitle")}</UiText>
          <KitChip label={t("add.scan.guideLimit", { max: SCAN_MAX_PHOTOS })} tone="lav" />
        </View>
        <View style={g.tip4}>
          {tips.map(([emoji, title, body]) => (
            <View key={title} style={g.tip}>
              <UiText style={g.tipEmoji}>{emoji}</UiText>
              <View style={g.grow}>
                <UiText style={g.tipTitle}>{title}</UiText>
                <UiText style={g.tipBody}>{body}</UiText>
              </View>
            </View>
          ))}
        </View>
      </View>
      <AfterSteps />
      <View style={g.priv}>
        <UiText style={g.privEmoji}>🔒</UiText>
        <UiText style={g.privText}>{t("add.scan.privacyBefore")}<UiText style={g.privStrong}>{t("add.scan.privacyStrong")}</UiText>{t("add.scan.privacyAfter")}</UiText>
      </View>
      {notice ? <View style={g.noticeGap}><Caption tone="error">{t(notice === "limit" ? "add.scan.limitReached" : notice === "pick" ? "add.scan.pickFailed" : "add.scan.cameraFailed", { max: SCAN_MAX_PHOTOS })}</Caption></View> : null}
      <View style={{ height: KIT_FOOT_SPACE }} />
    </FadeIn>
  );
}

/** The guide's bottom bar: カメラを開く (xl), then 写真から選ぶ (link) · 次回から表示しない (check). */
function GuideFoot({ onCamera, onPick, hidden, onHide }: { onCamera: () => void; onPick: () => void; hidden: boolean; onHide: (() => void) | null }) {
  const { t } = useOrbitLocale();
  const { colors, styles: g } = useGuideStyles();
  return (
    <KitFoot>
      <UiPressable accessibilityRole="button" accessibilityLabel={t("add.scan.openCamera")} onPress={onCamera} style={g.xl} testID="add-scan-open-camera">
        <Icon name="scan" size={16} color={colors.bg} />
        <UiText style={g.xlText}>{t("add.scan.openCamera")}</UiText>
      </UiPressable>
      <View style={g.footRow}>
        <UiPressable accessibilityRole="button" accessibilityLabel={t("add.scan.pickPhotos")} hitSlop={12} onPress={onPick} style={g.lnkRow} testID="add-scan-pick">
          <Icon name="image" size={16} color={colors.accent} />
          <UiText style={g.lnk}>{t("add.scan.pickPhotos")}</UiText>
        </UiPressable>
        {onHide || hidden ? (
          <UiPressable accessibilityRole="button" accessibilityLabel={t("add.scan.dontShow")} accessibilityState={{ selected: hidden, disabled: !onHide }} hitSlop={12} disabled={!onHide} onPress={onHide ?? undefined} style={g.chk} testID="add-scan-dont-show">
            <View style={[g.chkBox, hidden && { backgroundColor: colors.plum700, borderColor: colors.plum700 }]}>{hidden ? <Icon name="check" size={16} color={colors.surface} /> : null}</View>
            <UiText style={g.chkText}>{t("add.scan.dontShow")}</UiText>
          </UiPressable>
        ) : null}
      </View>
    </KitFoot>
  );
}

/** 撮ったあと (b11 A1 ①): AI が読み取る → 例外だけ確認 → 全員 人脈へ (kit .st3). */
export function AfterSteps() {
  const { t } = useOrbitLocale();
  const { colors, styles: g } = useGuideStyles();
  const steps: [string, string, string][] = [
    ["🤖", t("add.scan.afterRead"), t("add.scan.afterReadSub")],
    ["✅", t("add.scan.afterCheck"), t("add.scan.afterCheckSub")],
    ["👥", t("add.scan.afterAdd"), t("add.scan.afterAddSub")],
  ];
  return (
    <View style={[g.card, g.cardNext]} testID="add-scan-after">
      <View style={g.cardH}><UiText style={g.h3}>{t("add.scan.afterTitle")}</UiText></View>
      <View style={g.st3}>
        {steps.map(([emoji, title, sub], index) => (
          <Fragment key={title}>
            {index ? <View style={g.ar}><Icon name="right" size={16} color={colors.ink4} /></View> : null}
            <View style={g.step}>
              <UiText style={g.stepEmoji}>{emoji}</UiText>
              <UiText numberOfLines={2} style={g.stepTitle}>{title}</UiText>
              <UiText numberOfLines={2} style={g.stepSub}>{sub}</UiText>
            </View>
          </Fragment>
        ))}
      </View>
    </View>
  );
}

// kit 数值（b11 #0 / b12 N10）：.sg-frame / .mcard / .card / .tip4 / .st3 / .card.flat 隐私 / .mybar / .foot。
const useGuideStyles = createThemedStyles((colors) => StyleSheet.create({
  mybar: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 14, backgroundColor: colors.macTeal, marginBottom: 12 },
  mybarText: { flex: 1, fontSize: 12, fontWeight: "700", lineHeight: 17.4, color: colors.macTealText },
  frame: { height: 168, borderRadius: 22, overflow: "hidden", alignItems: "center", justifyContent: "center", marginBottom: 12 },
  mcard: { width: 220, height: 220 * 55 / 91, backgroundColor: colors.paper, borderRadius: 5, paddingVertical: 13, paddingHorizontal: 15, transform: [{ rotate: "-3deg" }, { scale: 0.9 }], shadowColor: colors.cam, shadowOpacity: 0.45, shadowRadius: 12, shadowOffset: { width: 0, height: 10 } },
  pCo: { fontSize: 8.5, fontWeight: "700", letterSpacing: 0.34, color: colors.paperInk2, lineHeight: 12.75 },
  pR: { marginTop: "auto", fontSize: 7.5, color: colors.paperInk2, lineHeight: 11.25 },
  pN: { fontSize: 17, fontWeight: "800", letterSpacing: 1.02, fontFamily: "Hiragino Mincho ProN", color: colors.paperInk, lineHeight: 25.5 },
  pM: { marginTop: 7, fontSize: 7, lineHeight: 10.5, color: colors.paperInk2 },
  corner: { position: "absolute", width: 20, height: 20, borderColor: colors.camInk },
  c1: { left: 58, top: 22, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 7 },
  c2: { right: 58, top: 22, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 7 },
  c3: { left: 58, bottom: 22, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 7 },
  c4: { right: 58, bottom: 22, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 7 },
  card: { backgroundColor: colors.surface, borderRadius: 24, padding: 14 },
  cardNext: { marginTop: 12 },
  cardH: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 },
  h3: { fontSize: 14.5, fontWeight: "800", lineHeight: 21.75, color: colors.ink },
  tip4: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tip: { width: "48.5%", flexGrow: 1, flexBasis: "45%", flexDirection: "row", alignItems: "flex-start", gap: 8, paddingVertical: 9, paddingHorizontal: 10, borderRadius: 14, backgroundColor: colors.surface2 },
  // iOS 的 Apple Color Emoji 比 Chrome 宽约 2pt：盒子定成 kit 的字宽。
  tipEmoji: { fontSize: 17, lineHeight: 20.4, width: 21 },
  grow: { flex: 1, minWidth: 0 },
  tipTitle: { fontSize: 12, fontWeight: "700", lineHeight: 18, color: colors.ink },
  tipBody: { fontSize: 10.5, lineHeight: 14.7, color: colors.ink3 },
  st3: { flexDirection: "row", alignItems: "center", gap: 2 },
  step: { flex: 1, minWidth: 0, backgroundColor: colors.surface2, borderRadius: 14, paddingVertical: 9, paddingHorizontal: 4, alignItems: "center" },
  stepEmoji: { fontSize: 18, lineHeight: 23.4 },
  stepTitle: { fontSize: 11.5, fontWeight: "700", lineHeight: 15.5, color: colors.ink, textAlign: "center" },
  stepSub: { marginTop: 2, fontSize: 10, lineHeight: 13.5, color: colors.ink3, textAlign: "center" },
  ar: { width: 16, alignItems: "center" },
  priv: { marginTop: 12, flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 24, backgroundColor: colors.surface2 },
  privEmoji: { fontSize: 18, width: 21 },
  privText: { flex: 1, fontSize: 11.5, fontWeight: "500", lineHeight: 18.4, color: colors.ink2 },
  privStrong: { fontWeight: "700", color: colors.ink },
  noticeGap: { marginTop: 12 },
  xl: { height: 50, borderRadius: 999, backgroundColor: colors.ink, flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center" },
  xlText: { fontSize: 14.5, fontWeight: "700", lineHeight: 21.75, color: colors.bg },
  footRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4 },
  lnk: { fontSize: 13, fontWeight: "700", lineHeight: 19.5, color: colors.accent },
  // kit 有两条 .chk：后一条改成行内、间距 6，前一条的上下 padding 10 仍在。
  chk: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 10 },
  lnkRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  chkBox: { width: 16, height: 16, borderRadius: 5, borderWidth: 1.6, borderColor: colors.ink4, alignItems: "center", justifyContent: "center" },
  chkText: { fontSize: 12, fontWeight: "600", lineHeight: 18, color: colors.ink2 },
}));

/** Explain first, then ask; turned off: the way to Settings (b1 B1 ①②). */
export function CameraPermissionPanel({ access, onAllow, onPick }: { access: "unknown" | "ask" | "denied"; onAllow: () => void; onPick: () => void }) {
  const { t } = useOrbitLocale();
  const { styles } = useAddStyles();
  if (access === "unknown") return <Skeleton lines={3} />;
  if (access === "ask") {
    return (
      <FadeIn testID="add-scan-permission">
        <View style={styles.stack}>
          <MacTile emoji="📷" tone="lav" />
          <UiText accessibilityRole="header" style={styles.title}>{t("add.scan.permissionTitle")}</UiText>
          <Body>{t("add.scan.permissionLead")}</Body>
          <Card variant="flat">
            <View style={styles.tightStack}>
              {(["add.scan.permissionPoint1", "add.scan.permissionPoint2", "add.scan.permissionPoint3"] as const).map((key) => <Body key={key}>{t(key)}</Body>)}
            </View>
          </Card>
          <Button variant="primary" block icon="camera" label={t("add.scan.allowCamera")} onPress={onAllow} />
          <Button variant="secondary" block icon="images" label={t("add.scan.pickPhotos")} onPress={onPick} />
        </View>
      </FadeIn>
    );
  }
  return (
    <FadeIn testID="add-scan-denied">
      <View style={styles.stack}>
        <MacTile emoji="📷" tone="pink" />
        <UiText accessibilityRole="header" style={styles.title}>{t("add.scan.deniedTitle")}</UiText>
        <Body>{t("add.scan.deniedLead")}</Body>
        <Card variant="flat">
          <View style={styles.tightStack}>
            {(["add.scan.deniedStep1", "add.scan.deniedStep2", "add.scan.deniedStep3"] as const).map((key, index) => (
              <View key={key} style={styles.row}>
                <Chip label={String(index + 1)} tone="lav" />
                <Body>{t(key)}</Body>
              </View>
            ))}
          </View>
        </Card>
        <Caption>{t("add.scan.deniedReturn")}</Caption>
        <Button variant="primary" block icon="settings" label={t("add.scan.openSettings")} onPress={openAppSettings} />
        <Button variant="secondary" block icon="images" label={t("add.scan.pickPhotos")} onPress={onPick} />
      </View>
    </FadeIn>
  );
}

function CameraMode({ tray, notice, onTray, onNotice, onHelp, onPick, onPickOnly, onDone, onClose }: {
  tray: ShotTray;
  notice: "limit" | "pick" | "camera" | null;
  onTray: (tray: ShotTray) => void;
  onNotice: (notice: "limit" | "pick" | "camera" | null) => void;
  onHelp: () => void;
  onPick: () => void;
  onPickOnly: () => void;
  onDone: () => void;
  onClose: () => void;
}) {
  const { t } = useOrbitLocale();
  const { access, request } = useCameraAccess();
  const [discarding, setDiscarding] = useState(false);
  const close = () => (tray.shots.length ? setDiscarding(true) : onClose());
  if (access !== "granted") {
    return (
      <AppScreen title={t("add.scan.title")} headerActions={<IconButton icon="info" size={34} soft accessibilityLabel={t("add.scan.help")} onPress={onHelp} />}>
        <CameraPermissionPanel access={access} onAllow={() => void request()} onPick={onPickOnly} />
        {notice ? <Caption tone="error">{t(notice === "limit" ? "add.scan.limitReached" : notice === "pick" ? "add.scan.pickFailed" : "add.scan.cameraFailed", { max: SCAN_MAX_PHOTOS })}</Caption> : null}
      </AppScreen>
    );
  }
  return (
    <>
      <CardCameraPane
        mode="batch"
        tray={tray}
        notice={notice}
        onTray={onTray}
        onNotice={onNotice}
        onHelp={onHelp}
        onPick={onPick}
        onDone={onDone}
        onClose={close}
      />
      <ConfirmDialog
        visible={discarding}
        title={t("add.scan.discardTitle")}
        message={t("add.scan.discardBody", { n: tray.shots.length })}
        confirmLabel={t("add.scan.discardConfirm")}
        cancelLabel={t("add.scan.keepShooting")}
        destructive
        onConfirm={() => { setDiscarding(false); onClose(); }}
        onCancel={() => setDiscarding(false)}
      />
    </>
  );
}

/**
 * The camera itself. `batch`: [表面][裏面], tray, 裏なし, 完了 N. `single` (撮り直す on the
 * batch page): one photo, no sides, no tray — it is handed back straight away.
 */
export function CardCameraPane({ mode, tray, notice, onTray, onNotice, onHelp, onPick, onDone, onClose, onSingle }: {
  mode: "batch" | "single";
  tray: ShotTray;
  notice: "limit" | "pick" | "camera" | null;
  onTray: (tray: ShotTray) => void;
  onNotice: (notice: "limit" | "pick" | "camera" | null) => void;
  onHelp?: () => void;
  onPick?: () => void;
  onDone?: () => void;
  onClose: () => void;
  onSingle?: (image: PreparedBatchImage) => void;
}) {
  const { t } = useOrbitLocale();
  const { colors, styles } = useCameraStyles();
  const camera = useRef<CardCameraHandle>(null);
  const [shooting, setShooting] = useState(false);
  const left = remainingShots(tray);
  const count = tray.shots.length;
  async function shoot() {
    if (shooting || (mode === "batch" && left === 0)) return;
    setShooting(true);
    onNotice(null);
    try {
      const uri = await camera.current?.takePhoto();
      if (!uri) { onNotice("camera"); return; }
      const image = await prepareCameraShot(uri);
      if (mode === "single") onSingle?.(image);
      else onTray(addShot(tray, image, newAddKey("shot")));
    } catch {
      onNotice("camera");
    } finally {
      setShooting(false);
    }
  }
  const sides: { key: ShotSide; label: string }[] = [{ key: "front", label: t("add.scan.sideFront") }, { key: "back", label: t("add.scan.sideBack") }];
  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.fill} testID="add-scan-camera">
      <View style={styles.topBar}>
        <IconButton icon="x" size={34} accessibilityLabel={t("add.scan.close")} onPress={onClose} />
        {mode === "batch" ? (
          <View style={styles.segment}>
            <Segmented segments={sides} value={tray.side} accessibilityLabel={t("add.scan.sides")} onChange={(side) => onTray(chooseSide(tray, side))} />
          </View>
        ) : <View style={styles.segment} />}
        {onHelp ? <IconButton icon="info" size={34} accessibilityLabel={t("add.scan.help")} onPress={onHelp} /> : <View style={styles.spacer} />}
      </View>
      <View style={styles.viewfinder}>
        <CardCamera ref={camera} style={StyleSheet.absoluteFill} />
        <View pointerEvents="none" style={styles.frame} />
      </View>
      <View style={styles.panel}>
        {mode === "batch" ? <UiText style={styles.onImage} testID="add-scan-counter">{t("add.scan.counter", { left, n: count })}</UiText> : null}
        {mode === "batch" && tray.side === "back" ? (
          <View style={styles.hintRow}>
            <UiText style={[styles.onImage, styles.hint]}>{t("add.scan.backHint")}</UiText>
            <Button size="sm" variant="secondary" label={t("add.scan.noBack")} onPress={() => onTray(skipBack(tray))} />
          </View>
        ) : null}
        {notice ? <UiText accessibilityRole="alert" style={[styles.onImage, styles.hint]}>{t(notice === "limit" ? "add.scan.limitReached" : notice === "pick" ? "add.scan.pickFailed" : "add.scan.cameraFailed", { max: SCAN_MAX_PHOTOS })}</UiText> : null}
        {mode === "batch" && count ? (
          <ScrollView horizontal contentContainerStyle={styles.tray} testID="add-scan-tray">
            {tray.shots.map((shot, index) => (
              <UiPressable key={shot.id} testID={`add-scan-shot-${shot.side}`} accessibilityRole="button" accessibilityLabel={t("add.scan.removeShot", { n: index + 1 })} onPress={() => onTray(removeShot(tray, shot.id))} style={styles.thumbWrap}>
                <Image source={{ uri: shot.image.uri }} style={styles.thumb} />
                {shot.side === "back" ? <View style={styles.thumbBadge}><Chip label={t("add.scan.trayBack")} tone="lav" /></View> : null}
              </UiPressable>
            ))}
          </ScrollView>
        ) : null}
        <View style={styles.controls}>
          <View style={styles.side}>{onPick ? <IconButton icon="images" accessibilityLabel={t("add.scan.pickPhotos")} onPress={onPick} /> : null}</View>
          <UiPressable testID="add-scan-shutter" accessibilityRole="button" accessibilityLabel={t("add.scan.shutter")} accessibilityState={{ disabled: shooting || (mode === "batch" && left === 0) }} onPress={() => void shoot()} style={[styles.shutter, { borderColor: colors.onImage }]}>
            <View style={[styles.shutterInner, { backgroundColor: colors.onImage }]} />
          </UiPressable>
          <View style={styles.side}>
            {mode === "batch" ? <Button variant="primary" size="sm" label={t("add.scan.done", { n: cardCount(tray) })} disabled={!count} onPress={() => onDone?.()} /> : null}
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

/** Camera chrome is drawn over the live image: a fixed dark ground in both themes. */
const useCameraStyles = createThemedStyles((colors) => StyleSheet.create({
  fill: { backgroundColor: colors.onImageBadge, flex: 1 },
  topBar: { alignItems: "center", flexDirection: "row", gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  segment: { flex: 1 },
  spacer: { width: 34 },
  viewfinder: { flex: 1, justifyContent: "center", overflow: "hidden" },
  frame: { alignSelf: "center", aspectRatio: 1.7, borderColor: colors.onImage, borderRadius: radius.md, borderWidth: 2, opacity: 0.8, width: "86%" },
  panel: { gap: 8, paddingBottom: 12, paddingHorizontal: 16, paddingTop: 10 },
  onImage: { color: colors.onImage, fontSize: 13, fontWeight: "700", textAlign: "center" },
  hint: { fontWeight: "600", flexShrink: 1 },
  hintRow: { alignItems: "center", flexDirection: "row", gap: 8, justifyContent: "center" },
  tray: { gap: 8, paddingVertical: 4 },
  thumbWrap: { borderRadius: radius.tag, overflow: "hidden" },
  thumb: { backgroundColor: colors.ink2, height: 44, width: 72 },
  thumbBadge: { bottom: 2, position: "absolute", right: 2 },
  controls: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  side: { alignItems: "center", minWidth: 96 },
  shutter: { alignItems: "center", borderRadius: 38, borderWidth: 4, height: 76, justifyContent: "center", width: 76 },
  shutterInner: { borderRadius: 30, height: 60, width: 60 },
}));

