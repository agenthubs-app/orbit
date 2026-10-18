export interface NewThreadSeed {
  body?: string;
  contactId?: string;
  recipient?: string;
  organization?: string;
  subject?: string;
}

/** Session storage and window events are untrusted inputs; they may only prefill a draft. */
export function sanitizeInboxComposeSeed(input: unknown): NewThreadSeed | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const raw = input as Record<string, unknown>;
  const clean: NewThreadSeed = {};
  if (typeof raw.contactId === 'string' && /^[A-Za-z0-9:_-]{1,200}$/.test(raw.contactId)) clean.contactId = raw.contactId;
  for (const [key, limit] of [['body', 10_000], ['recipient', 320], ['organization', 500], ['subject', 500]] as const) {
    const value = raw[key];
    if (typeof value !== 'string' || !value.trim() || value.length > limit || (key !== 'body' && /[\r\n]/.test(value))) continue;
    clean[key] = value;
  }
  return Object.keys(clean).length ? clean : null;
}
