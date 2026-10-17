// R17 受付 · QR 読み取り（b12 #428）：expo-camera 取景（QR v2 → POST …/check-ins/scan），「名前で探す」退回。单独成文件，渲染测试不加载相机。
import { CameraView } from "expo-camera";
import { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";

import { BottomSheet, UiPressable, UiText, useToast } from "../../components/ui";
import { useCameraAccess } from "../add/scan-media";
import type { HostApi } from "./host-api";
import type { HostT } from "./host-model";
import { useKioskStyles } from "./check-in-view";

/** QR 読み取り（b12 #428）：深色取景弹层；读到 QR v2 → scan；「名前で探す」退回。 */
export function QrSheet({ visible, onClose, onDone, t, api, eventId }: { visible: boolean; onClose: () => void; onDone: () => void; t: HostT; api: HostApi; eventId: string }) {
  const { styles } = useKioskStyles();
  const toast = useToast();
  const camera = useCameraAccess();
  const reading = useRef(false);
  useEffect(() => { if (visible && camera.access === "ask") void camera.request(); }, [camera, visible]);
  const onScan = async (payload: string) => {
    if (reading.current) return;
    reading.current = true;
    const res = await api.scan(eventId, payload);
    reading.current = false;
    if (res.ok) { toast.success(res.data.duplicate ? t("kDup", { name: res.data.name }) : res.data.table ? t("kDoneTable", { name: res.data.name, t: res.data.table }) : t("kDone", { name: res.data.name })); onDone(); return; }
    toast.error(res.code === "WAITLISTED" ? t("kWaitlistedErr") : res.reason === "network" ? t("kOfflineAction") : t("kQrInvalid"));
  };
  return (
    <BottomSheet visible={visible} onClose={onClose} accessibilityLabel={t("kQrTitle")}>
      <View style={styles.qrSheet} testID="host-qr-sheet">
        <View style={styles.viewfinder}>
          {visible && camera.access === "granted" ? <CameraView style={StyleSheet.absoluteFill} facing="back" barcodeScannerSettings={{ barcodeTypes: ["qr"] }} onBarcodeScanned={(result) => void onScan(result.data)} /> : null}
        </View>
        <UiText style={styles.qrTitle}>{t("kQrTitle")}</UiText>
        <UiText style={styles.qrSub}>{camera.access === "denied" ? t("appQrDenied") : t("appQrReading")}</UiText>
        <UiPressable accessibilityRole="button" accessibilityLabel={t("kQrByName")} onPress={onClose} style={styles.qrBtn}><UiText style={styles.qrBtnText}>{t("kQrByName")}</UiText></UiPressable>
      </View>
    </BottomSheet>
  );
}

