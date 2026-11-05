"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AppLogo } from "@/components/app-logo";
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
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-rail p-6">
      <AppLogo size={40} />
      <h1 className="text-[22px] font-medium tracking-tight">Sign in to tt.</h1>
      <p className="-mt-2 text-[13px] text-muted">Your calendar and to-dos on one timeline.</p>
      {error && <p className="text-sm text-risk">{ERRORS[error] ?? ERRORS.signin}</p>}
      <button onClick={signIn} className="rounded-lg bg-ink px-4 py-2 text-[13px] text-white hover:opacity-90">
        Sign in with Google
      </button>
      {DEMO && <DemoSignIn />}
      <p className="mt-2 max-w-xs text-center text-[12px] leading-relaxed text-muted">
        By signing in you agree to the{" "}
        <a href="/terms" className="underline hover:text-ink">
          Terms
        </a>{" "}
        and{" "}
        <a href="/privacy" className="underline hover:text-ink">
          Privacy Policy
        </a>
        .
      </p>
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
