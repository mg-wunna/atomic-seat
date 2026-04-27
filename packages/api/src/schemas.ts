import { z } from "zod";

export const HealthSchema = z.object({
  status: z.literal("ok"),
  timestamp: z.number(),
});
export type Health = z.infer<typeof HealthSchema>;

export const ItemSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(120),
  createdAt: z.number(),
});
export type Item = z.infer<typeof ItemSchema>;

export const ItemCreateSchema = z.object({
  name: z.string().min(1).max(120),
});
export type ItemCreate = z.infer<typeof ItemCreateSchema>;

export const ItemUpdateSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(120),
});
export type ItemUpdate = z.infer<typeof ItemUpdateSchema>;

export const ItemIdParamSchema = z.object({
  id: z.string(),
});
export type ItemIdParam = z.infer<typeof ItemIdParamSchema>;
