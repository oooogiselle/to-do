"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase/browser";

const ERRORS: Record<string, string> = {
  not_allowed: "That Google account isn't allowed to use this app.",
  signin: "Sign-in failed. Please try again.",
};

// Set only by `pnpm demo`, which seeds this local account.
const DEMO = process.env.NEXT_PUBLIC_DEMO === "1";

function LoginForm() {
  const error = useSearchParams().get("error");
  const signIn = () =>
    createBrowserSupabase().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6">
      <h1 className="text-2xl font-semibold">Timeline To-Do</h1>
      {error && <p className="text-sm text-risk">{ERRORS[error] ?? ERRORS.signin}</p>}
      <button onClick={signIn} className="rounded-md bg-ink px-4 py-2 text-paper hover:opacity-90">
        Sign in with Google
      </button>
      {DEMO && <DemoSignIn />}
    </main>
  );
}

function DemoSignIn() {
  const [failed, setFailed] = useState(false);
  const signIn = async () => {
    const { error } = await createBrowserSupabase().auth.signInWithPassword({
      email: "demo@example.com",
      password: "demo-password-123",
    });
    if (error) setFailed(true);
    else window.location.assign("/");
  };
  return (
    <>
      <button onClick={signIn} className="text-muted underline hover:text-ink">
        Use demo account
      </button>
      {failed && (
        <p className="text-sm text-risk">Demo account not found. Run `pnpm demo` again.</p>
      )}
    </>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
