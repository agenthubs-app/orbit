import { z } from "zod";

export const contactLabelsSchema = z.object({
  actorId:z.string().min(1).max(2048),
  items:z.array(z.object({id:z.string().min(1).max(2048),namePreview:z.string().max(240),organizationPreview:z.string().max(240)}).strict()).max(30),
  asOf:z.string().max(40).refine(value=>Number.isFinite(Date.parse(value))),
}).strict().refine(value=>new Set(value.items.map(item=>item.id)).size===value.items.length);
