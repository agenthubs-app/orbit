"use client";

import type { ComponentProps } from "react";

import { orbitImageLqip } from "../../../../shared/ui/orbit-image-lqip.generated";
import { OrbitProgressiveImage } from "../../../../shared/ui/orbit-progressive-image";
import { Cover } from "../orbit-reference-primitives";

type EventCoverProps = Omit<
  ComponentProps<typeof Cover>,
  "imageOverlayVisible" | "imagePlaceholder" | "onImageLoad"
> & {
  imageBlurDataURL?: string;
  imageSizes?: string;
};

const DEFAULT_EVENT_IMAGE_SIZES =
  "(max-width: 720px) calc(100vw - 36px), (max-width: 1280px) 50vw, 736px";

/**
 * Known event artwork uses a responsive image, an inline LQIP, and a
 * decode-gated crossfade. Events without artwork keep Cover's intentional
 * generated-gradient fallback.
 */
export function EventCover({
  children,
  className = "",
  g,
  imageAlt = "",
  imageBlurDataURL,
  imageLoading = "lazy",
  imageSizes = DEFAULT_EVENT_IMAGE_SIZES,
  imageUrl,
  monogram,
  style,
}: EventCoverProps) {
  if (!imageUrl) {
    return (
      <Cover className={className} g={g} monogram={monogram} style={style}>
        {children}
      </Cover>
    );
  }

  return (
    <div
      className={`cover cover-grain ${className}`}
      style={{ background: "var(--surface-3)", ...style }}
    >
      <OrbitProgressiveImage
        alt={imageAlt}
        blurDataURL={imageBlurDataURL ?? orbitImageLqip(imageUrl)}
        loading={imageLoading}
        overlayVisible
        sizes={imageSizes}
        src={imageUrl}
      />
      {children}
    </div>
  );
}
