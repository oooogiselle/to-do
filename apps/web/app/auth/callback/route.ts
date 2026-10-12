import { NextResponse, type NextRequest } from "next/server";
import { isAllowedEmail } from "@/lib/api";
import { createCookieClient } from "@/lib/supabase/server";

/** Supabase OAuth (Google sign-in) redirect target: exchanges the code for a session. */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const supabase = await createCookieClient();
  if (code) await supabase.auth.exchangeCodeForSession(code);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login?error=signin", url.origin));
  if (!isAllowedEmail(user.email)) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/login?error=not_allowed", url.origin));
  }
  return NextResponse.redirect(new URL("/", url.origin));
}
