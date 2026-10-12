import { StepCreate, StepPatch } from "@tt/shared";
import { crud } from "@/lib/crud";

export const steps = crud({ table: "steps", create: StepCreate, patch: StepPatch, order: "order" });
