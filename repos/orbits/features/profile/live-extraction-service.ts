import type {
  ProfileDocumentExtractionKind,
  ProfileDocumentExtractionPayload,
  ProfileDocumentExtractionService,
  ProfileDocumentExtractionSuccess,
} from "./extraction-contract";

export interface LiveProfileDocumentExtractionServiceOptions {
  now?: () => string;
}

function payload(
  kind: ProfileDocumentExtractionKind,
  collectedAt: string,
): ProfileDocumentExtractionPayload {
  return {
    state: "empty",
    kind,
    draft: null,
    confidenceSummary:
      "Live document extraction is policy-only until a reviewed OCR/parser provider is connected.",
    provenance: {
      source: "live-policy:profile-document-extraction",
      sourceLabel: "Profile document extraction live policy",
      evidenceIds: [`evidence:profile-document-live-policy:${kind}`],
      collectedAt,
      privacy: "live-profile-document-policy-only",
      extractionMethod: "live-policy-no-op",
    },
    nextAction:
      "Use reviewed profile text or a future document provider before extracting profile fields.",
  };
}

function success(data: ProfileDocumentExtractionPayload): ProfileDocumentExtractionSuccess {
  return {
    success: true,
    data,
  };
}

export function createLiveProfileDocumentExtractionService({
  now = () => new Date().toISOString(),
}: LiveProfileDocumentExtractionServiceOptions = {}): ProfileDocumentExtractionService {
  return {
    extractResumeDraft: () => success(payload("resume", now())),
    extractBusinessCardDraft: () => success(payload("business-card", now())),
  };
}
