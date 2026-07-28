import type {
  ProfileDocumentExtractionDraft,
  ProfileDocumentExtractionInput,
  ProfileDocumentExtractionKind,
  ProfileDocumentExtractionPayload,
  ProfileDocumentExtractionService,
  ProfileDocumentExtractionSuccess,
  ProfileDocumentFieldEvidence,
} from "./extraction-contract";

export interface LiveProfileDocumentExtractionServiceOptions {
  now?: () => string;
}

const fieldLabels = {
  displayName: /^(?:姓名|名字|name)\s*[:：]\s*(.+)$/i,
  organization: /^(?:公司|机构|组织|company|organization)\s*[:：]\s*(.+)$/i,
  role: /^(?:职位|职务|角色|title|role)\s*[:：]\s*(.+)$/i,
  headline: /^(?:标题|一句话介绍|headline)\s*[:：]\s*(.+)$/i,
  homeMarket: /^(?:市场|地区|所在地|market|location)\s*[:：]\s*(.+)$/i,
  relationshipGoal:
    /^(?:关系目标|希望认识|寻求|目标|relationship goal|seeking)\s*[:：]\s*(.+)$/i,
  targetRelationshipTypes:
    /^(?:目标人脉|关系类型|target relationships?)\s*[:：]\s*(.+)$/i,
  preferredFollowUpWindow:
    /^(?:跟进时间|联系时间|follow[- ]?up window)\s*[:：]\s*(.+)$/i,
  preferredIntroChannels:
    /^(?:联系方式|引荐渠道|联系渠道|channels?)\s*[:：]\s*(.+)$/i,
} as const;

function clean(value: string | undefined, limit = 300): string {
  return (value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function splitValues(value: string): readonly string[] {
  return Array.from(
    new Set(
      value
        .split(/[,，、;；|/]/)
        .map((item) => clean(item, 80))
        .filter(Boolean),
    ),
  ).slice(0, 8);
}

function fieldValue(
  lines: readonly string[],
  pattern: RegExp,
): { excerpt: string; value: string } | null {
  for (const line of lines) {
    const match = line.match(pattern);
    const value = clean(match?.[1]);
    if (value) return { excerpt: line, value };
  }
  return null;
}

function extractionPayload(input: {
  collectedAt: string;
  document: ProfileDocumentExtractionInput;
  kind: ProfileDocumentExtractionKind;
}): ProfileDocumentExtractionPayload {
  const text = input.document.text?.replace(/\u0000/g, "").trim() ?? "";
  const evidencePrefix = `evidence:profile-text:${input.kind}`;

  if (!text) {
    return {
      state: "empty",
      kind: input.kind,
      draft: null,
      confidenceSummary:
        input.kind === "business-card"
          ? "Image extraction is not available in this profile form because no document bytes were uploaded."
          : "Paste source text before extracting profile fields.",
      provenance: {
        source: "live-policy:profile-document-extraction",
        sourceLabel: "Profile extraction availability policy",
        evidenceIds: [`${evidencePrefix}:empty`],
        collectedAt: input.collectedAt,
        privacy: "live-profile-document-policy-only",
        extractionMethod: "live-policy-no-op",
      },
      nextAction:
        input.kind === "business-card"
          ? "Use the contact import hub for business-card scanning."
          : "Paste structured profile text with explicit field labels.",
    };
  }

  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const extracted = {
    displayName: fieldValue(lines, fieldLabels.displayName),
    organization: fieldValue(lines, fieldLabels.organization),
    role: fieldValue(lines, fieldLabels.role),
    headline: fieldValue(lines, fieldLabels.headline),
    homeMarket: fieldValue(lines, fieldLabels.homeMarket),
    relationshipGoal: fieldValue(lines, fieldLabels.relationshipGoal),
    targetRelationshipTypes: fieldValue(
      lines,
      fieldLabels.targetRelationshipTypes,
    ),
    preferredFollowUpWindow: fieldValue(
      lines,
      fieldLabels.preferredFollowUpWindow,
    ),
    preferredIntroChannels: fieldValue(
      lines,
      fieldLabels.preferredIntroChannels,
    ),
  };
  const emailMatch = text.match(
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  );
  const phoneMatch = text.match(/(?:\+?\d[\d\s().-]{6,}\d)/);
  const websiteMatch = text.match(/\bhttps?:\/\/[^\s]+/i);
  const evidence: ProfileDocumentFieldEvidence[] = [];

  function addEvidence(field: string, value: string, excerpt: string) {
    evidence.push({
      field,
      value,
      evidenceId: `${evidencePrefix}:${evidence.length + 1}`,
      excerpt: clean(excerpt, 500),
    });
  }

  for (const [field, result] of Object.entries(extracted)) {
    if (result) addEvidence(field, result.value, result.excerpt);
  }
  if (emailMatch?.[0]) addEvidence("email", emailMatch[0], emailMatch[0]);
  if (phoneMatch?.[0]) addEvidence("phone", clean(phoneMatch[0]), phoneMatch[0]);
  if (websiteMatch?.[0]) {
    addEvidence("website", clean(websiteMatch[0]), websiteMatch[0]);
  }

  if (evidence.length === 0) {
    return {
      state: "empty",
      kind: input.kind,
      draft: null,
      confidenceSummary:
        "No explicit supported fields were found; unlabeled prose is not guessed into profile data.",
      provenance: {
        source: "live-rule:profile-text-extraction",
        sourceLabel: "Deterministic profile text extractor",
        evidenceIds: [`${evidencePrefix}:unmatched`],
        collectedAt: input.collectedAt,
        privacy: "live-profile-document-policy-only",
        extractionMethod: "rule-based-text-match",
      },
      nextAction:
        "Add labels such as 姓名、公司、职位、市场、关系目标、联系方式 and try again.",
    };
  }

  const organization = extracted.organization?.value ?? "";
  const role = extracted.role?.value ?? "";
  const headline =
    extracted.headline?.value ??
    clean([role, organization].filter(Boolean).join(" · "));
  const targetRelationshipTypes = splitValues(
    extracted.targetRelationshipTypes?.value ?? "",
  );
  const preferredIntroChannels = splitValues(
    extracted.preferredIntroChannels?.value ?? "",
  );
  const confidence =
    evidence.length >= 6 ? "high" : evidence.length >= 3 ? "medium" : "low";
  const draft: ProfileDocumentExtractionDraft = {
    id: `profile-text-draft:${input.kind}:${input.collectedAt}`,
    kind: input.kind,
    displayName: extracted.displayName?.value ?? "",
    headline,
    organization,
    role,
    ...(emailMatch?.[0] ? { email: emailMatch[0] } : {}),
    ...(phoneMatch?.[0] ? { phone: clean(phoneMatch[0]) } : {}),
    ...(websiteMatch?.[0] ? { website: clean(websiteMatch[0]) } : {}),
    homeMarket: extracted.homeMarket?.value ?? "",
    relationshipGoal: extracted.relationshipGoal?.value ?? "",
    targetRelationshipTypes,
    preferredFollowUpWindow:
      extracted.preferredFollowUpWindow?.value ?? "",
    preferredIntroChannels,
    confidence,
    extractedAt: input.collectedAt,
    evidence,
    suggestedProfileFields: {
      ...(headline ? { headline } : {}),
      ...(extracted.homeMarket?.value
        ? { homeMarket: extracted.homeMarket.value }
        : {}),
      ...(extracted.relationshipGoal?.value
        ? { relationshipGoal: extracted.relationshipGoal.value }
        : {}),
      ...(targetRelationshipTypes.length > 0
        ? { targetRelationshipTypes }
        : {}),
      ...(extracted.preferredFollowUpWindow?.value
        ? { preferredFollowUpWindow: extracted.preferredFollowUpWindow.value }
        : {}),
      ...(preferredIntroChannels.length > 0
        ? { preferredIntroChannels }
        : {}),
    },
  };

  return {
    state: "success",
    kind: input.kind,
    draft,
    confidenceSummary: `${evidence.length} explicit profile fields were extracted with ${confidence} confidence.`,
    provenance: {
      source: "live-rule:profile-text-extraction",
      sourceLabel: "Deterministic profile text extractor",
      evidenceIds: evidence.map((item) => item.evidenceId),
      collectedAt: input.collectedAt,
      privacy: "live-profile-document-policy-only",
      extractionMethod: "rule-based-text-match",
    },
    nextAction:
      "Review every extracted field in the form before saving the profile.",
  };
}

function success(
  data: ProfileDocumentExtractionPayload,
): ProfileDocumentExtractionSuccess {
  return {
    success: true,
    data,
  };
}

export function createLiveProfileDocumentExtractionService({
  now = () => new Date().toISOString(),
}: LiveProfileDocumentExtractionServiceOptions = {}): ProfileDocumentExtractionService {
  return {
    extractResumeDraft: (document = {}) =>
      success(
        extractionPayload({
          collectedAt: now(),
          document,
          kind: "resume",
        }),
      ),
    extractBusinessCardDraft: (document = {}) =>
      success(
        extractionPayload({
          collectedAt: now(),
          document,
          kind: "business-card",
        }),
      ),
  };
}
