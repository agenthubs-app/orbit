/**
 * agent-design AG17 (设计稿 §5.4「工具结果里不放什么」): the paging cursor an external client sees.
 *
 * The read adapters page with their own cursor (features/orbit-ai/data-query/query-cursor.ts): signed, so it cannot be
 * altered, and bound to the account, the workspace and the filter — but readable: its base64 holds the account id, the
 * workspace id and the position (a time and a record id). That is fine inside Orbit; it is not something to hand to
 * an outside agent. So `search_records` never returns it. What goes out is that cursor encrypted (AES-256-GCM, as the
 * integration token vault does), with the connection, the kind of record and the query as associated data:
 *
 *   - nothing in it can be read: no account, workspace, record id, time or query text;
 *   - it opens only for the connection it was issued to, for the same kind of record and the same query;
 *   - one changed character and it does not open;
 *   - the adapters' own cursor, passed in from outside, is not a cursor here.
 *
 * The key is derived from the deployment secret the MCP tokens are signed with (AUTH_SECRET / NEXTAUTH_SECRET, see
 * auth/config.ts `mcpSecret`). Without that secret there is no sealer and no MCP service at all (the endpoints answer
 * 503): there is no unencrypted fallback.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { derivedKey, sha256 } from "../auth/config";

export interface CursorBinding {
  connectionId: string;
  /** The scope domain the page belongs to (memos, todos …). */
  domain: string;
  /** The query words of the search ("" for a plain list). */
  query: string;
}

export interface CursorSealer {
  seal(inner: string, binding: CursorBinding): string;
  /** The adapters' cursor behind an outside cursor; null when it is not one of ours, was altered, or belongs elsewhere. */
  open(sealed: string, binding: CursorBinding): string | null;
}

const VERSION = 1;
const IV_BYTES = 12;
const TAG_BYTES = 16;
/** Longer than any cursor the adapters make; a longer input is not looked at. */
const MAX_SEALED_CHARS = 4000;

const associated = (binding: CursorBinding) => Buffer.from(`orbit-mcp-cursor\u0000${VERSION}\u0000${binding.connectionId}\u0000${binding.domain}\u0000${sha256(binding.query)}`, "utf8");

export function createCursorSealer(secret: string): CursorSealer {
  if (typeof secret !== "string" || secret.trim().length < 16) throw new Error("A deployment secret is required to seal paging cursors; there is no unencrypted fallback.");
  const key = derivedKey(secret, "search-cursor");
  return {
    seal(inner, binding) {
      const iv = randomBytes(IV_BYTES);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      cipher.setAAD(associated(binding));
      const body = Buffer.concat([cipher.update(inner, "utf8"), cipher.final()]);
      return Buffer.concat([Buffer.from([VERSION]), iv, body, cipher.getAuthTag()]).toString("base64url");
    },
    open(sealed, binding) {
      if (typeof sealed !== "string" || sealed.length > MAX_SEALED_CHARS || !/^[A-Za-z0-9_-]+$/u.test(sealed)) return null;
      const bytes = Buffer.from(sealed, "base64url");
      // Only the canonical spelling of the bytes is a cursor (no trailing bits to play with).
      if (bytes.toString("base64url") !== sealed || bytes.length <= 1 + IV_BYTES + TAG_BYTES || bytes[0] !== VERSION) return null;
      try {
        const decipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(1, 1 + IV_BYTES));
        decipher.setAAD(associated(binding));
        decipher.setAuthTag(bytes.subarray(bytes.length - TAG_BYTES));
        return Buffer.concat([decipher.update(bytes.subarray(1 + IV_BYTES, bytes.length - TAG_BYTES)), decipher.final()]).toString("utf8");
      } catch {
        return null;
      }
    },
  };
}
