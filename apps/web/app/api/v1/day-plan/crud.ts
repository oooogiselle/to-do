import { DayPlanItemCreate, DayPlanItemPatch } from "@tt/shared";
import { crud } from "@/lib/crud";

export const dayPlan = crud({
  table: "day_plan_items",
  create: DayPlanItemCreate,
  patch: DayPlanItemPatch,
  order: "position",
});
