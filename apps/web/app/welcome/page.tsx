import type { Metadata } from "next";
import Link from "next/link";
import { AppLogo } from "@/components/app-logo";

export const metadata: Metadata = {
  title: "Timeline: your calendar and to-dos on one timeline",
  description:
    "See what's due next to what's on your Google Calendar, and find open time to get it done.",
};

const FEATURES = [
  {
    title: "One timeline",
    body: "Your Google Calendar events and your to-dos side by side, so you can see what's due next to what's already booked.",
  },
  {
    title: "Finds the time",
    body: "Pick a task and get suggestions for open slots that fit, then put it on your calendar in one click.",
  },
  {
    title: "Breaks big tasks down",
    body: "Turn a vague task into steps with time estimates, or import tasks from pasted text or a syllabus. You review everything before it's saved.",
  },
];

// Public page: signed-out visitors to "/" are rewritten here by middleware.ts.
export default function WelcomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-rail">
      <header className="mx-auto flex w-full max-w-4xl items-center justify-between px-4 py-4">
        <AppLogo size={28} />
        <Link href="/login" className="rounded-lg px-3 py-1.5 text-[13px] text-ink hover:bg-chip">
          Sign in
        </Link>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 pb-16 pt-12 sm:pt-20">
        <h1 className="max-w-2xl text-[32px] font-medium leading-tight tracking-tight sm:text-[44px]">
          Your calendar and to-dos on one timeline.
        </h1>
        <p className="mt-4 max-w-xl text-[16px] leading-relaxed text-muted">
          See what&apos;s due next to what&apos;s on your calendar, and let the app find the time to
          get it done.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            href="/login"
            className="rounded-lg bg-ink px-5 py-2.5 text-[14px] text-white hover:opacity-90"
          >
            Get started with Google
          </Link>
          <span className="text-[13px] text-muted">Free while in beta.</span>
        </div>

        <ul className="mt-16 grid gap-4 sm:grid-cols-3">
          {FEATURES.map((f) => (
            <li key={f.title} className="rounded-2xl border border-line bg-surface p-5">
              <h2 className="text-[15px] font-medium text-ink">{f.title}</h2>
              <p className="mt-2 text-[13px] leading-relaxed text-muted">{f.body}</p>
            </li>
          ))}
        </ul>

        <p className="mt-10 max-w-2xl text-[13px] leading-relaxed text-muted">
          Connecting Google Calendar is optional and separate from signing in. The app reads events
          from the calendars you choose, and only ever writes to a calendar named &ldquo;Tasks&rdquo;
          that it creates. You can delete your account and all of your data from Settings at any
          time.
        </p>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-5 text-[13px] text-muted">
          <Link href="/privacy" className="hover:text-ink">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-ink">
            Terms
          </Link>
          <a href="mailto:support@tapestry-todo.com" className="hover:text-ink">
            support@tapestry-todo.com
          </a>
        </div>
      </footer>
    </div>
  );
}
