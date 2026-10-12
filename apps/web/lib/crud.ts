import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ZodTypeAny } from "zod";
import { parseBody, route, unwrap } from "@/lib/api";

// The tables share a shape (id, deleted_at, ...), so queries go through an untyped client.
const loose = (c: unknown) => c as SupabaseClient;

type Opts = { table: "lists" | "steps"; create: ZodTypeAny; patch: ZodTypeAny; order?: string };

/** Collection + item handlers for a user-owned, soft-deletable table. RLS scopes every query. */
export function crud({ table, create, patch, order = "created_at" }: Opts) {
  return {
    collection: {
      GET: route(async (_req, { supabase: db }) =>
        unwrap(await loose(db).from(table).select("*").is("deleted_at", null).order(order)),
      ),
      POST: route(async (req, { supabase: db }) => {
        const body = await parseBody(req, create);
        return unwrap(await loose(db).from(table).insert(body).select().single());
      }),
    },
    item: {
      GET: route<{ id: string }>(async (_req, { supabase: db, params }) =>
        unwrap(
          await loose(db)
            .from(table)
            .select("*")
            .eq("id", params.id)
            .is("deleted_at", null)
            .single(),
        ),
      ),
      PATCH: route<{ id: string }>(async (req, { supabase: db, params }) => {
        const body = await parseBody(req, patch);
        return unwrap(
          await loose(db)
            .from(table)
            .update(body)
            .eq("id", params.id)
            .is("deleted_at", null)
            .select()
            .single(),
        );
      }),
      DELETE: route<{ id: string }>(async (_req, { supabase: db, params }) => {
        unwrap(
          await loose(db)
            .from(table)
            .update({ deleted_at: new Date().toISOString() })
            .eq("id", params.id)
            .is("deleted_at", null)
            .select("id")
            .single(),
        );
        return { ok: true };
      }),
    },
  };
}
