"use client";

import { PageHeader } from "./page-header";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { formatMinutes, swatch, type WorkingHours } from "@tt/shared";
import { api } from "@/lib/client/api";
import { keys, useCalendars, useSettings, useUpdateSettings } from "@tt/client";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { Switch } from "@/components/ui/switch";

const GOOGLE_MESSAGES: Record<string, string> = {
  connected: "Google Calendar connected. Your calendars are syncing now.",
  missing_scope:
    "Calendar access wasn't granted. Connect again and allow access to your calendars.",
  error: "Connecting Google Calendar didn't finish. Try again.",
};
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const WEEKDAY_KEYS = ["1", "2", "3", "4", "5", "6", "0"] as const;

const field =
  "rounded-xl border border-line bg-surface px-3 py-2 text-sm font-semibold text-ink outline-none focus:border-sky focus:ring-2 focus:ring-sky/20";

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
    <section className="rounded-2xl border border-line bg-surface p-5">
      <h2 className="text-base font-extrabold text-ink">{title}</h2>
      {description && <p className="mb-4 text-sm text-chip-ink">{description}</p>}
      <div className={description ? "" : "mt-3"}>{children}</div>
    </section>
  );
}

/** Google's four-color mark, drawn as rounded squares like the app logo. */
function GoogleMark() {
  return (
    <div className="grid h-12 w-12 shrink-0 grid-cols-2 gap-1 rounded-xl bg-paper p-2" aria-hidden>
      <span className="rounded-sm bg-[#4285f4]" />
      <span className="rounded-sm bg-[#ea4335]" />
      <span className="rounded-sm bg-[#fbbc04]" />
      <span className="rounded-sm bg-[#34a853]" />
    </div>
  );
}

function SyncButton() {
  const qc = useQueryClient();
  const sync = useMutation({
    mutationFn: () => api.refreshCalendars(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["events"] }),
  });
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => sync.mutate()}
        disabled={sync.isPending}
        className="flex items-center gap-2 rounded-xl bg-mint px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-[#4e9677] disabled:opacity-70"
      >
        <RefreshCw className={`h-4 w-4 ${sync.isPending ? "animate-spin" : ""}`} />
        {sync.isPending ? "Syncing…" : sync.isSuccess ? "Synced" : "Sync now"}
      </button>
      {sync.isError && <span className="text-[12px] text-risk">{sync.error.message}</span>}
    </div>
  );
}

export function SettingsView() {
  const googleStatus = useSearchParams().get("google");
  const { data, isLoading } = useSettings();
  const updateSettings = useUpdateSettings();

  if (isLoading || !data) return <p className="p-6 font-semibold text-muted">Loading…</p>;
  const { settings, google } = data;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-5 p-4 md:p-8">
        <PageHeader title="Settings" description="Calendar, time zone and working hours." />
        {googleStatus && (
          <p
            className={`rounded-xl px-4 py-3 text-sm font-semibold ${googleStatus === "connected" ? "bg-open text-open-ink" : "bg-risk-bg text-risk"}`}
          >
            {GOOGLE_MESSAGES[googleStatus] ?? GOOGLE_MESSAGES.error}
          </p>
        )}

        <section className="flex flex-wrap items-center gap-4 rounded-2xl border border-line bg-surface p-5">
          <GoogleMark />
          <div className="mr-auto min-w-0">
            <h2 className="text-base font-extrabold text-ink">Google account</h2>
            <p className={`text-sm ${google?.needs_reconnect ? "font-semibold text-warn" : "text-chip-ink"}`}>
              {google?.needs_reconnect ? (
                `Access for ${google.email} expired. Reconnect to keep your calendar in sync.`
              ) : google ? (
                <>
                  Connected as <span className="font-bold text-ink">{google.email}</span>
                </>
              ) : (
                "Not connected. Connect to see your events and find open time."
              )}
            </p>
          </div>
          {google && !google.needs_reconnect && <SyncButton />}
          <a
            href="/api/google/connect"
            className={`rounded-xl px-4 py-2 text-sm font-bold ${google && !google.needs_reconnect ? "border border-line text-ink hover:bg-paper" : "bg-ink text-white hover:opacity-90"}`}
          >
            {google ? "Reconnect" : "Connect Google Calendar"}
          </a>
        </section>

        {google && <CalendarsSection />}

        <Section
          title="Working hours"
          description="&ldquo;Find time&rdquo; and open time only look inside these hours."
        >
          <WorkingHoursEditor
            value={settings.working_hours}
            onChange={(working_hours) => updateSettings.mutate({ working_hours })}
          />
        </Section>

        <section className="grid gap-6 rounded-2xl border border-line bg-surface p-5 sm:grid-cols-2">
          <fieldset>
            <legend className="mb-3 text-base font-extrabold text-ink">Default block length</legend>
            <div className="flex flex-wrap gap-1.5">
              {[15, 30, 45, 60, 90, 120].map((m) => {
                const active = settings.default_block_min === m;
                return (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={active}
                    onClick={() => updateSettings.mutate({ default_block_min: m })}
                    className={`rounded-lg px-3 py-1.5 text-sm font-bold transition-colors ${active ? "bg-grape text-white" : "bg-chip text-chip-ink hover:bg-line"}`}
                  >
                    {formatMinutes(m)}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[12px] text-muted">Used for tasks and steps without an estimate.</p>
          </fieldset>
          <TimezoneField
            value={settings.timezone}
            onChange={(timezone) => updateSettings.mutate({ timezone })}
          />
        </section>
        {updateSettings.isError && (
          <p className="text-sm font-semibold text-risk">
            Couldn&apos;t save: {updateSettings.error.message}
          </p>
        )}

        <div className="flex items-center justify-end gap-2 pb-6">
          <a href="/privacy" className="rounded-xl px-3 py-2 text-sm font-bold text-muted hover:text-ink">
            Privacy
          </a>
          <button
            onClick={async () => {
              await createBrowserSupabase().auth.signOut();
              window.location.assign("/login");
            }}
            className="rounded-xl px-4 py-2 text-sm font-bold text-risk hover:bg-risk-bg"
          >
            Sign out
          </button>
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
      description="Events from these calendars show on your timeline and count as busy."
    >
      <ul className="space-y-2">
        {calendars?.map((cal) => {
          const c = swatch(cal.color);
          const on = cal.selected;
          return (
            <li
              key={cal.id}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5"
              style={{ background: on ? c.tint : "var(--paper)" }}
            >
              <span
                className="h-3.5 w-3.5 shrink-0 rounded"
                style={{ background: on ? c.solid : "#c4c7d4" }}
                aria-hidden
              />
              <span className="min-w-0 truncate text-sm font-bold" style={{ color: on ? c.ink : "#8a8fa6" }}>
                {cal.summary}
              </span>
              {cal.is_tasks_calendar && (
                <span className="text-[12px] font-semibold text-muted">where scheduled tasks go</span>
              )}
              <span className="ml-auto">
                <Switch
                  checked={on}
                  color={c.solid}
                  label={`Show ${cal.summary}`}
                  disabled={cal.is_tasks_calendar || toggle.isPending}
                  onChange={(selected) => toggle.mutate({ id: cal.id, selected })}
                />
              </span>
            </li>
          );
        })}
      </ul>
      {toggle.isError && <p className="mt-2 text-sm text-risk">{toggle.error.message}</p>}
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
    <div className="grid grid-cols-[8.5rem_auto_1fr] items-center gap-x-3 gap-y-2">
      {WEEKDAY_KEYS.map((key, i) => {
        const hours = draft[key] ?? null;
        return (
          <div key={key} className="contents">
            <label className="flex items-center gap-2.5 text-sm font-bold text-ink">
              <Switch
                checked={!!hours}
                label={`Work on ${WEEKDAYS[i]}`}
                color="var(--tt-grape)"
                onChange={(on) => set(key, on ? { start: "09:00", end: "17:00" } : null)}
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
                <span className="text-sm font-bold text-muted">to</span>
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
              <span className="text-sm font-semibold text-faint">Day off</span>
            )}
            <span className="text-[12px] font-semibold text-risk">
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
    <label className="block">
      <span className="mb-3 block text-base font-extrabold text-ink">Timezone</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${field} w-full`}
      >
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
          className="mt-2 text-[12px] font-semibold text-muted underline hover:text-ink"
        >
          Use this device&apos;s ({deviceTz.replaceAll("_", " ")})
        </button>
      )}
    </label>
  );
}
