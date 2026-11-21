import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { signState } from "@/lib/crypto";
import { env } from "@/lib/env";
import { GOOGLE_NONCE_COOKIE, GOOGLE_SCOPES, oauthClient } from "@/lib/google";

/** Starts the server-side Google OAuth flow that grants Calendar access with a refresh token. */
export const GET = route(async (_req, { user }) => {
  // Ties the callback to this browser: the callback only accepts a state whose nonce matches
  // the cookie, so a consent link forwarded to someone else is useless.
  const nonce = randomBytes(16).toString("base64url");
  const url = oauthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: GOOGLE_SCOPES,
    login_hint: user.email,
    state: signState(user.id, nonce),
  });
  const res = NextResponse.redirect(url);
  res.cookies.set(GOOGLE_NONCE_COOKIE, nonce, {
    httpOnly: true,
    secure: env.appUrl.startsWith("https://"),
    // Lax still sends it on Google's top-level redirect back to the callback.
    sameSite: "lax",
    path: "/api/google/callback",
    maxAge: 600,
  });
  return res;
});
