import { z } from "zod";

const nonempty = z.string().trim().min(1);
const answer = nonempty.max(1_000);

export const portraitSaveInputSchema = z.strictObject({
  mutationId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/),
  expectedPortraitVersion: z.number().int().positive().nullable(),
  generationToken: nonempty.max(64_000),
});

export const portraitAnswerProofSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("signed_question"), questionToken: nonempty.max(32_000), portraitAdaptiveToken: nonempty.max(32_000), answer }),
  z.strictObject({ kind: z.literal("registration_question"), portraitQuestionToken: nonempty.max(32_000), answer }),
  z.strictObject({
    kind: z.literal("stored_response"),
    source: z.enum(["registration", "portrait"]),
    responseId: nonempty.max(256),
    sourceVersion: nonempty.max(128),
    answer,
  }),
]);

export const portraitPreviewInputSchema = z.strictObject({ mode: z.literal("portrait-preview"), language: z.enum(["en", "zh"]).default("zh"), responses: z.array(portraitAnswerProofSchema).min(2).max(8).readonly() });
export const portraitRenewInputSchema = z.strictObject({ mode: z.literal("renew-stored-question"), source: z.enum(["registration", "portrait"]), responseId: nonempty.max(256), sourceVersion: nonempty.max(128) });

const field = z.enum(["positioning", "industry", "targetAttendees", "valueOffered", "desiredOutcome", "energyStyle", "experienceHighlight", "followUpPreference"]);
const timestamp = z.iso.datetime({ offset: true });
const labels = z.strictObject({ en: nonempty.max(120), zh: nonempty.max(120) });
const question = z.strictObject({
  fieldLabel: labels,
  inputKind: z.literal("single_choice_with_custom"),
  language: z.enum(["en", "zh"]),
  options: z.array(z.strictObject({ id: nonempty.max(128), label: nonempty.max(1_000) })).max(8).readonly(),
  prompt: nonempty.max(2_000),
});
export const portraitSourceAnswerSchema = z.strictObject({
  responseId: nonempty.max(256), field, label: labels, answer,
  question: question.nullable(),
  questionSource: z.enum(["ai_adaptive", "registration_question", "legacy_unknown"]),
  generation: z.strictObject({ method: nonempty.max(128), model: nonempty.max(256).nullable(), provider: nonempty.max(128).nullable(), promptVersion: z.number().int().positive() }).nullable(),
  source: z.enum(["signed_question", "registration_question", "registration", "portrait"]),
  sourceVersion: nonempty.max(128).nullable(),
});
export const portraitPersonaSchema = z.strictObject({
  energyStyle: nonempty.max(1_000), industryTags: z.array(nonempty.max(120)).min(1).max(3).readonly(),
  offering: nonempty.max(1_000), openers: z.array(nonempty.max(1_000)).min(1).max(8).readonly(),
  seeking: nonempty.max(1_000), tagline: nonempty.max(1_000), tags: z.array(nonempty.max(120)).min(1).max(8).readonly(),
  provenance: z.strictObject({ generationMethod: z.literal("orbit-agent-model-adaptive"), fallbackReason: z.null(), model: nonempty.max(256), provider: nonempty.max(128) }),
});
export const portraitGenerationSchema = z.strictObject({
  sourceRegistrationFingerprint: z.string().regex(/^[a-f0-9]{64}$/).nullable().optional(),
  answersVersion: z.string().regex(/^[a-f0-9]{64}$/),
  sourceEventVersion: nonempty.max(256), sourceQuestionSetHash: nonempty.max(256).nullable(), sourceQuestionSetVersion: z.number().int().positive().nullable(),
  sourceRegistrationVersion: timestamp.nullable(), generatedAt: timestamp,
  persona: portraitPersonaSchema,
  sourceAnswers: z.array(portraitSourceAnswerSchema).min(2).max(8).readonly(),
}).refine((value) => {
  const fields = new Set(value.sourceAnswers.map((item) => item.field));
  const ids = new Set(value.sourceAnswers.map((item) => item.responseId));
  return fields.size === value.sourceAnswers.length && ids.size === value.sourceAnswers.length && fields.has("targetAttendees") && fields.has("valueOffered");
}, { message: "Distinct answers including both core fields are required." });

export const savedPortraitSchema = portraitGenerationSchema.safeExtend({
  id: nonempty.max(256), actorId: nonempty.max(256), eventId: nonempty.max(256),
  version: z.number().int().positive(), updatedAt: timestamp,
});
export const portraitReceiptSchema = z.strictObject({
  mutationId: nonempty.max(128), portraitId: nonempty.max(256), actorId: nonempty.max(256), eventId: nonempty.max(256),
  portraitVersion: z.number().int().positive(), answersVersion: z.string().regex(/^[a-f0-9]{64}$/), updatedAt: timestamp,
});
export const portraitRegistrationSourceSchema = z.strictObject({ actorId: nonempty.max(256), eventId: nonempty.max(256), sourceVersion: nonempty.max(128), answers: z.array(portraitSourceAnswerSchema).max(8).readonly() }).refine(value => value.answers.every(answer => answer.source === "registration" && answer.sourceVersion === value.sourceVersion) && new Set(value.answers.map(answer => answer.field)).size === value.answers.length && new Set(value.answers.map(answer => answer.responseId)).size === value.answers.length);
export const portraitReadResultSchema = z.strictObject({ portrait: savedPortraitSchema.nullable(), registrationSource: portraitRegistrationSourceSchema.nullable().optional() });
export const portraitSaveResultSchema = z.strictObject({ portrait: savedPortraitSchema, receipt: portraitReceiptSchema }).refine(({ portrait, receipt }) =>
  receipt.portraitId === portrait.id && receipt.actorId === portrait.actorId && receipt.eventId === portrait.eventId && receipt.portraitVersion === portrait.version && receipt.answersVersion === portrait.answersVersion && receipt.updatedAt === portrait.updatedAt,
  { message: "The portrait receipt must match its saved result." },
);
