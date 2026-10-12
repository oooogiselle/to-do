"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { WorkingHours } from "@tt/shared";
import { api } from "@/lib/client/api";
import { keys, useCalendars, useSettings, useUpdateSettings } from "@/lib/client/data";
import { createBrowserSupabase } from "@/lib/supabase/browser";

const GOOGLE_MESSAGES: Record<string, string> = {
  connected: "Google Calendar connected. Your calendars are syncing now.",
  missing_scope:
    "Calendar access wasn't granted. Connect again and allow access to your calendars.",
  error: "Connecting Google Calendar didn't finish. Try again.",
};
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const WEEKDAY_KEYS = ["1", "2", "3", "4", "5", "6", "0"] as const;

const field =
  "rounded-md border border-line bg-paper px-2.5 py-1.5 outline-none focus:border-line-strong";

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 border-b border-line pb-6">
      <div>
        <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
        {description && <p className="text-muted">{description}</p>}
      </div>
      {children}
    </section>
  );
}

export function SettingsView() {
  const googleStatus = useSearchParams().get("google");
  const { data, isLoading } = useSettings();
  const updateSettings = useUpdateSettings();

  if (isLoading || !data) return <p className="p-6 text-muted">Loading…</p>;
  const { settings, google } = data;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl space-y-6 px-4 py-5">
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        {googleStatus && (
          <p
            className={`rounded-md border px-3 py-2 ${googleStatus === "connected" ? "border-open-ink/30 bg-open text-open-ink" : "border-risk/30 text-risk"}`}
          >
            {GOOGLE_MESSAGES[googleStatus] ?? GOOGLE_MESSAGES.error}
          </p>
        )}

        <Section title="Google account">
          <div className="flex flex-wrap items-center gap-3">
            <span className={google?.needs_reconnect ? "text-warn" : google ? "" : "text-muted"}>
              {google?.needs_reconnect
                ? `Access for ${google.email} expired. Reconnect to keep your calendar in sync.`
                : google
                  ? `Connected as ${google.email}`
                  : "Not connected"}
            </span>
            <a
              href="/api/google/connect"
              className={`rounded-md px-3 py-1.5 ${google?.needs_reconnect ? "bg-ink text-paper hover:opacity-90" : "border border-line-strong hover:border-ink"}`}
            >
              {google ? "Reconnect" : "Connect Google Calendar"}
            </a>
          </div>
        </Section>

        {google && <CalendarsSection />}

        <Section title="Working hours" description="Open time is only found inside these hours.">
          <WorkingHoursEditor
            value={settings.working_hours}
            onChange={(working_hours) => updateSettings.mutate({ working_hours })}
          />
        </Section>

        <Section title="Scheduling">
          <label className="flex items-center gap-3">
            <span className="w-40 text-muted">Default block length</span>
            <select
              value={settings.default_block_min}
              onChange={(e) => updateSettings.mutate({ default_block_min: Number(e.target.value) })}
              className={field}
            >
              {[15, 30, 45, 60, 90, 120].map((m) => (
                <option key={m} value={m}>
                  {m} minutes
                </option>
              ))}
            </select>
          </label>
          <TimezoneField
            value={settings.timezone}
            onChange={(timezone) => updateSettings.mutate({ timezone })}
          />
        </Section>
        {updateSettings.isError && (
          <p className="text-risk">Couldn&apos;t save: {updateSettings.error.message}</p>
        )}

        <div className="flex items-center gap-4 pb-6">
          <button
            onClick={async () => {
              await createBrowserSupabase().auth.signOut();
              window.location.assign("/login");
            }}
            className="rounded-md border border-line-strong px-3 py-1.5 hover:border-ink"
          >
            Sign out
          </button>
          <a href="/privacy" className="text-muted underline hover:text-ink">
            Privacy
          </a>
        </div>
      </div>
    </div>
  );
}

function CalendarsSection() {
  const qc = useQueryClient();
  const { data: calendars } = useCalendars();
  const toggle = useMutation({
    mutationFn: ({ id, selected }: { id: string; selected: boolean }) =>
      api.setCalendarSelected(id, selected),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.calendars });
      // Events arrive once the server finishes syncing; realtime refetches them.
      qc.invalidateQueries({ queryKey: ["events"] });
    },
  });
  return (
    <Section
      title="Calendars"
      description="Events on checked calendars count as busy and show on the timeline."
    >
      <ul className="space-y-1.5">
        {calendars?.map((c) => (
          <li key={c.id}>
            <label className="flex items-center gap-2.5">
              <input
                type="checkbox"
                checked={c.selected}
                disabled={c.is_tasks_calendar || toggle.isPending}
                onChange={(e) => toggle.mutate({ id: c.id, selected: e.target.checked })}
              />
              <span
                className="size-2.5 rounded-full"
                style={{ background: c.color ?? "var(--line-strong)" }}
                aria-hidden
              />
              <span>{c.summary}</span>
              {c.is_tasks_calendar && <span className="text-muted">where scheduled tasks go</span>}
            </label>
          </li>
        ))}
      </ul>
      {toggle.isError && <p className="text-risk">{toggle.error.message}</p>}
    </Section>
  );
}

function WorkingHoursEditor({
  value,
  onChange,
}: {
  value: WorkingHours;
  onChange: (v: WorkingHours) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const set = (key: (typeof WEEKDAY_KEYS)[number], hours: WorkingHours[typeof key]) => {
    const next = { ...draft, [key]: hours };
    setDraft(next);
    const valid = Object.values(next).every((h) => !h || h.start < h.end);
    if (valid) onChange(next);
  };
  return (
    <div className="grid grid-cols-[7rem_auto_1fr] items-center gap-x-3 gap-y-2">
      {WEEKDAY_KEYS.map((key, i) => {
        const hours = draft[key] ?? null;
        return (
          <div key={key} className="contents">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={!!hours}
                onChange={(e) =>
                  set(key, e.target.checked ? { start: "09:00", end: "17:00" } : null)
                }
              />
              {WEEKDAYS[i]}
            </label>
            {hours ? (
              <div className="flex items-center gap-2">
                <input
                  type="time"
                  step={900}
                  aria-label={`${WEEKDAYS[i]} start`}
                  value={hours.start}
                  onChange={(e) => set(key, { ...hours, start: e.target.value })}
                  className={field}
                />
                <span className="text-muted">to</span>
                <input
                  type="time"
                  step={900}
                  aria-label={`${WEEKDAYS[i]} end`}
                  value={hours.end}
                  onChange={(e) => set(key, { ...hours, end: e.target.value })}
                  className={field}
                />
              </div>
            ) : (
              <span className="text-muted">Day off</span>
            )}
            <span className="text-xs text-risk">
              {hours && hours.start >= hours.end ? "End must be after start" : ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function TimezoneField({ value, onChange }: { value: string; onChange: (tz: string) => void }) {
  const zones =
    typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [value];
  const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return (
    <label className="flex flex-wrap items-center gap-3">
      <span className="w-40 text-muted">Time zone</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={field}>
        {(zones.includes(value) ? zones : [value, ...zones]).map((z) => (
          <option key={z} value={z}>
            {z.replaceAll("_", " ")}
          </option>
        ))}
      </select>
      {deviceTz !== value && (
        <button
          type="button"
          onClick={() => onChange(deviceTz)}
          className="text-xs text-muted underline hover:text-ink"
        >
          Use this device&apos;s ({deviceTz.replaceAll("_", " ")})
        </button>
      )}
    </label>
  );
}
