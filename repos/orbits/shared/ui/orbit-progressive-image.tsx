"use client";

import Image from "next/image";
import {
  useCallback,
  useState,
  type SyntheticEvent,
} from "react";

export interface OrbitProgressiveImageProps {
  alt: string;
  blurDataURL?: string;
  loading?: "eager" | "lazy";
  onReady?: () => void;
  overlayVisible?: boolean;
  sizes: string;
  src: string;
}

function bypassNextImageOptimization(src: string): boolean {
  return (
    /\.svg(?:\?|$)/u.test(src) ||
    /^data:/u.test(src) ||
    /^https?:\/\//u.test(src)
  );
}

/**
 * Responsive image media with a server-rendered LQIP and a decode-gated
 * crossfade. The intrinsic box is owned by the parent; this component fills it.
 */
export function OrbitProgressiveImage({
  alt,
  blurDataURL,
  loading = "lazy",
  onReady,
  overlayVisible = false,
  sizes,
  src,
}: OrbitProgressiveImageProps) {
  const [readySrc, setReadySrc] = useState("");
  const ready = readySrc === src;

  const handleLoad = useCallback(
    async (event: SyntheticEvent<HTMLImageElement>) => {
      const image = event.currentTarget;

      try {
        await image.decode();
      } catch {
        // A loaded image can reject decode() in a few browser edge cases. The
        // resource is still paintable, so reveal it instead of trapping LQIP.
      }

      setReadySrc(src);
      onReady?.();
    },
    [onReady, src],
  );

  const transition = "opacity 220ms cubic-bezier(0.22, 1, 0.36, 1)";

  return (
    <span
      data-orbit-progressive-image=""
      data-orbit-progressive-image-ready={ready ? "true" : "false"}
      style={{ inset: 0, overflow: "hidden", position: "absolute" }}
    >
      <span
        aria-hidden="true"
        className="orbit-progressive-image-layer"
        data-orbit-progressive-image-lqip=""
        style={{
          backgroundColor: "var(--surface-3)",
          backgroundImage: blurDataURL ? `url(${blurDataURL})` : undefined,
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          backgroundSize: "cover",
          filter: blurDataURL ? "blur(12px)" : undefined,
          inset: blurDataURL ? -10 : 0,
          opacity: ready ? 0 : 1,
          position: "absolute",
          transform: blurDataURL ? "scale(1.04)" : undefined,
          transition,
        }}
      />
      <Image
        alt={alt}
        className="orbit-progressive-image-layer"
        decoding="async"
        fill
        loading={loading === "lazy" ? "lazy" : undefined}
        onLoad={handleLoad}
        preload={loading === "eager"}
        quality={75}
        sizes={sizes}
        src={src}
        style={{
          objectFit: "cover",
          opacity: ready ? 1 : 0,
          transition,
        }}
        unoptimized={bypassNextImageOptimization(src)}
      />
      {overlayVisible ? (
        <span
          aria-hidden="true"
          className="orbit-progressive-image-layer"
          style={{
            background:
              "linear-gradient(180deg, rgba(6,5,13,0.42) 0%, rgba(6,5,13,0.06) 26%, rgba(6,5,13,0.10) 60%, rgba(6,5,13,0.62) 100%)",
            inset: 0,
            opacity: ready ? 1 : 0,
            position: "absolute",
            transition,
          }}
        />
      ) : null}
    </span>
  );
}
