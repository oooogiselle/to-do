import { after, NextResponse, type NextRequest } from "next/server";
import { encrypt, verifyState } from "@/lib/crypto";
import { env } from "@/lib/env";
import { GOOGLE_SCOPES, oauthClient } from "@/lib/google";
import { bootstrapCalendars } from "@/lib/gcal/manage";
import { adminClient } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const settingsUrl = (status: string) => new URL(`/settings?google=${status}`, env.appUrl);

  const userId = verifyState(url.searchParams.get("state") ?? "");
  const code = url.searchParams.get("code");
  if (!userId || !code) return NextResponse.redirect(settingsUrl("error"));

  const client = oauthClient();
  const { tokens } = await client.getToken(code);
  const granted = tokens.scope?.split(" ") ?? [];
  if (!tokens.refresh_token || !GOOGLE_SCOPES.slice(2).every((s) => granted.includes(s))) {
    return NextResponse.redirect(settingsUrl("missing_scope"));
  }
  const info = await client.getTokenInfo(tokens.access_token!);

  const { error } = await adminClient()
    .from("google_accounts")
    .upsert({
      user_id: userId,
      email: info.email ?? "",
      refresh_token_enc: encrypt(tokens.refresh_token),
      scopes: tokens.scope ?? "",
    });
  if (error) throw new Error(error.message);

  // Initial sync can take a while; finish it after redirecting the user.
  after(() => bootstrapCalendars(userId).catch((e) => console.error("bootstrap failed", e)));
  return NextResponse.redirect(settingsUrl("connected"));
}
