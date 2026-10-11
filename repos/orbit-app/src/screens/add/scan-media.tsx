// R12 名刺をスキャン: the device boundary of the scan screens — the camera (expo-camera),
// the camera permission (先に説明、拒否なら設定へ; re-checked when the app comes back to
// the front), the photo picker (expo-image-picker, several at once) and turning a photo
// into an upload-ready image (src/api/batch-images: size limit, re-encode, digest).
// Kept in one module so render tests replace the device and nothing else.
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";
import { AppState, Linking, type StyleProp, type ViewStyle } from "react-native";

import { prepareBatchImage, prepareBatchImages, readPreparedBatchImage, type BatchImageNative, type PreparedBatchImage } from "../../api/batch-images";

export type CameraAccess = "unknown" | "granted" | "ask" | "denied";

/** The camera permission as the scan screen needs it; re-read whenever the app returns to the front. */
export function useCameraAccess(): { access: CameraAccess; request: () => Promise<CameraAccess>; recheck: () => Promise<CameraAccess> } {
  const [permission, requestPermission, getPermission] = useCameraPermissions();
  const toAccess = (value: { granted: boolean; canAskAgain: boolean } | null | undefined): CameraAccess =>
    !value ? "unknown" : value.granted ? "granted" : value.canAskAgain ? "ask" : "denied";
  const recheck = useCallback(async () => toAccess(await getPermission()), [getPermission]);
  const request = useCallback(async () => toAccess(await requestPermission()), [requestPermission]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => { if (state === "active") void recheck(); });
    return () => subscription.remove();
  }, [recheck]);
  return { access: toAccess(permission), recheck, request };
}

export interface CardCameraHandle {
  /** Takes one photo; null when the camera could not take it. */
  takePhoto(): Promise<string | null>;
}

export const CardCamera = forwardRef<CardCameraHandle, { style?: StyleProp<ViewStyle> }>(function CardCamera({ style }, ref) {
  const camera = useRef<CameraView>(null);
  useImperativeHandle(ref, () => ({
    async takePhoto() {
      try {
        const photo = await camera.current?.takePictureAsync({ quality: 0.85 });
        return photo?.uri ?? null;
      } catch {
        return null;
      }
    },
  }), []);
  return <CameraView ref={camera} facing="back" style={style} />;
});

let shotSequence = 0;
/** A camera photo as an upload-ready image (re-encoded when it is over the upload limit). */
export async function prepareCameraShot(uri: string): Promise<PreparedBatchImage> {
  shotSequence += 1;
  return prepareBatchImage({ fileName: `card-${Date.now()}-${shotSequence}.jpg`, mimeType: "image/jpeg", uri });
}

const pickerOptions: ImagePicker.ImagePickerOptions = {
  allowsEditing: false,
  allowsMultipleSelection: true,
  base64: false,
  mediaTypes: ["images"],
  preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
  quality: 1,
};

/** 写真から選ぶ: several photos at once; null when the person closed the picker. */
export async function pickCardImages(limit: number): Promise<PreparedBatchImage[] | null> {
  const selection = await ImagePicker.launchImageLibraryAsync({ ...pickerOptions, selectionLimit: Math.max(1, limit) });
  if (selection.canceled) return null;
  return prepareBatchImages(selection.assets);
}

/** The bytes of a prepared image (for 撮り直す, which replaces one photo in place). */
export function preparedImageBytes(image: PreparedBatchImage): Promise<Uint8Array<ArrayBuffer>> {
  return readPreparedBatchImage(image);
}

/** Upload reads the files through the default device boundary. */
export const uploadNative: BatchImageNative | undefined = undefined;

export function openAppSettings(): void {
  void Linking.openSettings().catch(() => undefined);
}
