import type { z } from "zod";
import type { taskSuggestionPageSchema } from "../shared/api-schema/task-suggestion-page";
import type { TaskSuggestionPageContract } from "../features/tasks/suggestion-page";
import type { ContractMatches } from "../shared/contract-check";
true satisfies ContractMatches<z.infer<typeof taskSuggestionPageSchema>, TaskSuggestionPageContract>;
