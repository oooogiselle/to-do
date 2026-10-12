import { ListCreate, ListPatch } from "@tt/shared";
import { crud } from "@/lib/crud";

export const lists = crud({
  table: "lists",
  create: ListCreate,
  patch: ListPatch,
  order: "sort_order",
});
