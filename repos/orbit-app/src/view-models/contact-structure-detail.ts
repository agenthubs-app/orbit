type UnknownRecord = Record<string, unknown>;

export interface ContactStructureDetailContactView {
  id: string;
  location: string;
  name: string;
  organization: string;
  relationshipLabel: string;
  role: string;
  tags: string[];
}

export interface ContactStructureDetailView {
  commonTags: { countLabel: string; label: string }[];
  contacts: ContactStructureDetailContactView[];
  dimensionLabel: string;
  insight: string;
  relationshipQuality: {
    color: "amber" | "live" | "sky";
    countLabel: string;
    id: string;
    label: string;
    percentage: number;
  }[];
  shareLabel: string;
  title: string;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(record: UnknownRecord, field: string): string {
  return typeof record[field] === "string" ? record[field].trim() : "";
}

function numberField(record: UnknownRecord, field: string): number {
  const value = record[field];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function recordsField(record: UnknownRecord, field: string): UnknownRecord[] {
  return Array.isArray(record[field]) ? record[field].filter(isRecord) : [];
}

function relationshipLabel(value: string): string {
  if (value === "strong") return "强关系";
  if (value === "warm") return "熟悉关系";
  return "弱关系";
}

function dimensionLabel(value: string): string {
  if (value === "location") return "地区";
  if (value === "role") return "角色";
  if (value === "relationship") return "关系";
  return "行业";
}

export function contactStructureDetailToView(
  value: unknown
): ContactStructureDetailView {
  const payload = isRecord(value) ? value : {};
  const bucket = isRecord(payload.bucket) ? payload.bucket : {};
  const contactCount = numberField(bucket, "contactCount");
  const percentage = numberField(bucket, "percentage");

  return {
    commonTags: recordsField(payload, "commonTags").map((tag) => ({
      countLabel: `${numberField(tag, "contactCount")} 人`,
      label: stringField(tag, "label")
    })).filter((tag) => tag.label),
    contacts: recordsField(payload, "contacts").map((contact) => ({
      id: stringField(contact, "id"),
      location: stringField(contact, "location"),
      name: stringField(contact, "displayName") || "未命名联系人",
      organization: stringField(contact, "organization"),
      relationshipLabel: relationshipLabel(stringField(contact, "relationshipStrength")),
      role: stringField(contact, "role"),
      tags: Array.isArray(contact.tags)
        ? contact.tags.filter((tag): tag is string => typeof tag === "string")
        : []
    })).filter((contact) => contact.id),
    dimensionLabel: dimensionLabel(stringField(payload, "dimension")),
    insight: stringField(payload, "insight"),
    relationshipQuality: recordsField(payload, "relationshipQuality").map((item) => {
      const id = stringField(item, "id");
      return {
        color: id === "strong" ? "live" : id === "warm" ? "sky" : "amber",
        countLabel: `${numberField(item, "contactCount")} 人`,
        id,
        label: stringField(item, "label") || relationshipLabel(id),
        percentage: numberField(item, "percentage")
      };
    }),
    shareLabel: `${contactCount} 人 · 占全部联系人 ${percentage}%`,
    title: stringField(bucket, "label") || "分组详情"
  };
}
