import { oc } from "@orpc/contract";
import { z } from "zod";
import {
  HealthSchema,
  ItemCreateSchema,
  ItemIdParamSchema,
  ItemSchema,
  ItemUpdateSchema,
} from "./schemas.js";

export const healthContract = oc.route({ method: "GET", path: "/health" }).output(HealthSchema);

export const itemsContract = oc.router({
  list: oc.route({ method: "GET", path: "/items" }).output(z.array(ItemSchema)),

  get: oc.route({ method: "GET", path: "/items/{id}" }).input(ItemIdParamSchema).output(ItemSchema),

  create: oc.route({ method: "POST", path: "/items" }).input(ItemCreateSchema).output(ItemSchema),

  update: oc
    .route({ method: "PUT", path: "/items/{id}" })
    .input(ItemUpdateSchema)
    .output(ItemSchema),

  delete: oc
    .route({ method: "DELETE", path: "/items/{id}" })
    .input(ItemIdParamSchema)
    .output(z.object({ deleted: z.boolean() })),
});

export const appContract = oc.router({
  health: healthContract,
  items: itemsContract,
});

export type AppContract = typeof appContract;
