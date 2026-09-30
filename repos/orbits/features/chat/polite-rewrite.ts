// Polite rewrite for the web relationship inbox composer.
//
// Rule-based and built from the request alone: it never reads conversation
// history, never calls an AI provider and never sends anything. This replaced
// the legacy chat writing-assist service (Sprint 0104), which looked the
// conversation up in the retired `conversations`/`messages` collections and
// therefore failed for every relationship-communication conversation.

export const POLITE_REWRITE_MAX_LENGTH = 10_000;

export interface PoliteRewriteInput {
  conversationId?: string | null;
  organization?: string | null;
  participantName?: string | null;
  sourceText?: string | null;
}

export interface PoliteRewriteSuggestion {
  aiProviderRequested: false;
  conversationId: string | null;
  externalSendRequested: false;
  generatedBy: "rule-based-polite-rewrite";
  kind: "polite_rewrite";
  organization: string;
  originalText: string;
  participantName: string;
  sendActionRequiresConfirmation: true;
  suggestedText: string;
}

export type PoliteRewriteResult =
  | { success: true; data: { state: "success"; assists: [PoliteRewriteSuggestion] } }
  | { success: false; error: { code: "POLITE_REWRITE_INPUT_REQUIRED"; message: string } };

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function rewritePolitely(input: PoliteRewriteInput): PoliteRewriteResult {
  const originalText = text(input.sourceText);

  if (!originalText || originalText.length > POLITE_REWRITE_MAX_LENGTH) {
    return {
      success: false,
      error: {
        code: "POLITE_REWRITE_INPUT_REQUIRED",
        message: "Provide the draft text (at most 10000 characters) to rewrite.",
      },
    };
  }

  const participantName = text(input.participantName) || "there";

  return {
    success: true,
    data: {
      state: "success",
      assists: [
        {
          aiProviderRequested: false,
          conversationId: text(input.conversationId) || null,
          externalSendRequested: false,
          generatedBy: "rule-based-polite-rewrite",
          kind: "polite_rewrite",
          organization: text(input.organization),
          originalText,
          participantName,
          sendActionRequiresConfirmation: true,
          suggestedText: `Hi ${participantName}, could you please help with this request: “${originalText}”? Thank you.`,
        },
      ],
    },
  };
}
