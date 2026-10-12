import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { ZodError, type ZodTypeAny, type z } from "zod";
import type { Database } from "@tt/shared";
import { env } from "@/lib/env";
import { createCookieClient } from "@/lib/supabase/server";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export type AuthedContext = { user: User; supabase: SupabaseClient<Database> };

export function isAllowedEmail(email: string | undefined): boolean {
  return !!email && env.allowedEmails.includes(email.toLowerCase());
}

/**
 * Resolves the caller from a Bearer token (iOS) or auth cookies (web) and returns a
 * Supabase client acting as that user, so RLS applies to every query.
 */
export async function authenticate(req: NextRequest): Promise<AuthedContext> {
  const bearer = req.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  let supabase: SupabaseClient<Database>;
  let user: User | null;
  if (bearer) {
    supabase = createClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${bearer}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    ({
      data: { user },
    } = await supabase.auth.getUser(bearer));
  } else {
    supabase = await createCookieClient();
    ({
      data: { user },
    } = await supabase.auth.getUser());
  }
  if (!user) throw new HttpError(401, "Not signed in");
  if (!isAllowedEmail(user.email)) throw new HttpError(403, "This account is not allowed");
  return { user, supabase };
}

type Handler<P> = (
  req: NextRequest,
  ctx: AuthedContext & { params: P },
) => Promise<Response | unknown>;

/** Wraps a route handler with auth, JSON responses and uniform error handling. */
export function route<P = Record<string, never>>(handler: Handler<P>) {
  return async (req: NextRequest, { params }: { params: Promise<P> }) => {
    try {
      const auth = await authenticate(req);
      const result = await handler(req, { ...auth, params: await params });
      return result instanceof Response ? result : NextResponse.json(result ?? { ok: true });
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export function errorResponse(err: unknown) {
  if (err instanceof HttpError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  if (err instanceof ZodError) {
    return NextResponse.json({ error: "Invalid request", issues: err.issues }, { status: 400 });
  }
  console.error(err);
  return NextResponse.json({ error: "Internal error" }, { status: 500 });
}

export async function parseBody<S extends ZodTypeAny>(
  req: NextRequest,
  schema: S,
): Promise<z.infer<S>> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw new HttpError(400, "Body must be JSON");
  }
  return schema.parse(json);
}

/** Throws on a Supabase error; 404 when a single-row query finds nothing. */
export function unwrap<
  R extends { data: unknown; error: { message: string; code?: string } | null },
>(res: R): NonNullable<R["data"]> {
  if (res.error) {
    if (res.error.code === "PGRST116") throw new HttpError(404, "Not found");
    throw new Error(res.error.message);
  }
  if (res.data === null || res.data === undefined) throw new HttpError(404, "Not found");
  return res.data as NonNullable<R["data"]>;
}
