import { TaskCreate, TaskStatus } from "@tt/shared";
import { parseBody, route, unwrap } from "@/lib/api";

export const GET = route(async (req, { supabase }) => {
  const params = req.nextUrl.searchParams;
  let query = supabase.from("tasks").select("*").is("deleted_at", null);
  const listId = params.get("list_id");
  if (listId) query = query.eq("list_id", listId);
  const status = params.get("status");
  if (status) query = query.eq("status", TaskStatus.parse(status));
  return unwrap(await query.order("due_at", { ascending: true, nullsFirst: false }));
});

export const POST = route(async (req, { supabase }) => {
  const body = await parseBody(req, TaskCreate);
  return unwrap(await supabase.from("tasks").insert(body).select().single());
});
