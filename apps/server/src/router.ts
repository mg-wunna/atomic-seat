import { appContract } from "@template/api";
import { ORPCError, implement } from "@orpc/server";
import { itemStore } from "./store.js";

const os = implement(appContract);

export const appRouter = os.router({
  health: os.health.handler(() => ({
    status: "ok" as const,
    timestamp: Date.now(),
  })),

  items: {
    list: os.items.list.handler(() => itemStore.list()),

    get: os.items.get.handler(({ input }) => {
      const item = itemStore.get(input.id);
      if (!item) throw new ORPCError("NOT_FOUND", { message: `Item ${input.id} not found` });
      return item;
    }),

    create: os.items.create.handler(({ input }) => itemStore.create(input.name)),

    update: os.items.update.handler(({ input }) => {
      const item = itemStore.update(input.id, input.name);
      if (!item) throw new ORPCError("NOT_FOUND", { message: `Item ${input.id} not found` });
      return item;
    }),

    delete: os.items.delete.handler(({ input }) => ({
      deleted: itemStore.delete(input.id),
    })),
  },
});

export type AppRouter = typeof appRouter;
