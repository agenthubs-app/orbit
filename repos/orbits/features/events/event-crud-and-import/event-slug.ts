import { createHash } from "node:crypto";

/**
 * Sprint 0093: the id segment a manually created event is stored under.
 *
 * The three copies this replaces kept only `[a-z0-9]`, which for a Chinese
 * title — the common case in this app — left the empty string. Every such event
 * was then stored as `event:live-record:` and silently overwrote the one before
 * it. A title with no ASCII to keep falls back to a digest of the title, so it
 * is still stable (creating the same event twice is still one record) without
 * colliding with every other title.
 */
export function slugFromTitle(title: string): string {
  const slug = title.trim().toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "");
  if (slug) return slug;
  const normalized = title.trim();
  return normalized ? createHash("sha256").update(normalized).digest("hex").slice(0, 16) : "untitled";
}
