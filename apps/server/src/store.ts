import type { Item } from "@template/api";

const items = new Map<string, Item>();

function newId(): string {
  return crypto.randomUUID();
}

export const itemStore = {
  list(): Item[] {
    return [...items.values()].sort((a, b) => a.createdAt - b.createdAt);
  },
  get(id: string): Item | undefined {
    return items.get(id);
  },
  create(name: string): Item {
    const item: Item = { id: newId(), name, createdAt: Date.now() };
    items.set(item.id, item);
    return item;
  },
  update(id: string, name: string): Item | undefined {
    const existing = items.get(id);
    if (!existing) return undefined;
    const next: Item = { ...existing, name };
    items.set(id, next);
    return next;
  },
  delete(id: string): boolean {
    return items.delete(id);
  },
};
