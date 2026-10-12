"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { createBrowserSupabase } from "@/lib/supabase/browser";

const ERRORS: Record<string, string> = {
  not_allowed: "That Google account isn't allowed to use this app.",
  signin: "Sign-in failed. Please try again.",
};

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
      {error && <p className="text-sm text-red-600">{ERRORS[error] ?? ERRORS.signin}</p>}
      <button
        onClick={signIn}
        className="rounded-md bg-neutral-900 px-4 py-2 text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900"
      >
        Sign in with Google
      </button>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
