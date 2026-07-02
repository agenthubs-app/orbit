export interface ContactSummary {
  id: string;
  name: string;
  organization: string;
  relationship: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(
  record: Record<string, unknown>,
  fieldName: string,
  fallback = ""
): string {
  const value = record[fieldName];
  return typeof value === "string" && value.trim() ? value : fallback;
}

function listFromPayload(value: unknown, fieldName: string): readonly unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (!isRecord(value)) {
    return [];
  }

  const field = value[fieldName];
  return Array.isArray(field) ? field : [];
}

export function contactsToSummaries(data: unknown): ContactSummary[] {
  return listFromPayload(data, "contacts")
    .filter(isRecord)
    .map((contact) => ({
      id: stringField(contact, "id", "contact"),
      name: stringField(
        contact,
        "displayName",
        stringField(contact, "name", "Contact")
      ),
      organization: stringField(contact, "organization", "Independent"),
      relationship:
        stringField(contact, "relationshipContext") ||
        stringField(contact, "profileSnippet") ||
        stringField(contact, "role", "Relationship context pending")
    }));
}
