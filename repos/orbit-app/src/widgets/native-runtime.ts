import * as Crypto from "expo-crypto";
import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";

import { createWidgetSnapshotRuntime, type NativeWidgetSnapshotStore } from "./runtime";

const native = Platform.OS === "ios" ? requireOptionalNativeModule<NativeWidgetSnapshotStore>("OrbitWidgetSnapshot") : null;
if (Platform.OS === "ios" && !native) console.warn("WIDGET_NATIVE_MODULE_UNAVAILABLE");

export const widgetSnapshotRuntime = createWidgetSnapshotRuntime({
  native,
  hashScope: (baseUrl, actorId) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${baseUrl}\u0000${actorId}`),
});
