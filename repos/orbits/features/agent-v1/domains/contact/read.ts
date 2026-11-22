/**
 * Contact reads (设计稿 §4 联系人, 附录 B; agent-design AG05). Contacts of the account only; by id, or by
 * name: `search` finds names that contain the words; `status: "within"` finds names contained in the words
 * ("东都精机的鈴木健太さん" → 鈴木健太); `status: "company"` finds the contacts at a company holding the words. Contact methods (e-mail, phone, WeChat …) are never among the
 * fields: they need their own grant (附录 B) and do not go to the model.
 */
import type { ReadInput } from "../../../orbit-ai/data-query/read-contract";
import { defined, str, strs, type RecordDomain } from "../record-adapter";
import type { RecordSpec } from "../source";

export const CONTACT_DOMAIN: RecordDomain = {
  fieldsOf(row) {
    const contact = row.payload;
    if (typeof contact.displayName !== "string") return null;
    // AG12-5: which contact methods are on file — their names only, never a value (an answer must not say there are none).
    const methods = [str(contact.primaryEmail) ? "email" : null, str(contact.primaryPhone) ? "phone" : null].filter((item): item is string => item !== null);
    return defined({
      company: str(contact.organization) ?? str(contact.company),
      contactMethods: methods.length ? methods : undefined,
      displayName: contact.displayName,
      headline: str(contact.role) ?? str(contact.headline),
      status: str(contact.stage),
      tags: strs(contact.customTags),
      updatedAt: str(contact.updatedAt),
    });
  },
  kind: "contact",
  specOf(input: ReadInput): RecordSpec {
    return {
      collection: "contacts",
      order: { direction: "desc", paths: [["updatedAt"]] },
      ...(input.operation === "get" && input.id ? { ids: [input.id] } : {}),
      // AG20b (R10): `status: "company"` finds the contacts whose company holds the words.
      ...(input.operation === "search" ? { text: { paths: input.status === "company" ? [["organization"], ["company"]] : [["displayName"]], value: input.query, ...(input.status === "within" ? { within: true } : {}) } } : {}),
    };
  },
  updatedAtOf: (row) => str(row.payload.updatedAt) ?? row.updatedAt,
  versionOf: (row) => str(row.payload.updatedAt) ?? row.updatedAt,
};
