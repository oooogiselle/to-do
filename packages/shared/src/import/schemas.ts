import { z } from "zod";
import { Priority } from "../schemas";

export const ImportKind = z.enum(["text", "syllabus"]);
export type ImportKind = z.infer<typeof ImportKind>;

export const TaskKind = z.enum(["assignment", "exam", "reading", "task", "other"]);
export type TaskKind = z.infer<typeof TaskKind>;

/** A task the AI found, ready for the review screen. Nothing is saved yet. */
export const ProposedTask = z.object({
  key: z.string(),
  title: z.string(),
  due_at: z.string().nullable(),
  /** False when only a date was given (due 11:59pm local). */
  has_time: z.boolean(),
  date_certain: z.boolean(),
  date_note: z.string().nullable(),
  kind: TaskKind,
  list_hint: z.string().nullable(),
  priority: Priority,
  estimate_min: z.number().int().nullable(),
  source_quote: z.string(),
  /** Whether the quote was found in the input; null when it couldn't be checked (files). */
  source_found: z.boolean().nullable(),
});
export type ProposedTask = z.infer<typeof ProposedTask>;

export const TextExtractionResult = z.object({ tasks: z.array(ProposedTask) });
export type TextExtractionResult = z.infer<typeof TextExtractionResult>;

export const SyllabusExtractionResult = z.object({
  course: z.object({ code: z.string().nullable(), title: z.string().nullable() }),
  tasks: z.array(ProposedTask),
});
export type SyllabusExtractionResult = z.infer<typeof SyllabusExtractionResult>;

export const ExtractTextRequest = z.object({ text: z.string().trim().min(1).max(200_000) });
export const ExtractSyllabusRequest = z.union([
  z.object({ text: z.string().trim().min(1).max(200_000) }),
  z.object({ storage_path: z.string().min(1).max(500), file_name: z.string().max(200).optional() }),
]);

/** Review screen → server. Committed atomically by commit_import(). */
export const ImportCommit = z.object({
  kind: ImportKind,
  name: z.string().min(1).max(200),
  list: z
    .union([
      z.object({ id: z.string().uuid() }),
      z.object({ new: z.object({ name: z.string().trim().min(1).max(100), color: z.string() }) }),
    ])
    .nullable(),
  creates: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(300),
        due_at: z.string().datetime({ offset: true }).nullable(),
        priority: Priority,
        estimate_min: z.number().int().positive().nullable(),
        source_quote: z.string().max(2000).nullable(),
        /** "target" = the list chosen at the top of the review screen. */
        list: z.union([z.literal("target"), z.string().uuid()]).nullable(),
      }),
    )
    .max(300),
  updates: z
    .array(
      z.object({
        id: z.string().uuid(),
        title: z.string().trim().min(1).max(300).optional(),
        due_at: z.string().datetime({ offset: true }).nullable().optional(),
        priority: Priority.optional(),
      }),
    )
    .max(300),
});
export type ImportCommit = z.infer<typeof ImportCommit>;

export type ImportCommitResult = {
  import_id: string;
  list_id: string | null;
  created: string[];
  updated: string[];
};
