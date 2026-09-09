import { z } from "zod";

// 现有联系人详情响应中的备注子集。正文必须原样保留，不在校验层翻译或裁剪。
export const contactNoteSchema = z.object({
  noteId: z.string().min(1),
  body: z.string(),
  authorLabel: z.string().optional(),
  createdAt: z.string().min(1),
  privacy: z.enum(["private", "relationship_shared"]).optional(),
  sourceLabel: z.string().optional(),
});

export const contactNotesPayloadSchema = z.object({
  contact: z.object({
    id: z.string().min(1),
    notes: z.array(contactNoteSchema),
  }),
});

export type ContactNoteResponse = z.infer<typeof contactNoteSchema>;
