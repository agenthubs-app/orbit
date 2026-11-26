export const PROFILE_CONTACT_METHODS = ["lineId", "wechatId", "email", "phone"] as const;

export type ProfileContactMethod = (typeof PROFILE_CONTACT_METHODS)[number];
export type ProfileContactMethods = Partial<Record<ProfileContactMethod, string>>;

function contactValue(value: unknown, method: ProfileContactMethod): string {
  if (typeof value !== "string") return "";
  const text = value.trim();
  if (!text || /[\u0000-\u001f\u007f]/u.test(text)) return "";
  if (method === "email") return text.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(text) ? text : "";
  if (method === "phone") {
    const digits = text.normalize("NFKC").replace(/\D/gu, "").length;
    return text.length <= 40 && /^[+\d() .-]+$/u.test(text.normalize("NFKC")) && digits >= 5 && digits <= 19 ? text : "";
  }
  return text.length <= 80 ? text : "";
}

/** Project only the four contact methods that the user reviewed in their profile. */
export function profileContactMethods(value: unknown): ProfileContactMethods {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const handles = value as Record<string, unknown>;
  return Object.fromEntries(PROFILE_CONTACT_METHODS.flatMap(method => {
    const text = contactValue(handles[method], method);
    return text ? [[method, text]] : [];
  }));
}

/** One valid method is required; any other method supplied must also be valid. */
export function profileContactMethodsValid(handles: ProfileContactMethods): boolean {
  const values = profileContactMethods(handles);
  return Object.keys(values).length > 0
    && PROFILE_CONTACT_METHODS.every(method => !handles[method]?.trim() || Boolean(values[method]));
}
