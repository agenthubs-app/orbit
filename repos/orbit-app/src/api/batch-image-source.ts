export interface BrowserBatchImageFile {
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface BatchImageSourceInput {
  uri: string;
  file?: BrowserBatchImageFile | null;
}

export interface OpenBatchImageSource {
  exists: boolean;
  size: number;
  bytes(): Promise<Uint8Array<ArrayBuffer>>;
}

export function isSupportedBatchImageSource(uri: string): boolean {
  return uri.startsWith("file://") || uri.startsWith("content://");
}

export async function openBatchImageSource(
  input: BatchImageSourceInput
): Promise<OpenBatchImageSource> {
  const { File } = await import("expo-file-system");
  return new File(input.uri) as OpenBatchImageSource;
}
