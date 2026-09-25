import type { z } from "zod";
import type { contactLabelsSchema } from "../shared/api-schema/contact-labels";
import type { ContactLabelsContract } from "../features/contacts/contract";
import type { ContractMatches } from "../shared/contract-check";
true satisfies ContractMatches<z.infer<typeof contactLabelsSchema>,ContactLabelsContract>;
