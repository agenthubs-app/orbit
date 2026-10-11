// R12 `contacts/new/scan` 名刺をスキャン (DESIGN §2.2 steps 1–3, b11 A1 ①②, b1 B1 / B2, App):
//   はじめての方へ — the first three visits (counted on this device), 次回から表示しない,
//     「?」 opens it again;
//   permission — explain first, then ask; turned off: three steps + 設定を開く + 写真から選ぶ,
//     and the camera opens by itself when the person comes back from Settings;
//   camera — [表面][裏面], continuous shots, 「連続撮影 N枚 · あと M枚まで」 (100), a tray
//     (tap a photo to remove it), 裏なし, 完了 N; 写真から選ぶ picks several at once;
//   then the v2 batch is created, uploaded and finalized, and the batch page opens.
// No live frame hints and no auto-capture (§9 #6).
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Image, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type { IngestBatchDetailContract } from "../../api/contract/business-card-batch";
import type { PreparedBatchImage } from "../../api/batch-images";
import { AppScreen } from "../../components/AppScreen";
import { Button, Card, Chip, ConfirmDialog, IconButton, MacTile, ProgressBar, Segmented, Skeleton, UiPressable, UiText } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import { radius } from "../../design/tokens";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { creationAttempt, type CreationAttempt, type IngestCardImage } from "../../view-models/business-card-ingest";
import { useAddApi } from "./add-api";
import { hideScanGuide, readScanGuide, recordScanGuideShown, shouldAutoShowGuide, type ScanGuideState } from "./add-storage";
import { Body, Caption, FadeIn, useAddStyles } from "./add-ui";
import { newAddKey } from "./manual-model";
import { addFronts, addShot, canShootBack, cardCount, chooseSide, EMPTY_TRAY, remainingShots, removeShot, SCAN_MAX_PHOTOS, skipBack, trayImages, type ShotSide, type ShotTray } from "./scan-capture-model";
import { CardCamera, openAppSettings, pickCardImages, prepareCameraShot, uploadNative, useCameraAccess, type CardCameraHandle } from "./scan-media";

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
  const batch = useRef<{ detail: IngestBatchDetailContract; files: Map<string, PreparedBatchImage> } | null>(null);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

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
    if (!mounted.current) return;
    if (!created.ok) {
      setUpload((current) => ({ ...current, busy: false, problem: created.failure.kind === "notImplemented" ? "unavailable" : "start" }));
      return;
    }
    const files = new Map<string, PreparedBatchImage>();
    for (const item of created.data.items) {
      const image = images[item.seq - 1];
      if (image) files.set(item.id, image);
    }
    batch.current = { detail: created.data, files };
    await pump();
  }

  /** Uploads what is still waiting, then starts reading and opens the batch page. */
  async function pump() {
    const current = batch.current;
    if (!current) return;
    setUpload((state) => ({ ...state, busy: true, problem: null }));
    const controller = new AbortController();
    const result = await api.uploadPending(current.detail, current.files, controller.signal, uploadNative);
    if (!mounted.current) return;
    const uploaded = new Map(result.uploaded.map((item) => [item.id, item]));
    const detail = { ...current.detail, items: current.detail.items.map((item) => uploaded.get(item.id) ?? item) };
    batch.current = { ...current, detail };
    const done = detail.items.filter((item) => item.status !== "awaiting_upload").length;
    if (result.failed.length || detail.items.some((item) => item.status === "awaiting_upload")) {
      setUpload((state) => ({ ...state, busy: false, done, problem: "upload" }));
      return;
    }
    setUpload((state) => ({ ...state, done }));
    const finalized = await api.finalize(detail.batch.id);
    if (!mounted.current) return;
    if (!finalized.ok) {
      setUpload((state) => ({ ...state, busy: false, problem: "upload" }));
      return;
    }
    router.replace(scanBatchHref(detail.batch.id) as Href);
  }

  async function retryUpload() {
    const current = batch.current;
    if (!current) {
      void startUpload(trayImages(tray));
      return;
    }
    const fresh = await api.getBatch(current.detail.batch.id, current.detail.batch.actorId);
    if (!mounted.current) return;
    if (fresh.ok) batch.current = { ...current, detail: fresh.data };
    if (fresh.ok && fresh.data.batch.status !== "collecting") {
      router.replace(scanBatchHref(fresh.data.batch.id) as Href);
      return;
    }
    await pump();
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

  return (
    <AppScreen title={t("add.scan.title")} headerActions={mode === "guide" ? undefined : helpButton}>
      {fromLegacy ? <View style={styles.notice}><Body>{t("add.scan.legacyNotice")}</Body></View> : null}
      {mode === "loading" ? <Skeleton lines={4} /> : null}
      {mode === "guide" ? (
        <ScanGuide
          notice={notice}
          onCamera={() => setMode("camera")}
          onPick={() => void pickPhotos(false)}
          onHide={guide && !guide.hidden ? () => { void hideScanGuide(guide).then(setGuide); setMode("camera"); } : null}
        />
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
  );
}

function ScanGuide({ notice, onCamera, onPick, onHide }: { notice: "limit" | "pick" | "camera" | null; onCamera: () => void; onPick: () => void; onHide: (() => void) | null }) {
  const { t } = useOrbitLocale();
  const { styles } = useAddStyles();
  const tips: [string, string, string][] = [
    ["☀️", t("add.scan.tipLightTitle"), t("add.scan.tipLightBody")],
    ["📄", t("add.scan.tipFlatTitle"), t("add.scan.tipFlatBody")],
    ["⬜", t("add.scan.tipCornersTitle"), t("add.scan.tipCornersBody")],
    ["🔁", t("add.scan.tipBackTitle"), t("add.scan.tipBackBody")],
  ];
  return (
    <FadeIn testID="add-scan-guide">
      <View style={styles.stack}>
        <View style={styles.tightStack}>
          <UiText accessibilityRole="header" style={styles.title}>{t("add.scan.guideTitle")}</UiText>
          <Caption>{t("add.scan.guideLead")}</Caption>
        </View>
        <Card>
          <View style={styles.stack}>
            <Chip label={t("add.scan.guideLimit", { max: SCAN_MAX_PHOTOS })} tone="lav" />
            {tips.map(([emoji, title, body]) => (
              <View key={title} style={styles.row}>
                <MacTile emoji={emoji} size="sm" tone="apricot" />
                <View style={styles.grow}>
                  <UiText style={styles.strong}>{title}</UiText>
                  <Caption>{body}</Caption>
                </View>
              </View>
            ))}
          </View>
        </Card>
        <AfterSteps />
        {notice ? <Caption tone="error">{t(notice === "limit" ? "add.scan.limitReached" : notice === "pick" ? "add.scan.pickFailed" : "add.scan.cameraFailed", { max: SCAN_MAX_PHOTOS })}</Caption> : null}
        <Button variant="primary" block icon="camera" label={t("add.scan.openCamera")} onPress={onCamera} />
        <Button variant="secondary" block icon="images" label={t("add.scan.pickPhotos")} onPress={onPick} />
        {onHide ? <Button variant="ghost" label={t("add.scan.dontShow")} onPress={onHide} /> : null}
      </View>
    </FadeIn>
  );
}

export function AfterSteps() {
  const { t } = useOrbitLocale();
  const { styles } = useAddStyles();
  return (
    <Card variant="flat">
      <View style={styles.tightStack}>
        <UiText style={styles.strong}>{t("add.scan.afterTitle")}</UiText>
        <View style={styles.row}>
          <Chip label={t("add.scan.afterRead")} />
          <Chip label={t("add.scan.afterCheck")} />
          <Chip label={t("add.scan.afterAdd")} tone="ok" />
        </View>
        <Caption>{t("add.scan.privacy")}</Caption>
      </View>
    </Card>
  );
}

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

