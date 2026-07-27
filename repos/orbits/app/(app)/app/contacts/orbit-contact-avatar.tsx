import { getDemoPersonAvatarAsset } from "../../../../shared/demo-visual-assets";
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
      style={{ height: size, overflow: "hidden", width: size }}
      title={contact.displayName}
    >
      <img
        alt={asset.alt}
        decoding="async"
        loading="lazy"
        src={asset.src}
        style={{
          display: "block",
          height: "100%",
          objectFit: "cover",
          width: "100%",
        }}
      />
    </span>
  );
}
