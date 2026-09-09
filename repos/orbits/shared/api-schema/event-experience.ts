import { z } from "zod";

import type {
  EventExperiencePreviewResponseContract,
  EventExperienceSnapshotContract,
  EventExperienceVersionContract,
} from "../contract/event-experience";

const nonEmptyString = z.string().refine((value) => value.trim().length > 0);
const timestamp = z.iso.datetime({ offset: true });
const revision = z.number().finite().int().nonnegative();
const persistedVersion = z.number().finite().int().positive();
const questionIntent = z.enum([
  "target_attendees",
  "value_offered",
  "desired_outcome",
  "follow_up_preference",
  "positioning",
]);
const profileFieldByIntent = {
  target_attendees: "targetAttendees",
  value_offered: "valueOffered",
  desired_outcome: "desiredOutcome",
  follow_up_preference: "followUpPreference",
  positioning: "positioning",
} as const;

const questionSchema = z.object({
  id: questionIntent,
  intent: questionIntent,
  options: z.array(nonEmptyString).readonly(),
  participantProfileField: z.enum([
    "targetAttendees",
    "valueOffered",
    "desiredOutcome",
    "followUpPreference",
    "positioning",
  ]),
  prompt: nonEmptyString,
  required: z.boolean(),
}).refine(
  (question) => question.id === question.intent &&
    question.participantProfileField === profileFieldByIntent[question.intent],
  { message: "Question identity must use the fixed profile mapping." },
);

const configurationSchema = z.object({
  coverAssetId: z.null(),
  introduction: nonEmptyString.nullable(),
  accentColor: z.string().regex(/^#[0-9a-f]{6}$/i).nullable(),
  questionSet: z.object({
    questions: z.array(questionSchema).readonly(),
    track: z.enum(["v1", "v2"]),
  }),
  templateId: z.literal("default"),
});

const versionSchema = z.object({
  configuration: configurationSchema,
  createdAt: timestamp,
  createdByActorId: nonEmptyString,
  eventId: nonEmptyString,
  hash: nonEmptyString,
  version: persistedVersion,
});

// Zod's nullable/readonly inference is optional under Web's non-strict TS
// config. Project validated fields explicitly so DTO output needs no cast.
function versionContract(value: z.output<typeof versionSchema>): EventExperienceVersionContract {
  return {
    ...value,
    configuration: {
      ...value.configuration,
      introduction: value.configuration.introduction,
      accentColor: value.configuration.accentColor,
      questionSet: {
        ...value.configuration.questionSet,
        questions: value.configuration.questionSet.questions.map((question) => ({
          ...question,
          options: question.options,
        })),
      },
    },
  };
}

export const eventExperienceSnapshotSchema: z.ZodType<EventExperienceSnapshotContract> = z.object({
  draft: versionSchema.nullable(),
  head: z.object({
    draftVersion: persistedVersion.nullable(),
    eventId: nonEmptyString,
    frozenAt: timestamp.nullable(),
    publishedAt: timestamp.nullable(),
    publishedVersion: persistedVersion.nullable(),
    revision,
  }),
  published: versionSchema.nullable(),
}).superRefine((snapshot, context) => {
  // A response must be self-consistent; request-event and authorization checks
  // still belong to the consumer and server respectively.
  for (const slot of ["draft", "published"] as const) {
    const version = snapshot[slot];
    if ((version?.version ?? null) !== snapshot.head[`${slot}Version`]) {
      context.addIssue({ code: "custom", path: [slot], message: "Version must match its head pointer." });
    }
    if (version && version.eventId !== snapshot.head.eventId) {
      context.addIssue({ code: "custom", path: [slot, "eventId"], message: "Version must belong to the head event." });
    }
  }
}).transform((snapshot) => ({
  draft: snapshot.draft === null ? null : versionContract(snapshot.draft),
  head: {
    ...snapshot.head,
    draftVersion: snapshot.head.draftVersion,
    publishedVersion: snapshot.head.publishedVersion,
    frozenAt: snapshot.head.frozenAt,
    publishedAt: snapshot.head.publishedAt,
  },
  published: snapshot.published === null ? null : versionContract(snapshot.published),
}));

export const eventExperiencePreviewResponseSchema: z.ZodType<EventExperiencePreviewResponseContract> = z.object({
  version: versionSchema.extend({
    eventId: z.literal("preview"),
    createdByActorId: z.literal("preview"),
    version: z.literal(0),
  }),
}).transform(({ version }) => ({ version: versionContract(version) }));
