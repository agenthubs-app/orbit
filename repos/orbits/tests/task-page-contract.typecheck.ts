import type { z } from "zod";
import type { taskPageSchema } from "../shared/api-schema/task-page";
import type { TaskPageContract } from "../features/tasks/contract";
import type { ContractMatches } from "../shared/contract-check";

// An actual assignment (not just an alias) makes drift fail compilation.
true satisfies ContractMatches<z.infer<typeof taskPageSchema>, TaskPageContract>;
