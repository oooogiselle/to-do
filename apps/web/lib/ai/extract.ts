import "server-only";
import { z } from "zod/v4";
import {
  chunkText,
  locateQuote,
  mergeExtracted,
  normalize,
  toDueAt,
  type ProposedTask,
  type SyllabusExtractionResult,
} from "@tt/shared";
import { runStructured } from "@/lib/ai/client";
import { assertAiAllowed } from "@/lib/ai/limits";

const CHUNK_CHARS = 16_000;
const CONCURRENCY = 4;

const Item = z.object({
  title: z
    .string()
    .describe("Short task title, e.g. 'CS61 lab report' or 'Email prof about extension'"),
  due_date: z
    .string()
    .nullable()
    .describe("Local due date as YYYY-MM-DD, or null if none is given"),
  due_time: z.string().nullable().describe("Local due time as 24h HH:MM if stated, else null"),
  date_certain: z
    .boolean()
    .describe("False if the date was guessed, ambiguous, or the year/month had to be inferred"),
  date_note: z.string().nullable().describe("When date_certain is false, a few words on why"),
  kind: z.enum(["assignment", "exam", "reading", "task", "other"]),
  list_hint: z
    .string()
    .nullable()
    .describe("Course code or existing list name this belongs to, if clear"),
  priority: z
    .enum(["none", "low", "med", "high"])
    .describe("Only if the text signals urgency or importance"),
  estimate_min: z.number().int().nullable().describe("Minutes of work, only if stated or obvious"),
  source_quote: z
    .string()
    .describe(
      "The exact words from the input this item came from, copied verbatim (one sentence or line)",
    ),
});
type Item = z.infer<typeof Item>;

const TextOutput = z.object({ tasks: z.array(Item) });
const SyllabusOutput = z.object({
  course: z.object({
    code: z.string().nullable().describe("Course code like 'CS74', or null"),
    title: z.string().nullable(),
  }),
  tasks: z.array(Item),
});

export type ExtractContext = {
  userId: string;
  timezone: string;
  lists: string[];
  now?: Date;
};

function contextLines(ctx: ExtractContext) {
  const now = ctx.now ?? new Date();
  const today = now.toLocaleDateString("en-US", {
    timeZone: ctx.timezone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return [
    `Today is ${today}. Time zone: ${ctx.timezone}.`,
    ctx.lists.length
      ? `The user's existing lists: ${ctx.lists.join(", ")}.`
      : "The user has no lists yet.",
  ].join("\n");
}

const TEXT_SYSTEM = `You turn whatever a university student pastes (a one-liner, a brain dump, an email thread, meeting notes, a project brief) into their to-do items.

Find every actionable item the student needs to do. Split lists like "lab fri, email prof, buy poster board" into separate items. Skip information that needs no action, and things other people will do unless the student has to follow up.

For each item:
- title: short and specific, in the student's words where possible
- due_date / due_time: resolve relative dates ("fri", "next Tuesday", "tomorrow") against today, as local wall-clock values. Null if no deadline is given. Mark date_certain false if you had to guess or infer.
- list_hint: an existing list name or course code when the item clearly belongs to one
- source_quote: copy the exact words from the input, verbatim, so the student can see where it came from

Only return items that are actually in this text. An empty list is fine.`;

const SYLLABUS_SYSTEM = `You read a course syllabus and list every graded or scheduled piece of work: assignments, problem sets, projects, labs, quizzes, exams (midterms, finals), and assigned readings.

For each item:
- title: as the syllabus names it, e.g. "Problem Set 3", "Midterm 1", "Read Chapter 4"
- due_date / due_time: local wall-clock values. Syllabi often omit the year: infer it from the term and today's date. For readings tied to a class session, use that session's date. For exams, use the exam start time if given. If a date is missing, ambiguous ("TBA", "week 5" with no calendar), or inferred, set date_certain false and explain in date_note.
- When the syllabus gives a recurring rule ("problem sets due every Friday") and the term dates, list each occurrence. If you can't determine the dates, list the item once with date_certain false.
- kind: assignment, exam, reading, or other
- list_hint: the course code
- source_quote: the exact line or phrase from the syllabus this came from

Include every item, even ones that are already past.`;

function toProposed(
  items: Item[],
  ctx: ExtractContext,
  opts: { allowPast: boolean; source: string | null },
): ProposedTask[] {
  const now = (ctx.now ?? new Date()).getTime();
  return items.map((it, i) => {
    const { due_at, has_time, suspicious } = toDueAt(it.due_date, it.due_time, {
      timezone: ctx.timezone,
      now,
      allowPast: opts.allowPast,
    });
    const priority = it.priority;
    return {
      key: `${i}-${normalize(it.title).slice(0, 24)}`,
      title: it.title.trim().slice(0, 300),
      due_at,
      has_time,
      date_certain: it.date_certain && !suspicious && (due_at !== null || it.due_date === null),
      date_note: suspicious ?? it.date_note,
      kind: it.kind,
      list_hint: it.list_hint,
      priority,
      estimate_min:
        it.estimate_min && it.estimate_min > 0 ? Math.min(it.estimate_min, 24 * 60) : null,
      source_quote: it.source_quote.trim().slice(0, 2000),
      source_found:
        opts.source === null ? null : locateQuote(opts.source, it.source_quote) !== null,
    };
  });
}

/** Runs `fn` over items with at most `limit` in flight. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]!);
      }
    }),
  );
  return out;
}

/** Free text of any length: chunked so long inputs don't drop items, then merged. */
export async function extractFromText(text: string, ctx: ExtractContext): Promise<ProposedTask[]> {
  await assertAiAllowed(ctx.userId, "extract");
  const chunks = chunkText(text, CHUNK_CHARS);
  const results = await mapLimit(chunks, CONCURRENCY, (chunk) =>
    runStructured({
      userId: ctx.userId,
      system: TEXT_SYSTEM,
      content: `${contextLines(ctx)}\n\n${
        chunks.length > 1 ? `This is part of a longer text. ` : ""
      }Text:\n<<<\n${chunk.text}\n>>>`,
      schema: TextOutput,
      effort: "low",
    }),
  );
  const merged = mergeExtracted(results.flatMap((r) => r.tasks));
  return toProposed(merged, ctx, { allowPast: false, source: text });
}

export type SyllabusSource =
  | { kind: "text"; text: string }
  | { kind: "pdf"; base64: string }
  | {
      kind: "image";
      base64: string;
      mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
    };

/** A syllabus as text, PDF or image, in one request (the model reads the whole document). */
export async function extractSyllabus(
  source: SyllabusSource,
  ctx: ExtractContext,
): Promise<SyllabusExtractionResult> {
  await assertAiAllowed(ctx.userId, "extract");
  const intro = `${contextLines(ctx)}\n\nExtract every assignment, exam and reading from this syllabus.`;
  const content =
    source.kind === "text"
      ? `${intro}\n\nSyllabus:\n<<<\n${source.text}\n>>>`
      : [
          source.kind === "pdf"
            ? ({
                type: "document",
                source: { type: "base64", media_type: "application/pdf", data: source.base64 },
              } as const)
            : ({
                type: "image",
                source: { type: "base64", media_type: source.mediaType, data: source.base64 },
              } as const),
          { type: "text" as const, text: intro },
        ];
  const out = await runStructured({
    userId: ctx.userId,
    system: SYLLABUS_SYSTEM,
    content,
    schema: SyllabusOutput,
    effort: "medium",
    maxTokens: 32000,
  });
  return {
    course: out.course,
    tasks: toProposed(mergeExtracted(out.tasks), ctx, {
      allowPast: true,
      source: source.kind === "text" ? source.text : null,
    }),
  };
}
