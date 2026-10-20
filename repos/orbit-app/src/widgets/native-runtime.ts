import * as Crypto from "expo-crypto";
import { requireOptionalNativeModule } from "expo";
import Constants from "expo-constants";
import { Platform } from "react-native";

import { createWidgetSnapshotRuntime, type NativeWidgetSnapshotStore } from "./runtime";

// 主会话代定 §R19-10: an unsigned/default host never asks for the shared container.
const native = Platform.OS === "ios" && Constants.expoConfig?.extra?.widgetkitEnabled === true
  ? requireOptionalNativeModule<NativeWidgetSnapshotStore>("OrbitWidgetSnapshot") : null;

export const widgetSnapshotRuntime = createWidgetSnapshotRuntime({
  native,
  hashScope: (baseUrl, actorId) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${baseUrl}\u0000${actorId}`),
  diagnoseUnavailable: code => { if (Platform.OS === "ios") console.info(code); },
});
