import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { signState } from "@/lib/crypto";
import { GOOGLE_SCOPES, oauthClient } from "@/lib/google";

/** Starts the server-side Google OAuth flow that grants Calendar access with a refresh token. */
export const GET = route(async (_req, { user }) => {
  const url = oauthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: GOOGLE_SCOPES,
    login_hint: user.email,
    state: signState(user.id),
  });
  return NextResponse.redirect(url);
});
