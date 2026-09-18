"use client";

import { useEffect, useRef, useState } from "react";

const VARIANT_WIDTHS = [320, 768, 1280] as const;
const DEFAULT_PRIVATE_IMAGE_SIZES = "(max-width: 760px) calc(100vw - 40px), 320px";

export type PrivateImageState =
  | { kind: "loading" }
  | { kind: "ready"; src: string; lqip: string | null; variants: readonly PrivateImageVariant[] }
  | { kind: "expired"; status: number }
  | { kind: "error"; message: string };

export interface PrivateImageVariant {
  width: number;
  src: string;
}

export interface IngestV2PrivateImageProps {
  alt: string;
  src: string | Blob;
  aspectRatio?: string;
  sizes?: string;
  className?: string;
  loadingLabel?: string;
  expiredLabel?: string;
  errorLabel?: string;
}

export function isPrivateImageExpiredStatus(status: number): boolean {
  return status === 404 || status === 410;
}

function revokeObjectUrls(urls: readonly string[]): void {
  for (const url of urls) URL.revokeObjectURL(url);
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

async function createLocalVariants(
  blob: Blob,
  signal: AbortSignal,
  ownedUrls: string[],
): Promise<{ lqip: string | null; variants: PrivateImageVariant[] }> {
  if (signal.aborted || typeof document === "undefined" || typeof createImageBitmap !== "function") {
    return { lqip: null, variants: [] };
  }
  const bitmap = await createImageBitmap(blob);
  try {
    if (signal.aborted || bitmap.width <= 0 || bitmap.height <= 0) {
      return { lqip: null, variants: [] };
    }
    const lqipCanvas = document.createElement("canvas");
    const lqipWidth = Math.min(48, bitmap.width);
    lqipCanvas.width = lqipWidth;
    lqipCanvas.height = Math.max(1, Math.round((bitmap.height / bitmap.width) * lqipWidth));
    const lqipContext = lqipCanvas.getContext("2d");
    if (!lqipContext) return { lqip: null, variants: [] };
    lqipContext.drawImage(bitmap, 0, 0, lqipCanvas.width, lqipCanvas.height);
    const lqip = lqipCanvas.toDataURL("image/webp", 0.45);
    const variants: PrivateImageVariant[] = [];
    for (const width of VARIANT_WIDTHS) {
      if (signal.aborted) break;
      const variantWidth = Math.min(width, bitmap.width);
      if (variants.some((entry) => entry.width === variantWidth)) continue;
      const canvas = document.createElement("canvas");
      canvas.width = variantWidth;
      canvas.height = Math.max(1, Math.round((bitmap.height / bitmap.width) * variantWidth));
      const context = canvas.getContext("2d");
      if (!context) continue;
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const variant = await toBlob(canvas, "image/webp", 0.82);
      if (variant && !signal.aborted) {
        const src = URL.createObjectURL(variant);
        ownedUrls.push(src);
        variants.push({ width: variantWidth, src });
      }
    }
    return { lqip, variants };
  } finally {
    bitmap.close();
  }
}

/**
 * Private batch images are fetched with the current session and kept in
 * object URLs only. This component deliberately does not expose the endpoint
 * to a public image loader or upload a derived image back to the server.
 */
export function IngestV2PrivateImage({
  alt,
  src,
  aspectRatio = "1.586 / 1",
  sizes,
  className,
  loadingLabel = "Loading image",
  expiredLabel = "Image expired",
  errorLabel = "Image unavailable",
}: IngestV2PrivateImageProps) {
  const [state, setState] = useState<PrivateImageState>({ kind: "loading" });
  const [revealedSrc, setRevealedSrc] = useState<string | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [measuredWidth, setMeasuredWidth] = useState<number | null>(null);
  const objectUrlsRef = useRef<string[]>([]);
  const generationRef = useRef(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!media) return;
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  useEffect(() => {
    const generation = ++generationRef.current;
    const controller = new AbortController();
    const urls: string[] = [];
    objectUrlsRef.current = urls;
    setState({ kind: "loading" });
    setRevealedSrc(null);

    if (!src) {
      setState({ kind: "error", message: "missing_private_image_url" });
      return () => controller.abort();
    }

    void (async () => {
      try {
        let blob: Blob;
        if (src instanceof Blob) {
          blob = src;
        } else {
          const resolved = new URL(src, window.location.href);
          if ((resolved.protocol !== "http:" && resolved.protocol !== "https:") || resolved.origin !== window.location.origin) {
            throw new Error("private_image_cross_origin_rejected");
          }
          const response = await fetch(resolved.href, {
            credentials: "same-origin",
            redirect: "error",
            signal: controller.signal,
          });
          if (isPrivateImageExpiredStatus(response.status)) {
            if (generation === generationRef.current) setState({ kind: "expired", status: response.status });
            return;
          }
          if (!response.ok || new URL(response.url, window.location.href).origin !== window.location.origin) {
            throw new Error(`private_image_http_${response.status}`);
          }
          blob = await response.blob();
        }
        if (controller.signal.aborted || generation !== generationRef.current) return;
        const original = URL.createObjectURL(blob);
        urls.push(original);
        const local = await createLocalVariants(blob, controller.signal, urls);
        if (controller.signal.aborted || generation !== generationRef.current) return;
        setState({ kind: "ready", src: original, lqip: local.lqip, variants: local.variants });
      } catch (error) {
        if (controller.signal.aborted || generation !== generationRef.current) return;
        revokeObjectUrls(urls);
        urls.length = 0;
        setState({ kind: "error", message: error instanceof Error ? error.message : "private_image_unavailable" });
      }
    })();

    return () => {
      controller.abort();
      revokeObjectUrls(urls);
      if (objectUrlsRef.current === urls) objectUrlsRef.current = [];
    };
  }, [src]);

  useEffect(() => {
    if (sizes !== undefined || typeof window === "undefined") return;
    const container = containerRef.current;
    if (!container) return;

    const measure = (width?: number) => {
      const rect = typeof container.getBoundingClientRect === "function"
        ? container.getBoundingClientRect()
        : null;
      const nextWidth = width && width > 0 ? width : rect?.width ?? container.clientWidth;
      if (!Number.isFinite(nextWidth) || nextWidth <= 0) return;
      setMeasuredWidth((previous) => (previous === nextWidth ? previous : nextWidth));
    };

    // Measure as soon as the reserved box exists so the first ready image can
    // select a source for its real slot instead of the page viewport.
    measure();
    if (typeof ResizeObserver === "function") {
      const observer = new ResizeObserver((entries) => measure(entries[0]?.contentRect.width));
      observer.observe(container);
      return () => observer.disconnect();
    }

    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [sizes, state.kind]);

  useEffect(() => {
    if (state.kind !== "ready") return;
    const generation = generationRef.current;
    const image = imageRef.current;
    if (!image) return;
    let active = true;
    void (async () => {
      try {
        await image.decode();
      } catch {
        // A loaded image can still be painted when decode() rejects.
      }
      if (!active || generation !== generationRef.current) return;
      if (image.naturalWidth <= 0 || image.naturalHeight <= 0) {
        revokeObjectUrls(objectUrlsRef.current);
        objectUrlsRef.current = [];
        setState({ kind: "error", message: "private_image_decode_failed" });
        return;
      }
      if (active && generation === generationRef.current) setRevealedSrc(state.src);
    })();
    return () => {
      active = false;
    };
  }, [state]);

  const resolvedSizes = sizes ?? (measuredWidth === null ? DEFAULT_PRIVATE_IMAGE_SIZES : `${measuredWidth}px`);
  const style = { aspectRatio, position: "relative" as const };
  if (state.kind === "expired") {
    return <div aria-live="polite" className={className} data-ingest-private-image="expired" style={style}>{expiredLabel}</div>;
  }
  if (state.kind === "error") {
    return <div aria-live="polite" className={className} data-ingest-private-image="error" style={style}>{errorLabel}</div>;
  }
  const ready = state.kind === "ready";
  const variantSrcSet = ready && state.variants.length > 0
    ? state.variants.map((variant) => `${variant.src} ${variant.width}w`).join(",")
    : undefined;
  const visible = ready && revealedSrc === state.src;
  const renderedGeneration = generationRef.current;
  return (
    <div
      aria-busy={!ready}
      className={className}
      data-ingest-private-image={ready ? "ready" : "loading"}
      ref={containerRef}
      style={{ ...style, backgroundColor: "var(--surface-3)", overflow: "hidden" }}
    >
      <div
        aria-hidden="true"
        data-ingest-private-image-lqip=""
        style={{
          backgroundImage: ready && state.lqip ? `url(${state.lqip})` : undefined,
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          backgroundSize: "contain",
          inset: 0,
          opacity: visible ? 0 : 1,
          position: "absolute",
          transition: reducedMotion ? "none" : "opacity 220ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      />
      {!ready ? <span aria-live="polite" data-ingest-private-image-loading="">{loadingLabel}</span> : null}
      {ready ? (
        <img
          ref={imageRef}
          alt={alt}
          data-ingest-private-image-content=""
          decoding="async"
          sizes={resolvedSizes}
          src={state.src}
          srcSet={variantSrcSet}
          onError={() => {
            if (renderedGeneration !== generationRef.current) return;
            revokeObjectUrls(objectUrlsRef.current);
            objectUrlsRef.current = [];
            setState({ kind: "error", message: "private_image_decode_failed" });
          }}
          style={{
            height: "100%",
            inset: 0,
            objectFit: "contain",
            opacity: visible ? 1 : 0,
            position: "absolute",
            transition: reducedMotion ? "none" : "opacity 220ms cubic-bezier(0.22, 1, 0.36, 1)",
            width: "100%",
          }}
        />
      ) : null}
    </div>
  );
}
