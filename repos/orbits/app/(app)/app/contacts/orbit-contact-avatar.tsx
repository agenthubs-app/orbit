import { getDemoPersonAvatarAsset } from "../../../../shared/demo-visual-assets";
import { orbitImageLqip } from "../../../../shared/ui/orbit-image-lqip.generated";
import { OrbitProgressiveImage } from "../../../../shared/ui/orbit-progressive-image";
import type { OrbitContactView } from "../orbit-contacts-route-view-model";
import { Avatar } from "../orbit-reference-primitives";

export function OrbitContactAvatar({
  contact,
  size,
}: {
  contact: Pick<OrbitContactView, "displayName" | "g" | "id" | "initial">;
  size: number;
}) {
  const asset = getDemoPersonAvatarAsset({
    displayName: contact.displayName,
    recordId: contact.id,
  });

  if (!asset) {
    return (
      <Avatar
        g={contact.g || "g-violet"}
        letter={contact.initial}
        size={size}
        title={contact.displayName}
      />
    );
  }

  return (
    <span
      className={`avatar ${contact.g || "g-violet"}`}
      data-demo-visual-asset-id={asset.assetId}
      data-demo-visual-source={asset.sourceLabel}
      data-demo-visual-source-label={asset.sourceLabel}
      style={{ background: "var(--surface-3)", height: size, overflow: "hidden", width: size }}
      title={contact.displayName}
    >
      <OrbitProgressiveImage
        alt={asset.alt}
        blurDataURL={orbitImageLqip(asset.src)}
        loading="lazy"
        src={asset.src}
        sizes={`${size}px`}
      />
    </span>
  );
}
