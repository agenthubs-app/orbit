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
  return uri.startsWith("blob:");
}

export async function openBatchImageSource(
  input: BatchImageSourceInput
): Promise<OpenBatchImageSource> {
  if (input.file) {
    return {
      exists: true,
      size: input.file.size,
      async bytes() {
        return new Uint8Array(await input.file!.arrayBuffer());
      }
    };
  }

  const response = await fetch(input.uri);
  if (!response.ok) throw new Error("Unable to read selected browser file");
  const blob = await response.blob();
  return {
    exists: true,
    size: blob.size,
    async bytes() {
      return new Uint8Array(await blob.arrayBuffer());
    }
  };
}
