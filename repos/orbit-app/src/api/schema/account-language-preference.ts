import { z } from "zod";

const timestamp = z.iso.datetime({ offset: true });
const language = z.enum(["zh", "ja", "en"]);

export const accountLanguagePreferenceSchema = z.discriminatedUnion("mode", [
  z.object({
    language: z.null(),
    mode: z.literal("system"),
    updatedAt: timestamp.nullable(),
  }),
  z.object({
    language,
    mode: z.literal("manual"),
    updatedAt: timestamp,
  }),
]);

export const accountLanguagePreferenceSaveInputSchema = z.discriminatedUnion("mode", [
  z.object({
    expectedUpdatedAt: timestamp.nullable(),
    language: z.null(),
    mode: z.literal("system"),
    mutationId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/),
  }),
  z.object({
    expectedUpdatedAt: timestamp.nullable(),
    language,
    mode: z.literal("manual"),
    mutationId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/),
  }),
]);

export const accountLanguagePreferenceSaveReceiptSchema = z.intersection(
  accountLanguagePreferenceSchema,
  z.object({ mutationId: z.string().min(1) }),
);
