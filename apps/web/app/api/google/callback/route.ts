import { after, NextResponse, type NextRequest } from "next/server";
import { encrypt, safeEqual, verifyState } from "@/lib/crypto";
import { env } from "@/lib/env";
import { GOOGLE_NONCE_COOKIE, GOOGLE_SCOPES, oauthClient } from "@/lib/google";
import { bootstrapCalendars } from "@/lib/gcal/manage";
import { adminClient } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const done = (status: string) => {
    const res = NextResponse.redirect(new URL(`/settings?google=${status}`, env.appUrl));
    res.cookies.delete({ name: GOOGLE_NONCE_COOKIE, path: "/api/google/callback" });
    return res;
  };

  const state = verifyState(url.searchParams.get("state") ?? "");
  const code = url.searchParams.get("code");
  const cookieNonce = req.cookies.get(GOOGLE_NONCE_COOKIE)?.value ?? "";
  // The nonce must match the cookie set when this browser started the flow (see connect).
  if (!state || !code || !safeEqual(cookieNonce, state.nonce)) return done("error");
  const { userId } = state;

  const client = oauthClient();
  let tokens;
  try {
    ({ tokens } = await client.getToken(code));
  } catch {
    // An expired or reused code, e.g. the user reloaded the page.
    return done("error");
  }
  const granted = tokens.scope?.split(" ") ?? [];
  if (!tokens.refresh_token || !GOOGLE_SCOPES.slice(2).every((s) => granted.includes(s))) {
    return done("missing_scope");
  }
  const info = await client.getTokenInfo(tokens.access_token!);

  const { error } = await adminClient()
    .from("google_accounts")
    .upsert({
      user_id: userId,
      email: info.email ?? "",
      refresh_token_enc: encrypt(tokens.refresh_token),
      scopes: tokens.scope ?? "",
      needs_reconnect: false,
    });
  if (error) throw new Error(error.message);

  // Initial sync can take a while; finish it after redirecting the user.
  after(() => bootstrapCalendars(userId).catch((e) => console.error("bootstrap failed", e)));
  return done("connected");
}
