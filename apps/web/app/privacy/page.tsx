import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy" };

// Public page: Google requires a privacy policy link to publish the OAuth app.
export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-4 px-4 py-10 leading-relaxed">
      <h1 className="text-2xl font-semibold tracking-tight">Privacy</h1>
      <p>
        Timeline is a personal app used by its owner. It isn&apos;t offered to the public, and only
        allowlisted Google accounts can sign in.
      </p>
      <h2 className="pt-2 text-lg font-semibold">What it accesses</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          <strong>Google Calendar.</strong> It reads events from the calendars you choose, to show
          them and to find open time. It writes only to a calendar named “Tasks” that it creates, to
          add, move and remove your scheduled task blocks. It never edits or deletes other events.
        </li>
        <li>
          <strong>Your Google email address</strong>, to sign you in.
        </li>
      </ul>
      <h2 className="pt-2 text-lg font-semibold">What it stores</h2>
      <p>
        Your tasks, lists and settings, a copy of the events from the calendars you chose, and an
        encrypted Google refresh token. These are stored in the app&apos;s own database and are
        never sold or shared.
      </p>
      <h2 className="pt-2 text-lg font-semibold">AI features</h2>
      <p>
        When you use Break down or Import, the task details, text or file you provide is sent to
        Anthropic&apos;s Claude API to produce suggestions. Uploaded files are deleted right after
        they are read.
      </p>
      <h2 className="pt-2 text-lg font-semibold">Removing access</h2>
      <p>
        You can revoke the app&apos;s access to your Google account at any time at{" "}
        <a href="https://myaccount.google.com/permissions" className="underline">
          myaccount.google.com/permissions
        </a>
        .
      </p>
    </main>
  );
}
