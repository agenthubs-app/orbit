export type PortraitField = "positioning" | "industry" | "targetAttendees" | "valueOffered" | "desiredOutcome" | "energyStyle" | "experienceHighlight" | "followUpPreference";

export type PortraitAnswerProof =
  | { kind: "signed_question"; questionToken: string; portraitAdaptiveToken: string; answer: string }
  | { kind: "registration_question"; portraitQuestionToken: string; answer: string }
  | { kind: "stored_response"; source: "registration" | "portrait"; responseId: string; sourceVersion: string; answer: string };

export interface PortraitQuestionSnapshot {
  fieldLabel: { en: string; zh: string };
  inputKind: "single_choice_with_custom";
  language: "en" | "zh";
  options: readonly { id: string; label: string }[];
  prompt: string;
}

export interface PortraitSourceAnswer {
  responseId: string;
  field: PortraitField;
  label: { en: string; zh: string };
  answer: string;
  question: PortraitQuestionSnapshot | null;
  questionSource: "ai_adaptive" | "registration_question" | "legacy_unknown";
  generation: { method: string; model: string | null; provider: string | null; promptVersion: number } | null;
  source: "signed_question" | "registration_question" | "registration" | "portrait";
  sourceVersion: string | null;
}

export interface PortraitPersona {
  energyStyle: string;
  industryTags: readonly string[];
  offering: string;
  openers: readonly string[];
  seeking: string;
  tagline: string;
  tags: readonly string[];
  provenance: {
    generationMethod: "orbit-agent-model-adaptive";
    fallbackReason: null;
    model: string;
    provider: string;
  };
}

export interface PortraitGeneration {
  /** New portrait-only canonical physical-version binding; never a registration writer CAS. */
  sourceRegistrationFingerprint?: string | null;
  answersVersion: string;
  sourceEventVersion: string;
  sourceQuestionSetHash: string | null;
  sourceQuestionSetVersion: number | null;
  sourceRegistrationVersion: string | null;
  generatedAt: string;
  persona: PortraitPersona;
  sourceAnswers: readonly PortraitSourceAnswer[];
}

export interface SavedPortrait extends PortraitGeneration {
  id: string;
  actorId: string;
  eventId: string;
  version: number;
  updatedAt: string;
}

export interface PortraitSaveBody {
  mutationId: string;
  expectedPortraitVersion: number | null;
  generationToken: string;
}

export interface PortraitReceipt {
  mutationId: string;
  portraitId: string;
  actorId: string;
  eventId: string;
  portraitVersion: number;
  answersVersion: string;
  updatedAt: string;
}

export interface PortraitPreviewResult {
  persona: PortraitPersona;
  generationToken: string;
  answersVersion: string;
  sourceRegistrationVersion: string | null;
}

export interface PortraitSaveResult { portrait: SavedPortrait; receipt: PortraitReceipt }
export interface PortraitRegistrationSource { actorId: string; eventId: string; sourceVersion: string; answers: readonly PortraitSourceAnswer[] }
export interface PortraitReadResult { portrait: SavedPortrait | null; registrationSource?: PortraitRegistrationSource | null }
