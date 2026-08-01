"use client";

import { useState, type ComponentProps } from "react";

import { Cover } from "../orbit-reference-primitives";

type EventCoverProps = Omit<
  ComponentProps<typeof Cover>,
  "imageOverlayVisible" | "imagePlaceholder" | "onImageLoad"
>;

/**
 * Event artwork never exposes the legacy colored fallback while a known image
 * is loading. The neutral product surface stays visible until the image has
 * decoded; only then does the legibility overlay appear. Events without an
 * image keep Cover's intentional generated-gradient fallback.
 */
export function EventCover({ imageUrl, ...props }: EventCoverProps) {
  const [loadedImageUrl, setLoadedImageUrl] = useState("");
  const imageLoaded = Boolean(imageUrl) && loadedImageUrl === imageUrl;

  return (
    <Cover
      {...props}
      imageOverlayVisible={imageLoaded}
      imagePlaceholder={imageUrl ? "surface" : "gradient"}
      imageUrl={imageUrl}
      onImageLoad={() => setLoadedImageUrl(imageUrl ?? "")}
    />
  );
}
