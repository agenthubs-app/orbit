import type { PersonalScheduleAssociationKind, PersonalScheduleAssociationOption, PersonalScheduleAssociationOptionsPage } from "../../shared/contract/personal-schedule-associations";
import { createHash } from "node:crypto";
import { pinyin } from "pinyin-pro";

export type AssociationCandidateReader = (input: {
  actorId: string;
  kind: PersonalScheduleAssociationKind;
  afterId?: string;
  limit: number;
}) => Promise<{ candidates: PersonalScheduleAssociationOption[]; sourceVersion: string; hasMore: boolean }>;

export function associationTextMatches(title: string, q: string, kind: PersonalScheduleAssociationKind): boolean {
  const text = title.normalize("NFKC").toLowerCase();
  const terms = q.normalize("NFKC").trim().toLowerCase().split(/\s+/).filter(Boolean);
  // Unknown characters remain literal barriers; never guess a reading or skip them.
  const initials = (text.match(/\p{Script=Han}+|[a-z0-9]+|[^\sa-z0-9]/gu) ?? []).map(token =>
    /\p{Script=Han}/u.test(token)
      ? pinyin(token, { pattern: "first", toneType: "none", type: "array", surname: kind === "contact" ? "head" : "off" }).join("")
      : /^[a-z0-9]+$/.test(token) ? token[0] : token,
  ).join("");
  return terms.every(term => text.includes(term) || (/^[a-z]+$/.test(term) && initials.includes(term)));
}

export function createAssociationOptionsService(reader: AssociationCandidateReader) {
  return async (input: { actorId: string; kind: PersonalScheduleAssociationKind; q: string; limit: number; cursor?: string | undefined }): Promise<PersonalScheduleAssociationOptionsPage> => {
    if (!input.actorId.trim() || !["note", "contact"].includes(input.kind) || !Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 20 || input.q.length > 200) throw new Error("Invalid association search input.");
    const scope = createHash("sha256").update(JSON.stringify([input.actorId, input.kind, input.q.normalize("NFKC").trim().toLowerCase()])).digest("base64url");
    let afterId: string | undefined;
    let sourceVersion: string | undefined;
    if (input.cursor) {
      try {
        if (input.cursor.length > 2048) throw new Error();
        const decoded = JSON.parse(Buffer.from(input.cursor, "base64url").toString("utf8"));
        if (decoded.scope !== scope || typeof decoded.afterId !== "string" || !decoded.afterId || typeof decoded.sourceVersion !== "string" || !decoded.sourceVersion) throw new Error();
        afterId = decoded.afterId; sourceVersion = decoded.sourceVersion;
      } catch { throw new Error("Invalid association cursor."); }
    }
    const options: PersonalScheduleAssociationOption[] = [];
    let scanned = 0, hasMore = false;
    while (scanned < 200 && options.length < input.limit) {
      const page = await reader({ actorId: input.actorId, kind: input.kind, ...(afterId ? { afterId } : {}), limit: Math.min(40, 200 - scanned) });
      if (!page.sourceVersion || page.candidates.length > 40 || (!page.candidates.length && page.hasMore)) throw new Error("Invalid association summary page.");
      if (sourceVersion && sourceVersion !== page.sourceVersion) throw new Error("Association choices changed. Search again.");
      sourceVersion = page.sourceVersion;
      hasMore = page.hasMore;
      for (let index = 0; index < page.candidates.length; index++) {
        const option = page.candidates[index]!;
        if (!option.id || !option.title.trim() || (afterId && Buffer.compare(Buffer.from(option.id), Buffer.from(afterId)) <= 0)) throw new Error("Invalid association summary ordering.");
        afterId = option.id; scanned++;
        if (associationTextMatches(option.title, input.q, input.kind)) options.push(option);
        if (options.length === input.limit) { hasMore = index < page.candidates.length - 1 || page.hasMore; break; }
      }
      if (!hasMore) break;
    }
    return {
      actorId: input.actorId, kind: input.kind, options, sourceVersion: sourceVersion!,
      partial: scanned >= 200 && options.length < input.limit && hasMore,
      ...(hasMore && afterId ? { nextCursor: Buffer.from(JSON.stringify({ scope, sourceVersion, afterId })).toString("base64url") } : {}),
    };
  };
}
