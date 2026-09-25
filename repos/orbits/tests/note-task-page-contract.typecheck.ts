import type { z } from "zod";
import type { noteTaskPageSchema } from "../shared/api-schema/note-task-page";
import type { NoteTaskPageContract } from "../features/tasks/note-task-page";
import type { ContractMatches } from "../shared/contract-check";
true satisfies ContractMatches<z.infer<typeof noteTaskPageSchema>, NoteTaskPageContract>;
