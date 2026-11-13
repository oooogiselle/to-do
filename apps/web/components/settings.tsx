"use client";

import { PageHeader } from "./page-header";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import {
  SCHEDULING_DEFAULTS,
  formatMinutes,
  swatch,
  type AssistantNotes,
  type SchedulingPrefs,
  type WorkingHours,
} from "@tt/shared";
import { api } from "@/lib/client/api";
import { keys, useCalendars, useDeleteAccount, useSettings, useUpdateSettings } from "@tt/client";
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

const chip = (active: boolean) =>
  `rounded-lg px-3 py-1.5 text-sm font-bold transition-colors ${active ? "bg-grape text-white" : "bg-chip text-chip-ink hover:bg-line"}`;

/** One row of choices; `undefined` is "no preference". */
function ChoiceRow<T extends string | number>({
  legend,
  options,
  value,
  onPick,
}: {
  legend: string;
  options: { value: T | undefined; label: string }[];
  value: T | undefined;
  onPick: (v: T | undefined) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-bold text-ink">{legend}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o.label}
            type="button"
            aria-pressed={value === o.value}
            onClick={() => onPick(o.value)}
            className={chip(value === o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/** How Ask tt. places blocks: focus time, longest session, breaks and a daily cap. */
function SchedulingSection({
  value,
  onChange,
}: {
  value: SchedulingPrefs;
  onChange: (v: SchedulingPrefs) => void;
}) {
  // The whole object is saved, so a choice of "no preference" drops its key.
  const set = <K extends keyof SchedulingPrefs>(key: K, v: SchedulingPrefs[K]) => {
    const next = { ...value };
    if (v === undefined) delete next[key];
    else next[key] = v;
    onChange(next);
  };
  const session = value.max_session_min ?? SCHEDULING_DEFAULTS.max_session_min;
  const pause = value.break_min ?? SCHEDULING_DEFAULTS.break_min;
  return (
    <Section title="Scheduling" description="Ask tt. follows these when it plans your time.">
      <div className="grid gap-5 sm:grid-cols-2">
        <ChoiceRow
          legend="Focus time"
          value={value.focus}
          onPick={(v) => set("focus", v)}
          options={[
            { value: undefined, label: "Any" },
            { value: "morning", label: "Morning" },
            { value: "afternoon", label: "Afternoon" },
            { value: "evening", label: "Evening" },
          ]}
        />
        <ChoiceRow
          legend="Longest session"
          value={session}
          onPick={(v) => set("max_session_min", v)}
          options={[45, 60, 90, 120, 180].map((m) => ({ value: m, label: formatMinutes(m) }))}
        />
        <ChoiceRow
          legend="Break between blocks"
          value={pause}
          onPick={(v) => set("break_min", v)}
          options={[0, 5, 10, 15].map((m) => ({ value: m, label: m ? formatMinutes(m) : "None" }))}
        />
        <ChoiceRow
          legend="Planned work per day"
          value={value.daily_cap_min}
          onPick={(v) => set("daily_cap_min", v)}
          options={[
            { value: undefined, label: "No cap" },
            ...[240, 360, 480].map((m) => ({ value: m, label: `Up to ${formatMinutes(m)}` })),
          ]}
        />
      </div>
    </Section>
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
        <PageHeader title="Settings" description="Calendar, time zone, working hours, scheduling and the Someday assistant." />
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

        <SchedulingSection
          value={settings.scheduling ?? {}}
          onChange={(scheduling) => updateSettings.mutate({ scheduling })}
        />
        <AssistantSection
          value={settings.someday_assistant ?? {}}
          onChange={(someday_assistant) => updateSettings.mutate({ someday_assistant })}
        />

        {updateSettings.isError && (
          <p className="text-sm font-semibold text-risk">
            Couldn&apos;t save: {updateSettings.error.message}
          </p>
        )}

        <DeleteAccountSection />

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

const NOTE_MAX = 1000;

const ASSISTANT_FIELDS: { key: keyof AssistantNotes; label: string; hint: string; placeholder: string }[] = [
  {
    key: "about",
    label: "About you",
    hint: "Every item's assistant reads this.",
    placeholder: "e.g. Busy university student in Boston. Free or cheap options first.",
  },
  {
    key: "goal",
    label: "Goal items (coach)",
    hint: "Plans, milestones and check-ins.",
    placeholder: "e.g. Keep plans to 3 hours a week. Be direct when I fall behind.",
  },
  {
    key: "learn",
    label: "Learn items (tutor)",
    hint: "Explanations, resources and study plans.",
    placeholder: "e.g. I learn best from videos and projects. I already know Python.",
  },
  {
    key: "idea",
    label: "Idea items (scout)",
    hint: "Options, costs and ways to try it.",
    placeholder: "e.g. Budget under $50. I don't have a car.",
  },
];

/** What the Someday assistant should know about the user, overall and per item type. */
function AssistantSection({
  value,
  onChange,
}: {
  value: AssistantNotes;
  onChange: (notes: AssistantNotes) => void;
}) {
  return (
    <Section
      title="Someday assistant"
      description="Tell each Someday assistant how to help you. Built-in safety rules always apply: links only come from real search results, and the assistant stays on the item."
    >
      <div className="space-y-4">
        {ASSISTANT_FIELDS.map((f) => (
          <NoteField
            key={f.key}
            id={`assistant-${f.key}`}
            label={f.label}
            hint={f.hint}
            placeholder={f.placeholder}
            value={value[f.key] ?? ""}
            onCommit={(text) => {
              const next = { ...value, [f.key]: text || undefined };
              if (!text) delete next[f.key];
              onChange(next);
            }}
          />
        ))}
      </div>
    </Section>
  );
}

/** A note that saves on blur. */
function NoteField({
  id,
  label,
  hint,
  placeholder,
  value,
  onCommit,
}: {
  id: string;
  label: string;
  hint: string;
  placeholder: string;
  value: string;
  onCommit: (text: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-bold text-ink">
          {label} <span className="font-medium text-muted">· {hint}</span>
        </label>
        {draft.length > NOTE_MAX * 0.8 && (
          <span className="text-[12px] text-muted">
            {draft.length}/{NOTE_MAX}
          </span>
        )}
      </div>
      <textarea
        id={id}
        value={draft}
        rows={2}
        maxLength={NOTE_MAX}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const text = draft.trim();
          if (text !== value) onCommit(text);
        }}
        className={`${field} block w-full resize-y font-medium`}
      />
    </div>
  );
}

function DeleteAccountSection() {
  const [confirming, setConfirming] = useState(false);
  const del = useDeleteAccount();

  return (
    <section className="rounded-2xl border border-line bg-surface p-5">
      <h2 className="text-base font-extrabold text-ink">Delete account</h2>
      <p className="mt-1 text-sm font-semibold text-muted">
        Permanently deletes your tasks, lists, plans and settings, removes the Tasks calendar this
        app created in Google Calendar, and disconnects Google. This can&apos;t be undone.
      </p>
      {!confirming ? (
        <button
          onClick={() => setConfirming(true)}
          className="mt-3 rounded-xl px-4 py-2 text-sm font-bold text-risk hover:bg-risk-bg"
        >
          Delete my account…
        </button>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            disabled={del.isPending}
            onClick={() =>
              del.mutate(undefined, {
                onSuccess: async () => {
                  await createBrowserSupabase().auth.signOut();
                  window.location.assign("/login");
                },
              })
            }
            className="rounded-xl bg-risk px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
          >
            {del.isPending ? "Deleting…" : "Yes, delete everything"}
          </button>
          <button
            disabled={del.isPending}
            onClick={() => setConfirming(false)}
            className="rounded-xl px-4 py-2 text-sm font-bold text-muted hover:text-ink"
          >
            Cancel
          </button>
        </div>
      )}
      {del.isError && (
        <p className="mt-2 text-sm font-semibold text-risk">
          Couldn&apos;t delete the account: {del.error.message}. Nothing was lost; try again.
        </p>
      )}
    </section>
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
