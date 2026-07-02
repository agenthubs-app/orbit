export interface ContactSummary {
  id: string;
  name: string;
  organization: string;
  relationship: string;
}

export interface ContactDetailSummary extends ContactSummary {
  lastInteractionAt: string;
  location: string;
  nextAction: string;
  role: string;
  status: string;
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

function contactRecordFromPayload(data: unknown): Record<string, unknown> | null {
  if (isRecord(data) && isRecord(data.contact)) {
    return data.contact;
  }

  return isRecord(data) ? data : null;
}

export function contactDetailToSummary(data: unknown): ContactDetailSummary {
  const contact = contactRecordFromPayload(data);

  if (!contact) {
    return {
      id: "contact",
      lastInteractionAt: "No interaction recorded",
      location: "",
      name: "Contact",
      nextAction: "Ask Orbit AI for the next relationship move.",
      organization: "Independent",
      relationship: "Relationship context pending",
      role: "",
      status: "active"
    };
  }

  return {
    id: stringField(contact, "id", "contact"),
    lastInteractionAt: stringField(
      contact,
      "lastInteractionAt",
      "No interaction recorded"
    ),
    location: stringField(contact, "location"),
    name: stringField(
      contact,
      "displayName",
      stringField(contact, "name", "Contact")
    ),
    nextAction: stringField(
      contact,
      "nextAction",
      "Ask Orbit AI for the next relationship move."
    ),
    organization: stringField(contact, "organization", "Independent"),
    relationship:
      stringField(contact, "relationshipContext") ||
      stringField(contact, "profileSnippet") ||
      "Relationship context pending",
    role: stringField(contact, "role"),
    status: stringField(contact, "status", "active")
  };
}
