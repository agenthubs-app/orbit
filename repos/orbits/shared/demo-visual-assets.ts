import manifest from "../public/orbit-demo-assets/manifest.json";

export type DemoVisualAssetKind = "avatar" | "event-scene";
export type DemoVisualAssetRecordType = "event" | "person";

export interface DemoVisualAsset {
  alt: string;
  assetId: string;
  displayName?: string;
  kind: DemoVisualAssetKind;
  promptId: string;
  recordId: string;
  recordType: DemoVisualAssetRecordType;
  sourceLabel: string;
  src: string;
}

export interface DemoVisualAssetManifest {
  assets: readonly DemoVisualAsset[];
  generatedAt: string;
  version: "sprint-96-demo-visual-assets";
}

export const demoVisualAssetManifest = manifest as DemoVisualAssetManifest;

const eventAssetsByRecordId = new Map(
  demoVisualAssetManifest.assets
    .filter((asset) => asset.recordType === "event" && asset.kind === "event-scene")
    .map((asset) => [asset.recordId, asset]),
);

const personAssetsByRecordId = new Map(
  demoVisualAssetManifest.assets
    .filter((asset) => asset.recordType === "person" && asset.kind === "avatar")
    .map((asset) => [asset.recordId, asset]),
);

const personAssetsByDisplayName = new Map(
  demoVisualAssetManifest.assets
    .filter(
      (asset) =>
        asset.recordType === "person" &&
        asset.kind === "avatar" &&
        asset.displayName,
    )
    .map((asset) => [normalizeDisplayName(asset.displayName ?? ""), asset]),
);

function normalizeDisplayName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function getDemoEventSceneAsset(
  recordId: string | null | undefined,
): DemoVisualAsset | null {
  if (!recordId) {
    return null;
  }

  return eventAssetsByRecordId.get(recordId) ?? null;
}

export function getDemoPersonAvatarAsset(input: {
  displayName?: string | null;
  recordId?: string | null;
}): DemoVisualAsset | null {
  if (input.recordId) {
    const asset = personAssetsByRecordId.get(input.recordId);

    if (asset) {
      return asset;
    }
  }

  if (!input.displayName) {
    return null;
  }

  return personAssetsByDisplayName.get(normalizeDisplayName(input.displayName)) ?? null;
}
