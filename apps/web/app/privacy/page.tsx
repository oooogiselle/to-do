import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Privacy" };

const UPDATED = "November 5, 2026";

// Public page: Google requires a privacy policy link to publish the OAuth app.
export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-4 px-4 py-10 leading-relaxed">
      <h1 className="text-2xl font-semibold tracking-tight">Privacy</h1>
      <p className="text-muted">Last updated {UPDATED}</p>
      <p>
        This app puts your Google Calendar events and your to-dos on one timeline. It is a personal
        project run by Giselle Wu, offered free while in beta. This page explains what it accesses,
        what it stores, and who it shares data with. Questions:{" "}
        <a href="mailto:support@tapestry-todo.com" className="underline">
          support@tapestry-todo.com
        </a>
        .
      </p>

      <h2 className="pt-2 text-lg font-semibold">What it accesses</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          <strong>Your Google email address</strong>, to sign you in.
        </li>
        <li>
          <strong>Google Calendar</strong>, only if you choose to connect it (this is a separate
          step from signing in). The app reads events from the calendars you choose, to show them
          and to find open time. It writes only to a calendar named &ldquo;Tasks&rdquo; that it
          creates, to add, move and remove your scheduled task blocks. It never edits or deletes
          events on your other calendars.
        </li>
      </ul>

      <h2 className="pt-2 text-lg font-semibold">What it stores</h2>
      <p>
        Your tasks, steps, lists, daily plan and settings; a copy of the events from the calendars
        you chose; records of imports you ran; how much AI you&apos;ve used (token counts and cost,
        to enforce a monthly limit); and, if you connect Google Calendar, an encrypted Google
        refresh token. This is kept in the app&apos;s database. Tasks you delete are hidden
        immediately and stay in the database until you delete your account.
      </p>
      <p>
        The app uses cookies only to keep you signed in. It has no advertising or tracking cookies.
      </p>

      <h2 className="pt-2 text-lg font-semibold">AI features</h2>
      <p>
        When you use Break down or Import, the task details, text or file you provide is sent to
        Anthropic&apos;s Claude API to produce suggestions. Uploaded files are deleted right after
        they are read. Please don&apos;t include sensitive information in what you send.
      </p>

      <h2 className="pt-2 text-lg font-semibold">Who it&apos;s shared with</h2>
      <p>
        Your data is never sold, and not shared except with the services that run the app, each only
        for that purpose:
      </p>
      <ul className="list-disc space-y-1 pl-5">
        <li>Supabase, which hosts the database and sign-in;</li>
        <li>Vercel, which hosts the app;</li>
        <li>Google, for sign-in and Calendar, as you authorize;</li>
        <li>Anthropic, for the AI features above, only when you use them.</li>
      </ul>

      <h2 className="pt-2 text-lg font-semibold">Google user data</h2>
      <p>
        The app&apos;s use and transfer to any other app of information received from Google APIs
        will adhere to the{" "}
        <a
          href="https://developers.google.com/terms/api-services-user-data-policy"
          className="underline"
        >
          Google API Services User Data Policy
        </a>
        , including the Limited Use requirements. Google Calendar data is used only to provide the
        timeline and scheduling features you see in the app. It is not used for advertising, not
        sold, and not used to train AI models.
      </p>

      <h2 className="pt-2 text-lg font-semibold">Deleting your data</h2>
      <p>
        You can delete your account from Settings. That permanently removes your tasks, lists,
        settings and stored calendar copy, deletes the &ldquo;Tasks&rdquo; calendar the app created,
        and revokes the app&apos;s access to your Google account. You can also revoke access at any
        time at{" "}
        <a href="https://myaccount.google.com/permissions" className="underline">
          myaccount.google.com/permissions
        </a>
        . To ask for help or a copy of your data, email the address above.
      </p>

      <h2 className="pt-2 text-lg font-semibold">Children</h2>
      <p>
        The app isn&apos;t meant for children under 13, and I don&apos;t knowingly collect their
        data.
      </p>

      <h2 className="pt-2 text-lg font-semibold">Changes</h2>
      <p>
        If this policy changes, the date above will change, and I&apos;ll say so in the app if the
        change is significant. See also the{" "}
        <Link href="/terms" className="underline">
          terms of use
        </Link>
        .
      </p>
    </main>
  );
}
